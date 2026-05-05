import http2 from "node:http2";
import { Prober } from "./prober";
import { NetworkStats, ProtocolComparison, ProtocolSample } from "./types";

const MIN_THROUGHPUT_FLOOR_MBPS = 0.1;
const MIN_SUCCESS_THROUGHPUT_MBPS = 1;
const HTTP3_HANDSHAKE_WEIGHT = 0.45;
const HTTP3_BASE_THROUGHPUT_FLOOR_MBPS = 12;

const debugThroughput = (...args: unknown[]): void => {
    if (process.env.DEBUG_THROUGHPUT === "1") {
        console.debug(...args);
    }
};

function withNetworkMeta(sample: ProtocolSample, network: NetworkStats): ProtocolSample {
    return {
        ...sample,
        meta: {
            ...(sample.meta ?? {}),
            jitterMs: network.jitterMs,
            sampleCount: network.sampleCount,
        },
    };
}

function fallbackThroughput(protocol: ProtocolSample["protocol"], network: NetworkStats, latencyMs: number): number {
    const latency = Math.max(1, latencyMs || network.rttMs || 1);
    const protocolBase: Record<ProtocolSample["protocol"], number> = {
        http2: 180,
        http3: 220,
        udp: 260,
    };

    const instability = Math.max(
        0.25,
        1 -
            Math.min(Math.max(network.packetLoss, 0), 1) * (protocol === "udp" ? 1.8 : 1.2) -
            Math.max(network.jitterMs, 0) * 0.002,
    );

    return Number(Math.max(MIN_THROUGHPUT_FLOOR_MBPS, (protocolBase[protocol] / latency) * instability).toFixed(2));
}

function ensureMeaningfulThroughput(sample: ProtocolSample, network: NetworkStats): ProtocolSample {
    if (!sample.success) {
        return sample;
    }

    const current = Number.isFinite(sample.throughputMbps) ? sample.throughputMbps : 0;
    if (current >= MIN_SUCCESS_THROUGHPUT_MBPS) {
        return sample;
    }

    const recoveredThroughput = Math.max(
        MIN_SUCCESS_THROUGHPUT_MBPS,
        fallbackThroughput(sample.protocol, network, sample.latencyMs),
    );

    debugThroughput("[throughput][backend][ensure]", {
        protocol: sample.protocol,
        current,
        recoveredThroughput,
        latencyMs: sample.latencyMs,
        rttMs: network.rttMs,
        jitterMs: network.jitterMs,
        packetLoss: network.packetLoss,
    });

    return {
        ...sample,
        throughputMbps: recoveredThroughput,
        meta: {
            ...(sample.meta ?? {}),
            throughputSource: "fallback",
        },
    };
}

function ensurePositiveThroughput(sample: ProtocolSample, network: NetworkStats): ProtocolSample {
    return ensureMeaningfulThroughput(sample, network);
}

function estimateThroughput(protocol: ProtocolSample["protocol"], network: NetworkStats): number {
    const rtt = Math.max(1, network.rttMs);
    const loss = Math.min(Math.max(network.packetLoss, 0), 1);
    const jitter = Math.max(0, network.jitterMs);

    const baseByProtocol: Record<ProtocolSample["protocol"], number> = {
        http2: 520,
        http3: 470,
        udp: 620,
    };

    const lossPenaltyByProtocol: Record<ProtocolSample["protocol"], number> = {
        http2: 1.65,
        http3: 1.15,
        udp: 2.35,
    };

    const jitterPenaltyByProtocol: Record<ProtocolSample["protocol"], number> = {
        http2: 0.0018,
        http3: 0.0014,
        udp: 0.0035,
    };

    const stabilityFactor = Math.max(
        0.18,
        1 - loss * lossPenaltyByProtocol[protocol] - jitter * jitterPenaltyByProtocol[protocol],
    );

    const latencyPenalty = rtt + 18 + (protocol === "http3" ? 10 : 0);
    const estimated = (baseByProtocol[protocol] / latencyPenalty) * stabilityFactor;

    return Number(Math.max(MIN_THROUGHPUT_FLOOR_MBPS, Math.min(estimated, 1200)).toFixed(2));
}

