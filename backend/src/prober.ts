import path from "node:path";
import { Http3ProbeResult, NativeNetworkStats, NetworkStats, UdpProbeResult } from "./types";

interface NativeBinding {
    getNetworkStats(input?: { host?: string; port?: number; samples?: number; timeoutMs?: number }): NativeNetworkStats;
    http3Request(input: { url: string; timeoutMs?: number }): {
        latency: number;
        handshake: number;
        success: boolean;
        error?: string;
    };
    udpProbe(input: { host: string; port: number; packets?: number; payloadBytes?: number; timeoutMs?: number }): {
        latency: number;
        jitter: number;
        loss: number;
        throughput: number;
        success: boolean;
        packetsSent: number;
        packetsReceived: number;
        error?: string;
    };
}

interface ProberOptions {
    mockMode: boolean;
    probeHost: string;
    probePort: number;
    timeoutMs?: number;
}

function tryLoadNativeBinding(): NativeBinding | null {
    const candidates = [
        path.resolve(__dirname, "../native/build/Release/optimizer_native.node"),
        path.resolve(__dirname, "../native/build/Debug/optimizer_native.node"),
        path.resolve(process.cwd(), "native/build/Release/optimizer_native.node"),
    ];

    for (const candidate of candidates) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require(candidate) as NativeBinding;
        } catch {
            continue;
        }
    }

    return null;
}

export class Prober {
    private readonly binding: NativeBinding | null;
    private readonly options: ProberOptions;

    constructor(options: ProberOptions) {
        this.options = options;
        this.binding = options.mockMode ? null : tryLoadNativeBinding();
    }

    get usingNative(): boolean {
        return this.binding !== null;
    }

    async getNetworkStats(): Promise<NetworkStats> {
        if (this.binding) {
            const result = this.binding.getNetworkStats({
                host: this.options.probeHost,
                port: this.options.probePort,
                samples: 8,
                timeoutMs: this.options.timeoutMs ?? 800,
            });

            return {
                timestamp: Date.now(),
                rttMs: result.rtt,
                jitterMs: result.jitter,
                packetLoss: result.loss,
                sampleCount: result.sampleCount,
                source: "native",
            };
        }

        return {
            timestamp: Date.now(),
            rttMs: randomBetween(25, 90),
            jitterMs: randomBetween(2, 12),
            packetLoss: randomBetween(0.005, 0.08),
            sampleCount: 8,
            source: "mock",
        };
    }

    async http3Request(url: string): Promise<Http3ProbeResult> {
        if (this.binding) {
            const result = this.binding.http3Request({ url, timeoutMs: this.options.timeoutMs ?? 2000 });
            return {
                latencyMs: result.latency,
                handshakeMs: result.handshake,
                success: result.success,
                error: result.error,
            };
        }

        const latency = randomBetween(30, 120);
        return {
            latencyMs: latency,
            handshakeMs: latency * 0.35,
            success: true,
        };
    }

    async udpProbe(): Promise<UdpProbeResult> {
        if (this.binding) {
            const result = this.binding.udpProbe({
                host: this.options.probeHost,
                port: this.options.probePort,
                packets: 8,
                payloadBytes: 64,
                timeoutMs: this.options.timeoutMs ?? 800,
            });

            return {
                latencyMs: result.latency,
                jitterMs: result.jitter,
                packetLoss: result.loss,
                throughputMbps: result.throughput,
                success: result.success,
                packetsSent: result.packetsSent,
                packetsReceived: result.packetsReceived,
                error: result.error,
            };
        }

        return {
            latencyMs: randomBetween(12, 40),
            jitterMs: randomBetween(1, 14),
            packetLoss: randomBetween(0.01, 0.15),
            throughputMbps: randomBetween(300, 2000),
            success: true,
            packetsSent: 8,
            packetsReceived: Math.round(randomBetween(6, 8)),
        };
    }
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}
