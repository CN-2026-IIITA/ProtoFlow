import { ProtocolComparison, ProtocolName, ProtocolScores } from "./types";

// 🔥 tuned weights (more realistic)
const WEIGHTS = {
    latency: 0.38,
    loss: 0.42,
    throughputPenalty: 0.14,
    jitter: 0.06,
};

const THROUGHPUT_SATURATION_MBPS = 320;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const safe = (value: number, fallback = 0): number => (Number.isFinite(value) ? value : fallback);

export function computeProtocolScores(protocols: ProtocolComparison): ProtocolScores {
    const names: ProtocolName[] = ["http2", "http3", "udp"];

    const scores = { http2: 0, http3: 0, udp: 0 } as ProtocolScores;

    for (const name of names) {
        const s = protocols[name];

        // ---------- RAW VALUES ----------
        const latency = safe(s.latencyMs, 100);
        const loss = safe(s.packetLoss, 0);
        const jitter = safe(Number(s.meta?.jitterMs ?? 0), 0);
        let throughput = safe(s.throughputMbps, 10);

        // ---------- FIX UDP ----------
        if (name === "udp") {
            // cap unrealistic throughput and discount it more aggressively under instability
            throughput = Math.min(throughput, 140);
            throughput *= Math.max(0.15, 1 - loss * 1.6 - jitter * 0.0025);
        }

        // ---------- NORMALIZATION (ABSOLUTE, NOT RELATIVE) ----------
        const latencyNorm = clamp(latency / 200, 0, 1); // 200ms = bad
        const lossNorm = clamp(loss / 0.06, 0, 1); // 6% loss is already severe
        const throughputSignal = clamp(
            Math.log1p(Math.max(throughput, 0)) / Math.log1p(THROUGHPUT_SATURATION_MBPS),
            0,
            1,
        );
        const throughputPenalty = 1 - throughputSignal;
        const jitterNorm = clamp(jitter / 60, 0, 1);

        // ---------- SCORE ----------
        let score =
            WEIGHTS.latency * latencyNorm +
            WEIGHTS.loss * lossNorm +
            WEIGHTS.throughputPenalty * throughputPenalty +
            WEIGHTS.jitter * jitterNorm;

        // ---------- PROTOCOL-SPECIFIC ADJUSTMENTS ----------
        if (name === "http2") {
            // TCP suffers heavily under loss
            score += loss * 0.75;
            score += jitter * 0.0008;
        }

        if (name === "http3") {
            // QUIC handles loss better, but the benefit should stay modest
            score -= Math.min(loss * 0.15, 0.08);
            score += jitter * 0.00035;
        }

        if (name === "udp") {
            // reliability penalty
            score += loss * 1.15 + jitter * 0.0018 + 0.12;
            if (loss >= 0.03 || jitter >= 25) {
                score += 0.08;
            }
        }

        // ---------- FAILURE PENALTY ----------
        if (!s.success) {
            score += 0.55;
        }

        scores[name] = clamp(score, 0, 2);
    }

    return scores;
}