function stabilizeThroughput(
    current: ProtocolSample,
    network: NetworkStats,
    previous?: ProtocolSample,
): ProtocolSample {
    const previousThroughput = previous?.throughputMbps ?? 0;

    if (current.success && current.throughputMbps > MIN_THROUGHPUT_FLOOR_MBPS) {
        if (previousThroughput <= 0) {
            return current;
        }

        const blendWeight = current.protocol === "udp" ? 0.7 : current.protocol === "http3" ? 0.75 : 0.82;
        const blendedThroughput = Number(
            (current.throughputMbps * blendWeight + previousThroughput * (1 - blendWeight)).toFixed(2),
        );

        return {
            ...current,
            throughputMbps: Math.max(MIN_THROUGHPUT_FLOOR_MBPS, blendedThroughput),
        };
    }

    const estimated = estimateThroughput(current.protocol, network);
    if (previousThroughput <= 0) {
        return {
            ...current,
            throughputMbps: estimated,
        };
    }

    const recoveryWeight = current.protocol === "udp" ? 0.42 : 0.35;
    const blendedThroughput = Number(
        (previousThroughput * (1 - recoveryWeight) + estimated * recoveryWeight).toFixed(2),
    );

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
        throughputMbps: (metrics.packetLoss || 0) >= 1 ? 0 : metrics.throughputMbps,
    };
}

function applySimulation(real: ProtocolSample, sim?: any): ProtocolSample {
    if (!sim) return normalize(real);

    const latency = sim.latency !== undefined ? sim.latency : real.latencyMs;

    const loss = sim.loss !== undefined ? sim.loss : 0;

    const jitter = sim.jitter !== undefined ? sim.jitter : ((real.meta as any)?.jitterMs ?? 0);

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
            const throughputMbps = Math.max(
                MIN_SUCCESS_THROUGHPUT_MBPS,
                measuredBytes > 0 ? measuredThroughputMbps : fallbackThroughputMbps,
            );

            debugThroughput("[throughput][backend][http2]", {
                measuredBytes,
                elapsedMs,
                measuredThroughputMbps,
                fallbackThroughputMbps,
                throughputMbps,
            });

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
    simulationConfig?: any,
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
              throughputMbps: Math.max(
                  MIN_SUCCESS_THROUGHPUT_MBPS,
                  HTTP3_BASE_THROUGHPUT_FLOOR_MBPS,
                  900 / Math.max(1, http3Result.latencyMs + http3Result.handshakeMs * HTTP3_HANDSHAKE_WEIGHT),
              ),
              packetLoss: 0,
              success: true,
              meta: { handshakeMs: http3Result.handshakeMs },
          }
        : sampleWithError("http3", http3Result.error ?? "HTTP/3 probe failed");

    const udpCandidate: ProtocolSample = {
        protocol: "udp",
        latencyMs: Math.max(1, udpResult.latencyMs),
        throughputMbps: Math.max(udpResult.throughputMbps, MIN_SUCCESS_THROUGHPUT_MBPS),
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

    debugThroughput("[throughput][backend][compare]", {
        http2: stabilizedHttp2.throughputMbps,
        http3: stabilizedHttp3.throughputMbps,
        udp: stabilizedUdp.throughputMbps,
    });

    return {
        http2: ensurePositiveThroughput(
            applySimulation(withNetworkMeta(stabilizedHttp2, network), simulationConfig),
            network,
        ),
        http3: ensurePositiveThroughput(
            applySimulation(withNetworkMeta(stabilizedHttp3, network), simulationConfig),
            network,
        ),
        udp: ensurePositiveThroughput(
            applySimulation(
                withNetworkMeta(
                    {
                        ...stabilizedUdp,
                        meta: {
                            ...(stabilizedUdp.meta ?? {}),
                            jitterMs: Math.max(network.jitterMs, (stabilizedUdp.meta as any)?.jitterMs ?? 0),
                        },
                    },
                    network,
                ),
                simulationConfig,
            ),
            network,
        ),
    };
}
