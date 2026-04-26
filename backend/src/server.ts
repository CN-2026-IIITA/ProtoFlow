import cors from "cors";
import express from "express";
import http from "node:http";
import { WebSocketServer } from "ws";
import { analyseSnapshot } from "./eventLogger";
import { Prober } from "./prober";
import { compareProtocols } from "./protocols";
import { decideBestProtocol } from "./switcher";
import { ControlState, EventLog, OptimizerSnapshot, ProtocolName } from "./types";
import { routeRequest } from "./router/router";

const PORT = Number(process.env.BACKEND_PORT ?? 4317);

class OptimizerEngine {
    private control: ControlState;
    private prober: Prober;
    private timer: NodeJS.Timeout | null = null;
    private runningCycle = false;
    private latestSnapshot: OptimizerSnapshot | null = null;
    private readonly listeners = new Set<(snapshot: OptimizerSnapshot) => void>();

    constructor() {
        this.control = {
            running: true,
            mode: "auto",
            targetUrl: process.env.TARGET_URL ?? "https://cloudflare-quic.com/",
            probeHost: process.env.PROBE_HOST ?? "1.1.1.1",
            probePort: Number(process.env.PROBE_PORT ?? 443),
            intervalMs: Number(process.env.PROBE_INTERVAL_MS ?? 2000),
            mockMode: process.env.MOCK_MODE === "1" || process.env.MOCK_MODE === "true",
            timeoutMs: 1000,
            turboMode: false,
            trafficType: "reliable",
        };

        this.prober = new Prober({
            mockMode: this.control.mockMode,
            probeHost: this.control.probeHost,
            probePort: this.control.probePort,
            timeoutMs: this.control.timeoutMs,
        });
    }

    addListener(listener: (snapshot: OptimizerSnapshot) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getSnapshot(): OptimizerSnapshot | null {
        return this.latestSnapshot;
    }

    getProber(): Prober {
        return this.prober;
    }

    getControlState(): ControlState {
        return { ...this.control };
    }

    start(): void {
        if (this.timer || !this.control.running) return;

        this.runCycle().catch(error => {
            console.error("[optimizer] Initial cycle failed", error);
        });

        this.timer = setInterval(() => {
            void this.runCycle();
        }, this.control.intervalMs);

        console.log(`[optimizer] started, interval=${this.control.intervalMs}ms, native=${this.prober.usingNative}`);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log("[optimizer] stopped");
        }
    }

    updateControl(patch: Partial<ControlState>): ControlState {
        this.control = { ...this.control, ...patch };

        if (patch.mode === "auto") {
            this.control.manualProtocol = undefined;
        }

        const shouldRecreateProber =
            patch.mockMode !== undefined || patch.probeHost !== undefined || patch.probePort !== undefined || patch.timeoutMs !== undefined;

        if (shouldRecreateProber) {
            this.prober = new Prober({
                mockMode: this.control.mockMode,
                probeHost: this.control.probeHost,
                probePort: this.control.probePort,
                timeoutMs: this.control.timeoutMs,
            });
            console.log(`[optimizer] prober updated, native=${this.prober.usingNative}`);
        }

        if (this.timer && patch.intervalMs && patch.intervalMs > 0) {
            clearInterval(this.timer);
            this.timer = setInterval(() => {
                void this.runCycle();
            }, this.control.intervalMs);
        }

        this.control.running ? this.start() : this.stop();

        return this.getControlState();
    }

    private async runCycle(): Promise<void> {
        if (!this.control.running || this.runningCycle) return;

        this.runningCycle = true;

        try {
            const network = await this.prober.getNetworkStats();
            const protocols = await compareProtocols(
                this.control.targetUrl,
                this.prober,
                network,
                this.latestSnapshot?.protocols,
                simulationConfig
            );
            const decision = decideBestProtocol(protocols, network, this.control);

            const snapshot: OptimizerSnapshot = {
                timestamp: Date.now(),
                network,
                protocols,
                decision,
                control: this.getControlState(),
            };

            this.latestSnapshot = snapshot;

            for (const listener of this.listeners) {
                listener(snapshot);
            }

            console.log(
                `[optimizer] ${new Date(snapshot.timestamp).toISOString()} best=${decision.bestProtocol} confidence=${decision.confidence}% source=${network.source}`,
            );
        } catch (error) {
            console.error("[optimizer] cycle error", error);
        } finally {
            this.runningCycle = false;
        }
    }
}

export const engine = new OptimizerEngine();
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(cors());
app.use(express.json());

export let simulationConfig: any = null;

// ---------- EVENT LOG RING BUFFER ----------
const MAX_EVENT_LOGS = 100;
const eventLogs: EventLog[] = [];
let previousBestProtocol: ProtocolName | null = null;

