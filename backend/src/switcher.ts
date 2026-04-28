import { computeProtocolScores } from "./metrics";
import {
    ControlState,
    Decision,
    NetworkStats,
    ProtocolComparison,
    ProtocolName,
    ProtocolScores,
} from "./types";

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, value));

// ---------- STATE ----------
let lastProtocol: ProtocolName = "http2";
let lastSwitchTime = 0;

// ---------- REASON ----------
function reasonFromContext(
    bestProtocol: ProtocolName,
    network: NetworkStats,
    isRealtime: boolean
): string {
    if (bestProtocol === "udp") {
        return isRealtime
            ? "Real-time mode: low latency favors UDP"
            : "UDP selected under optimal conditions";
    }

    if (network.packetLoss >= 0.05 && bestProtocol === "http3") {
        return "High packet loss favors HTTP/3";
    }

    if (network.rttMs > 120 && bestProtocol === "http3") {
        return "High latency/jitter favors HTTP/3 (avoids HOL blocking)";
    }

    if (bestProtocol === "http2") {
        return "Stable low latency → HTTP/2 is most efficient";
    }

    return "Adaptive selection based on current network conditions";
}

// ---------- CONFIDENCE ----------
function computeConfidence(scores: ProtocolScores): number {
    const sorted = Object.values(scores).sort((a, b) => a - b);
    const best = sorted[0];
    const second = sorted[1] ?? best;

    const gap = second - best;
    const baseline = second <= 0 ? 1 : second;

    const raw = gap / baseline;
    const smoothed = Math.max(raw, 0.05);

    return Math.round(clamp(smoothed, 0, 1) * 100);
}

// ---------- CONTEXT ----------
function applyNetworkContext(
    scores: ProtocolScores,
    network: NetworkStats,
    protocols: ProtocolComparison,
): ProtocolScores {
    const adjusted: ProtocolScores = { ...scores };

    if (network.packetLoss >= 0.05) {
        adjusted.udp += 1.0;
        adjusted.http2 += 0.2;

        if (protocols.http3.success) {
            adjusted.http3 -= 0.08;
        }
    }

    if (network.packetLoss >= 0.08) {
        adjusted.udp += 0.8;

        if (protocols.http3.success) {
            adjusted.http3 -= 0.07;
        }
    }

    if (network.rttMs >= 100 && protocols.http3.success) {
        adjusted.http3 -= 0.05;
    }

    return adjusted;
}

// ---------- MAIN ----------
export function decideBestProtocol(
    protocols: ProtocolComparison,
    network: NetworkStats,
    control: ControlState,
): Decision {
    const now = Date.now();
    const isRealtime = control.trafficType === "realtime";

    // ---------- MANUAL ----------
    if (control.mode === "manual" && control.manualProtocol) {
        const baseScores = computeProtocolScores(protocols);
        const scores = applyNetworkContext(baseScores, network, protocols);

        return {
            bestProtocol: control.manualProtocol,
            confidence: 100,
            reason: `Manual override active: forcing ${control.manualProtocol.toUpperCase()}`,
            scores,
            mode: control.mode,
            manualProtocol: control.manualProtocol,
        };
    }

    const baseScores = computeProtocolScores(protocols);
    let scores = applyNetworkContext(baseScores, network, protocols);

    // ---------- UDP ELIGIBILITY ----------
    const udpEligible =
        protocols.udp.success &&
        network.packetLoss < 0.05 &&
        network.jitterMs < 35 &&
        protocols.udp.packetLoss < 0.05;

    // ---------- REALTIME BOOST ----------
    if (
        isRealtime &&
        udpEligible &&
        network.packetLoss < 0.02 &&
        network.rttMs < 60 &&
        network.jitterMs < 25
    ) {
        scores.udp -= 0.5;
    }

    // ---------- DISCOURAGE UDP IN NORMAL MODE ----------
    if (!isRealtime) {
        scores.udp += 1.2;
    }

    // ---------- HTTP/2 RECOVERY ----------
    if (
        !isRealtime &&
        network.packetLoss < 0.03 &&
        network.rttMs < 100 &&
        network.jitterMs < 40
    ) {
        lastProtocol = "http2";
        lastSwitchTime = now;

        return {
            bestProtocol: "http2",
            confidence: 80,
            reason: "Stable low latency → HTTP/2 is most efficient",
            scores,
            mode: control.mode,
        };
    }

    // ---------- UDP PENALTY ----------
    scores.udp += network.packetLoss * 2.0 + 0.6;

    if (!udpEligible) {
        scores.udp += 1.0;
    }

    // ---------- SORT ----------
    const sorted = (Object.entries(scores) as [ProtocolName, number][])
        .sort((a, b) => a[1] - b[1]);

    const [bestProtocol, bestScore] = sorted[0];
    const [, secondScore] = sorted[1];

    const gap = secondScore - bestScore;
    const confidence = computeConfidence(scores);

    // ---------- HYSTERESIS ----------
    const canSwitch =
        bestProtocol !== lastProtocol &&
        confidence > 25 &&
        gap > 0.02 &&
        now - lastSwitchTime > 2000;

    let finalProtocol = canSwitch ? bestProtocol : lastProtocol;

    if (canSwitch) {
        lastProtocol = bestProtocol;
        lastSwitchTime = now;
    }

    // ---------- PREVENT UDP LOCK-IN ----------
    if (
        lastProtocol === "udp" &&
        (network.packetLoss > 0.02 || network.jitterMs > 20)
    ) {
        finalProtocol = "http3";
        lastProtocol = "http3";
        lastSwitchTime = now;
    }

    // ---------- SAFETY ----------
    if (finalProtocol === "udp" && !udpEligible) {
        const fallback =
            (sorted.find(([name]) => name !== "udp") as [ProtocolName, number])?.[0] ?? "http2";

        finalProtocol = fallback;
        lastProtocol = fallback;
        lastSwitchTime = now;
    }

    return {
        bestProtocol: finalProtocol,
        confidence,
        reason: reasonFromContext(finalProtocol, network, isRealtime),
        scores,
        mode: control.mode,
    };
}