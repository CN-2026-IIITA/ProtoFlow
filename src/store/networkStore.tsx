import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useWebSocket, type SocketConnectionStatus } from "../hooks/useWebSocket";

const API_BASE = import.meta.env.VITE_BACKEND_BASE_URL ?? "http://localhost:4317";
const SOCKET_URL = import.meta.env.VITE_BACKEND_WS_URL ?? "ws://localhost:4317/ws";
const MAX_HISTORY = 50;
const MAX_CHART_POINTS = 50;

type ProtocolName = "http2" | "http3" | "udp";

type ControlMode = "auto" | "manual";

interface NetworkStats {
    timestamp: number;
    rttMs: number;
    jitterMs: number;
    packetLoss: number;
    sampleCount: number;
    source: "native" | "mock";
}

interface ProtocolSample {
    protocol: ProtocolName;
    latencyMs: number;
    throughputMbps: number;
    packetLoss: number;
    success: boolean;
    error?: string;
}

interface ProtocolComparison {
    http2: ProtocolSample;
    http3: ProtocolSample;
    udp: ProtocolSample;
}

interface ProtocolScores {
    http2: number;
    http3: number;
    udp: number;
}

interface Decision {
    bestProtocol: ProtocolName;
    confidence: number;
    reason: string;
    scores: ProtocolScores;
    mode: ControlMode;
    manualProtocol?: ProtocolName;
}

interface ControlState {
    running: boolean;
    mode: ControlMode;
    manualProtocol?: ProtocolName;
    targetUrl: string;
    probeHost: string;
    probePort: number;
    intervalMs: number;
    mockMode: boolean;
}

interface Snapshot {
    timestamp: number;
    network: NetworkStats;
    protocols: ProtocolComparison;
    decision: Decision;
    control: ControlState;
}

interface SocketPayload {
    type: "snapshot" | "update";
    data: unknown;
}

export interface SwitchLogEntry {
    timestamp: number;
    from: ProtocolName | null;
    to: ProtocolName;
    reason: string;
    confidence: number;
}

export interface ThroughputHistoryPoint {
    time: number;
    latency: number;
    throughput: number;
}

export interface ProtocolHistoryPoint {
    time: number;
    http2: number;
    http3: number;
    udp: number;
}

interface NetworkStoreValue {
    metrics: NetworkStats | null;
    protocols: ProtocolComparison | null;
    decision: Decision | null;
    control: ControlState | null;
    connectionStatus: SocketConnectionStatus;
    isLoading: boolean;
    error: string | null;
    lastUpdated: number | null;
    switchHistory: SwitchLogEntry[];
    throughputHistory: ThroughputHistoryPoint[];
    protocolHistory: ProtocolHistoryPoint[];
    refreshSnapshot: () => Promise<void>;
    postControl: (payload: Record<string, unknown>) => Promise<void>;
    setMode: (mode: ControlMode) => Promise<void>;
    setManualProtocol: (protocol: ProtocolName) => Promise<void>;
    toggleRunning: () => Promise<void>;
    clearHistory: () => void;
}

const NetworkStoreContext = createContext<NetworkStoreValue | null>(null);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function asProtocol(value: unknown): ProtocolName {
    return value === "http2" || value === "http3" || value === "udp" ? value : "http3";
}

function asMode(value: unknown): ControlMode {
    return value === "manual" ? "manual" : "auto";
}

