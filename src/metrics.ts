import { ProtocolComparison, ProtocolName, ProtocolScores } from "./types";

// 🔥 tuned weights (more realistic)
const WEIGHTS = {
    latency: 0.45,
    loss: 0.4,
    throughputPenalty: 0.15,
};

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

const safe = (value: number, fallback = 0): number =>
    Number.isFinite(value) ? value : fallback;

export function computeProtocolScores(protocols: ProtocolComparison): ProtocolScores {
    const names: ProtocolName[] = ["http2", "http3", "udp"];

    const scores = { http2: 0, http3: 0, udp: 0 } as ProtocolScores;

    for (const name of names) {
        const s = protocols[name];

        // ---------- RAW VALUES ----------
        const latency = safe(s.latencyMs, 100);
        const loss = safe(s.packetLoss, 0);
        let throughput = safe(s.throughputMbps, 10);

        // ---------- FIX UDP ----------
        if (name === "udp") {
            // cap unrealistic throughput
            throughput = Math.min(throughput, 80);

            // apply effective loss impact
            throughput *= (1 - loss);

            // base instability penalty
            throughput *= 0.8;
        }

        // ---------- NORMALIZATION (ABSOLUTE, NOT RELATIVE) ----------
        const latencyNorm = clamp(latency / 200, 0, 1);     // 200ms = bad
        const lossNorm = clamp(loss / 0.1, 0, 1);           // 10% loss = worst
        const throughputPenalty = clamp(1 - throughput / 100, 0, 1); // 100 Mbps ideal

        // ---------- SCORE ----------
        let score =
            WEIGHTS.latency * latencyNorm +
            WEIGHTS.loss * lossNorm +
            WEIGHTS.throughputPenalty * throughputPenalty;

        // ---------- PROTOCOL-SPECIFIC ADJUSTMENTS ----------
        if (name === "http2") {
            // TCP suffers heavily under loss
            score += loss * 0.5;
        }

        if (name === "http3") {
            // QUIC handles loss better → slight advantage
            score -= loss * 0.2;
        }

        if (name === "udp") {
            // reliability penalty
            score += loss * 0.8 + 0.2;
        }

        // ---------- FAILURE PENALTY ----------
        if (!s.success) {
            score += 0.4;
        }

        scores[name] = clamp(score, 0, 2);
    }

    return scores;
}