function pushEvents(snapshot: OptimizerSnapshot): void {
    const newEvents = analyseSnapshot(snapshot, previousBestProtocol);
    previousBestProtocol = snapshot.decision.bestProtocol;

    if (newEvents.length === 0) return;

    // append, trim front if over limit
    eventLogs.push(...newEvents);
    if (eventLogs.length > MAX_EVENT_LOGS) {
        eventLogs.splice(0, eventLogs.length - MAX_EVENT_LOGS);
    }

    // broadcast each new event to all open clients
    const encoded = newEvents.map(e => JSON.stringify({ type: "EVENT_LOG", data: e }));
    wss.clients.forEach((ws: any) => {
        if (ws.readyState === ws.OPEN) {
            for (const msg of encoded) ws.send(msg);
        }
    });
}

// ---------- REST ----------
app.get("/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
});

app.get("/config", (_req, res) => {
    const control = engine.getControlState();
    res.json({
        autoSwitch: control.mode === "auto",
        preferredProtocol: control.manualProtocol || "http2",
        probeInterval: control.intervalMs,
        timeout: control.timeoutMs,
        turboMode: control.turboMode,
    });
});

app.post("/config", (req, res) => {
    const { autoSwitch, preferredProtocol, probeInterval, timeout, turboMode } = req.body;
    
    engine.updateControl({
        mode: autoSwitch ? "auto" : "manual",
        manualProtocol: autoSwitch ? undefined : preferredProtocol,
        intervalMs: typeof probeInterval === "number" ? probeInterval : undefined,
        timeoutMs: typeof timeout === "number" ? timeout : undefined,
        turboMode: typeof turboMode === "boolean" ? turboMode : undefined,
    });

    const control = engine.getControlState();
    res.json({
        autoSwitch: control.mode === "auto",
        preferredProtocol: control.manualProtocol || "http2",
        probeInterval: control.intervalMs,
        timeout: control.timeoutMs,
        turboMode: control.turboMode,
    });
});

app.get("/snapshot", (_req, res) => {
    const snapshot = engine.getSnapshot();
    if (!snapshot) {
        return res.json({
            timestamp: Date.now(),
            network: { rttMs: 0, jitterMs: 0, packetLoss: 0, source: "init" },
            protocols: {},
            decision: {
                bestProtocol: "http2",
                confidence: 0,
                reason: "Initializing...",
            },
            control: engine.getControlState(),
        });
    }
    res.json(snapshot);
});

app.post("/simulate", (req, res) => {
    if (Object.keys(req.body).length === 0) {
        simulationConfig = null;
    } else {
        simulationConfig = req.body;
    }
    res.json({ ok: true, simulationConfig });
});

app.post("/request", async (req, res) => {
    try {
        const { url, method, headers, body } = req.body;
        if (!url) {
            return res.status(400).json({ error: "Missing 'url' in body" });
        }

        const response = await routeRequest({
            url,
            method: method || "GET",
            headers,
            body: typeof body === "string" ? body : JSON.stringify(body)
        });

        // We can't easily serialize the entire Fetch Response stream back to Express.
        // We'll read the body as text and return it.
        const responseText = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        res.status(response.status).json({
            protocol: responseHeaders["x-router-protocol"] || "unknown",
            latencyMs: responseHeaders["x-router-latency"] || "unknown",
            status: response.status,
            headers: responseHeaders,
            body: responseText
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- WEBSOCKET ----------
wss.on("connection", ws => {
    (ws as any).isAlive = true;

    ws.on("pong", () => {
        (ws as any).isAlive = true;
    });

    // send latest snapshot on connect
    const snapshot = engine.getSnapshot();
    if (snapshot) {
        ws.send(JSON.stringify({ type: "snapshot", data: snapshot }));
    }

    // replay buffered event logs for this new client
    for (const log of eventLogs) {
        ws.send(JSON.stringify({ type: "EVENT_LOG", data: log }));
    }

    // subscribe to live updates
    const unsubscribe = engine.addListener(nextSnapshot => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "update", data: nextSnapshot }));
        }
        pushEvents(nextSnapshot);
    });

    ws.on("close", () => {
        unsubscribe();
    });
});

// 🔥 HEARTBEAT (FIXES DISCONNECTS)
setInterval(() => {
    wss.clients.forEach((ws: any) => {
        if (!ws.isAlive) return ws.terminate();

        ws.isAlive = false;
        ws.ping();
    });
}, 5000);

// ---------- START ----------
server.listen(PORT, () => {
    console.log(`[server] Dynamic Multi-Protocol Traffic Optimizer backend listening on http://localhost:${PORT}`);
    console.log(`[server] websocket endpoint ws://localhost:${PORT}/ws`);
    engine.start();
});