function parseSnapshot(raw: unknown): Snapshot | null {
    if (!isObjectRecord(raw)) {
        return null;
    }

    const networkRaw = isObjectRecord(raw.network) ? raw.network : null;
    const protocolsRaw = isObjectRecord(raw.protocols) ? raw.protocols : null;
    const decisionRaw = isObjectRecord(raw.decision) ? raw.decision : null;
    const controlRaw = isObjectRecord(raw.control) ? raw.control : null;

    if (!networkRaw || !protocolsRaw || !decisionRaw || !controlRaw) {
        return null;
    }

    const parseProtocolSample = (sample: unknown, protocol: ProtocolName): ProtocolSample => {
        const payload = isObjectRecord(sample) ? sample : {};
        return {
            protocol,
            latencyMs: asNumber(payload.latencyMs, 0),
            throughputMbps: asNumber(payload.throughputMbps, 0),
            packetLoss: asNumber(payload.packetLoss, 1),
            success: asBoolean(payload.success, false),
            error: asString(payload.error, "") || undefined,
        };
    };

    return {
        timestamp: asNumber(raw.timestamp, Date.now()),
        network: {
            timestamp: asNumber(networkRaw.timestamp, Date.now()),
            rttMs: asNumber(networkRaw.rttMs, 0),
            jitterMs: asNumber(networkRaw.jitterMs, 0),
            packetLoss: asNumber(networkRaw.packetLoss, 0),
            sampleCount: asNumber(networkRaw.sampleCount, 0),
            source: networkRaw.source === "native" ? "native" : "mock",
        },
        protocols: {
            http2: parseProtocolSample(protocolsRaw.http2, "http2"),
            http3: parseProtocolSample(protocolsRaw.http3, "http3"),
            udp: parseProtocolSample(protocolsRaw.udp, "udp"),
        },
        decision: {
            bestProtocol: asProtocol(decisionRaw.bestProtocol),
            confidence: Math.max(0, Math.min(100, asNumber(decisionRaw.confidence, 0))),
            reason: asString(decisionRaw.reason, "No reasoning provided"),
            scores: {
                http2: asNumber(isObjectRecord(decisionRaw.scores) ? decisionRaw.scores.http2 : 1, 1),
                http3: asNumber(isObjectRecord(decisionRaw.scores) ? decisionRaw.scores.http3 : 1, 1),
                udp: asNumber(isObjectRecord(decisionRaw.scores) ? decisionRaw.scores.udp : 1, 1),
            },
            mode: asMode(decisionRaw.mode),
            manualProtocol: decisionRaw.manualProtocol ? asProtocol(decisionRaw.manualProtocol) : undefined,
        },
        control: {
            running: asBoolean(controlRaw.running, false),
            mode: asMode(controlRaw.mode),
            manualProtocol: controlRaw.manualProtocol ? asProtocol(controlRaw.manualProtocol) : undefined,
            targetUrl: asString(controlRaw.targetUrl, "https://cloudflare-quic.com/"),
            probeHost: asString(controlRaw.probeHost, "1.1.1.1"),
            probePort: asNumber(controlRaw.probePort, 443),
            intervalMs: asNumber(controlRaw.intervalMs, 1500),
            mockMode: asBoolean(controlRaw.mockMode, true),
        },
    };
}

function trimEnd<T>(items: T[], limit: number): T[] {
    return items.length <= limit ? items : items.slice(items.length - limit);
}

