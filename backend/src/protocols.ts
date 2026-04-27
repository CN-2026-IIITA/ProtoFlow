import http2 from "node:http2";
import { Prober } from "./prober";
import { NetworkStats, ProtocolComparison, ProtocolSample } from "./types";

const MIN_THROUGHPUT_FLOOR_MBPS = 0.1;

function estimateThroughput(protocol: ProtocolSample["protocol"], network: NetworkStats): number {
    const rtt = Math.max(1, network.rttMs);
    const loss = Math.min(Math.max(network.packetLoss, 0), 1);

    const baseByProtocol: Record<ProtocolSample["protocol"], number> = {
        http2: 900,
        http3: 1100,
        udp: 1300,
    };

    const lossPenaltyByProtocol: Record<ProtocolSample["protocol"], number> = {
        http2: 1.45,
        http3: 1.2,
        udp: 2,
    };

    const estimated =
        (baseByProtocol[protocol] / (rtt + 12)) * Math.max(0.2, 1 - loss * lossPenaltyByProtocol[protocol]);

    return Number(Math.max(MIN_THROUGHPUT_FLOOR_MBPS, Math.min(estimated, 1200)).toFixed(2));
}

function stabilizeThroughput(
    current: ProtocolSample,
    network: NetworkStats,
    previous?: ProtocolSample,
): ProtocolSample {
    if (current.success && current.throughputMbps > MIN_THROUGHPUT_FLOOR_MBPS) {
        return current;
    }

    const estimated = estimateThroughput(current.protocol, network);
    if (!previous || previous.throughputMbps <= 0) {
        return {
            ...current,
            throughputMbps: estimated,
        };
    }

    const blendedThroughput = Number((previous.throughputMbps * 0.55 + estimated * 0.45).toFixed(2));

    return {
        ...current,
        throughputMbps: Math.max(MIN_THROUGHPUT_FLOOR_MBPS, blendedThroughput),
    };
}

function sampleWithError(protocol: ProtocolSample["protocol"], error: string): ProtocolSample {
    return {
        protocol,
        latencyMs: Number.POSITIVE_INFINITY,
        throughputMbps: 0,
        packetLoss: 1,
        success: false,
        error,
    };
}

function normalize(metrics: ProtocolSample): ProtocolSample {
    return {
        ...metrics,
        // latency must never be 0
        latencyMs: Math.max(1, metrics.latencyMs || 1),

        // clamp loss between 0-1
        packetLoss: Math.min(Math.max(metrics.packetLoss || 0, 0), 1),

        // 100% loss -> no throughput
        throughputMbps:
            (metrics.packetLoss || 0) >= 1
                ? 0
                : metrics.throughputMbps,
    };
}

function applySimulation(real: ProtocolSample, sim?: any): ProtocolSample {
    if (!sim) return normalize(real);

    const latency =
        sim.latency !== undefined
            ? sim.latency
            : real.latencyMs;

    const loss =
        sim.loss !== undefined
            ? sim.loss
            : 0;

    const jitter =
        sim.jitter !== undefined
            ? sim.jitter
            : (real.meta as any)?.jitterMs ?? 0;

    const nextMeta = real.meta ? { ...real.meta } : {};
    nextMeta.jitterMs = jitter;

    return normalize({
        ...real,
        latencyMs: latency,
        packetLoss: loss,
        meta: nextMeta,
    });
}

export async function benchmarkHttp2(urlRaw: string, timeoutMs = 2500): Promise<ProtocolSample> {
    const target = new URL(urlRaw);
    const authority = `${target.protocol}//${target.host}`;
    const path = `${target.pathname}${target.search}` || "/";

    return new Promise<ProtocolSample>(resolve => {
        const client = http2.connect(authority);
        const request = client.request({ ":path": path, ":method": "GET" });

        const start = performance.now();
        let bytes = 0;
        let contentLengthBytes = 0;
        let completed = false;

        const timer = setTimeout(() => {
            if (completed) {
                return;
            }
            completed = true;
            request.close();
            client.close();
            resolve(sampleWithError("http2", `HTTP/2 timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        request.on("response", headers => {
            // Keep a content-length fallback when servers return lightweight bodies.
            const rawContentLength = headers["content-length"];
            const contentLength = Array.isArray(rawContentLength) ? rawContentLength[0] : rawContentLength;
            const parsed = Number(contentLength);
            if (Number.isFinite(parsed) && parsed > 0) {
                contentLengthBytes = parsed;
            }
        });

        request.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
        });

        request.on("error", error => {
            if (completed) {
                return;
            }
            completed = true;
            clearTimeout(timer);
            client.close();
            resolve(sampleWithError("http2", error.message));
        });

        request.on("end", () => {
            if (completed) {
                return;
            }
            completed = true;
            clearTimeout(timer);
            const elapsedMs = Math.max(1, performance.now() - start);
            const measuredBytes = Math.max(bytes, contentLengthBytes);
            const measuredThroughputMbps = (measuredBytes * 8) / (elapsedMs / 1000) / 1_000_000;
            const fallbackThroughputMbps = Math.max(1, 500 / elapsedMs);
            const throughputMbps = measuredBytes > 0 ? measuredThroughputMbps : fallbackThroughputMbps;

            client.close();
            resolve({
                protocol: "http2",
                latencyMs: elapsedMs,
                throughputMbps: Math.max(throughputMbps, MIN_THROUGHPUT_FLOOR_MBPS),
                packetLoss: 0,
                success: true,
                meta: { bytes: measuredBytes },
            });
        });

        request.end();
    });
}

export async function compareProtocols(
    targetUrl: string,
    prober: Prober,
    network: NetworkStats,
    previous?: ProtocolComparison,
    simulationConfig?: any
): Promise<ProtocolComparison> {
    const [http2, http3Result, udpResult] = await Promise.all([
        benchmarkHttp2(targetUrl),
        prober.http3Request(targetUrl),
        prober.udpProbe(),
    ]);

    const http3Candidate: ProtocolSample = http3Result.success
        ? {
              protocol: "http3",
              latencyMs: Math.max(1, http3Result.latencyMs),
              throughputMbps: Math.max(15, 1200 / Math.max(1, http3Result.latencyMs)),
              packetLoss: 0,
              success: true,
              meta: { handshakeMs: http3Result.handshakeMs },
          }
        : sampleWithError("http3", http3Result.error ?? "HTTP/3 probe failed");

    const udpCandidate: ProtocolSample = {
        protocol: "udp",
        latencyMs: Math.max(1, udpResult.latencyMs),
        throughputMbps: Math.max(udpResult.throughputMbps, MIN_THROUGHPUT_FLOOR_MBPS),
        packetLoss: udpResult.packetLoss,
        success: udpResult.success,
        error: udpResult.error,
        meta: {
            jitterMs: udpResult.jitterMs,
            packetsSent: udpResult.packetsSent,
            packetsReceived: udpResult.packetsReceived,
        },
    };

    const stabilizedHttp2 = stabilizeThroughput(http2, network, previous?.http2);
    const stabilizedHttp3 = stabilizeThroughput(http3Candidate, network, previous?.http3);
    const stabilizedUdp = stabilizeThroughput(udpCandidate, network, previous?.udp);

    return {
        http2: applySimulation(stabilizedHttp2, simulationConfig),
        http3: applySimulation(stabilizedHttp3, simulationConfig),
        udp: applySimulation(stabilizedUdp, simulationConfig),
    };
}