export const NetworkStoreProvider = ({ children }: { children: ReactNode }) => {
    const [metrics, setMetrics] = useState<NetworkStats | null>(null);
    const [protocols, setProtocols] = useState<ProtocolComparison | null>(null);
    const [decision, setDecision] = useState<Decision | null>(null);
    const [control, setControl] = useState<ControlState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [connectionStatus, setConnectionStatus] = useState<SocketConnectionStatus>("connecting");
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [switchHistory, setSwitchHistory] = useState<SwitchLogEntry[]>([]);
    const [throughputHistory, setThroughputHistory] = useState<ThroughputHistoryPoint[]>([]);
    const [protocolHistory, setProtocolHistory] = useState<ProtocolHistoryPoint[]>([]);

    const previousProtocolRef = useRef<ProtocolName | null>(null);

    const applySnapshot = useCallback((snapshot: Snapshot) => {
        const activeThroughput = snapshot.protocols[snapshot.decision.bestProtocol].throughputMbps;

        setMetrics(prev => {
            if (
                prev &&
                prev.rttMs === snapshot.network.rttMs &&
                prev.jitterMs === snapshot.network.jitterMs &&
                prev.packetLoss === snapshot.network.packetLoss &&
                prev.sampleCount === snapshot.network.sampleCount &&
                prev.source === snapshot.network.source
            ) {
                return prev;
            }
            return snapshot.network;
        });

        setProtocols(prev => {
            const unchanged =
                prev &&
                prev.http2.latencyMs === snapshot.protocols.http2.latencyMs &&
                prev.http3.latencyMs === snapshot.protocols.http3.latencyMs &&
                prev.udp.latencyMs === snapshot.protocols.udp.latencyMs &&
                prev.http2.throughputMbps === snapshot.protocols.http2.throughputMbps &&
                prev.http3.throughputMbps === snapshot.protocols.http3.throughputMbps &&
                prev.udp.throughputMbps === snapshot.protocols.udp.throughputMbps &&
                prev.http2.packetLoss === snapshot.protocols.http2.packetLoss &&
                prev.http3.packetLoss === snapshot.protocols.http3.packetLoss &&
                prev.udp.packetLoss === snapshot.protocols.udp.packetLoss;

            return unchanged ? prev : snapshot.protocols;
        });

        setDecision(prev => {
            const unchanged =
                prev &&
                prev.bestProtocol === snapshot.decision.bestProtocol &&
                prev.confidence === snapshot.decision.confidence &&
                prev.reason === snapshot.decision.reason &&
                prev.mode === snapshot.decision.mode &&
                prev.manualProtocol === snapshot.decision.manualProtocol &&
                prev.scores.http2 === snapshot.decision.scores.http2 &&
                prev.scores.http3 === snapshot.decision.scores.http3 &&
                prev.scores.udp === snapshot.decision.scores.udp;

            return unchanged ? prev : snapshot.decision;
        });

        setControl(prev => {
            const unchanged =
                prev &&
                prev.running === snapshot.control.running &&
                prev.mode === snapshot.control.mode &&
                prev.manualProtocol === snapshot.control.manualProtocol &&
                prev.targetUrl === snapshot.control.targetUrl &&
                prev.probeHost === snapshot.control.probeHost &&
                prev.probePort === snapshot.control.probePort &&
                prev.intervalMs === snapshot.control.intervalMs &&
                prev.mockMode === snapshot.control.mockMode;

            return unchanged ? prev : snapshot.control;
        });

        const previousProtocol = previousProtocolRef.current;
        const currentProtocol = snapshot.decision.bestProtocol;

        if (previousProtocol !== null && previousProtocol !== currentProtocol) {
            setSwitchHistory(prev =>
                trimEnd(
                    [
                        ...prev,
                        {
                            timestamp: snapshot.timestamp,
                            from: previousProtocol,
                            to: currentProtocol,
                            reason: snapshot.decision.reason,
                            confidence: snapshot.decision.confidence,
                        },
                    ],
                    MAX_HISTORY,
                ),
            );
        }

        previousProtocolRef.current = currentProtocol;

        setThroughputHistory(prev =>
            trimEnd(
                [
                    ...prev,
                    {
                        time: snapshot.timestamp,
                        latency: snapshot.network.rttMs,
                        throughput: activeThroughput,
                    },
                ],
                MAX_CHART_POINTS,
            ),
        );

        setProtocolHistory(prev =>
            trimEnd(
                [
                    ...prev,
                    {
                        time: snapshot.timestamp,
                        http2: snapshot.protocols.http2.latencyMs,
                        http3: snapshot.protocols.http3.latencyMs,
                        udp: snapshot.protocols.udp.latencyMs,
                    },
                ],
                MAX_CHART_POINTS,
            ),
        );

        setLastUpdated(snapshot.timestamp);
        setError(null);
        setIsLoading(false);
    }, []);

    const refreshSnapshot = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/snapshot`);
            if (!response.ok) {
                throw new Error(`Snapshot request failed: ${response.status}`);
            }
            const payload = (await response.json()) as unknown;
            const snapshot = parseSnapshot(payload);
            if (!snapshot) {
                throw new Error("Invalid snapshot payload");
            }
            applySnapshot(snapshot);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : "Failed to load snapshot");
            setIsLoading(false);
        }
    }, [applySnapshot]);

    const postControl = useCallback(async (payload: Record<string, unknown>) => {
        const response = await fetch(`${API_BASE}/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Control request failed: ${response.status}`);
        }

        const nextControl = await response.json();
        if (isObjectRecord(nextControl)) {
            setControl(prev => {
                if (!prev) {
                    return {
                        running: asBoolean(nextControl.running, false),
                        mode: asMode(nextControl.mode),
                        manualProtocol: nextControl.manualProtocol ? asProtocol(nextControl.manualProtocol) : undefined,
                        targetUrl: asString(nextControl.targetUrl, "https://cloudflare-quic.com/"),
                        probeHost: asString(nextControl.probeHost, "1.1.1.1"),
                        probePort: asNumber(nextControl.probePort, 443),
                        intervalMs: asNumber(nextControl.intervalMs, 1500),
                        mockMode: asBoolean(nextControl.mockMode, true),
                    };
                }
                return {
                    ...prev,
                    running: asBoolean(nextControl.running, prev.running),
                    mode: asMode(nextControl.mode),
                    manualProtocol: nextControl.manualProtocol ? asProtocol(nextControl.manualProtocol) : undefined,
                    targetUrl: asString(nextControl.targetUrl, prev.targetUrl),
                    probeHost: asString(nextControl.probeHost, prev.probeHost),
                    probePort: asNumber(nextControl.probePort, prev.probePort),
                    intervalMs: asNumber(nextControl.intervalMs, prev.intervalMs),
                    mockMode: asBoolean(nextControl.mockMode, prev.mockMode),
                };
            });
        }
    }, []);

    const setMode = useCallback(
        async (mode: ControlMode) => {
            await postControl({ mode });
        },
        [postControl],
    );

    const setManualProtocol = useCallback(
        async (protocol: ProtocolName) => {
            await postControl({ mode: "manual", manualProtocol: protocol });
        },
        [postControl],
    );

    const toggleRunning = useCallback(async () => {
        if (!control) {
            return;
        }
        await postControl({ action: control.running ? "stop" : "start" });
    }, [control, postControl]);

    const clearHistory = useCallback(() => {
        setSwitchHistory([]);
        setThroughputHistory([]);
        setProtocolHistory([]);
    }, []);

    useWebSocket<SocketPayload>({
        url: SOCKET_URL,
        onStatusChange: status => {
            setConnectionStatus(status);
        },
        onError: socketError => {
            setError(socketError);
        },
        onMessage: payload => {
            if ((payload.type === "snapshot" || payload.type === "update") && payload.data) {
                const snapshot = parseSnapshot(payload.data);
                if (snapshot) {
                    applySnapshot(snapshot);
                }
            }
        },
    });

    useEffect(() => {
        void refreshSnapshot();
    }, [refreshSnapshot]);

    useEffect(() => {
        if (connectionStatus === "connected") {
            return;
        }

        const fallbackPolling = window.setInterval(() => {
            void refreshSnapshot();
        }, 4000);

        return () => {
            window.clearInterval(fallbackPolling);
        };
    }, [connectionStatus, refreshSnapshot]);

    const value = useMemo<NetworkStoreValue>(
        () => ({
            metrics,
            protocols,
            decision,
            control,
            connectionStatus,
            isLoading,
            error,
            lastUpdated,
            switchHistory,
            throughputHistory,
            protocolHistory,
            refreshSnapshot,
            postControl,
            setMode,
            setManualProtocol,
            toggleRunning,
            clearHistory,
        }),
        [
            metrics,
            protocols,
            decision,
            control,
            connectionStatus,
            isLoading,
            error,
            lastUpdated,
            switchHistory,
            throughputHistory,
            protocolHistory,
            refreshSnapshot,
            postControl,
            setMode,
            setManualProtocol,
            toggleRunning,
            clearHistory,
        ],
    );

    return <NetworkStoreContext.Provider value={value}>{children}</NetworkStoreContext.Provider>;
};

export function useNetworkStore(): NetworkStoreValue {
    const context = useContext(NetworkStoreContext);
    if (!context) {
        throw new Error("useNetworkStore must be used inside NetworkStoreProvider");
    }
    return context;
}
