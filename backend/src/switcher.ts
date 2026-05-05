import { computeProtocolScores } from "./metrics";
import { ControlState, Decision, NetworkStats, ProtocolComparison, ProtocolName, ProtocolScores } from "./types";

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const RESET_SWITCH_COOLDOWN_MS = 2_500;
const REALTIME_SWITCH_COOLDOWN_MS = 1_500;
const REALTIME_MIN_SWITCH_GAP = 0.03;
const RELIABLE_MIN_SWITCH_GAP = 0.06;

// ---------- STATE ----------
let lastProtocol: ProtocolName = "http2";
let lastSwitchTime = 0;

export function resetProtocolDecisionState(): void {
    lastProtocol = "http2";
    lastSwitchTime = 0;
}

// ---------- REASON ----------
function reasonFromContext(bestProtocol: ProtocolName, network: NetworkStats, isRealtime: boolean): string {
    if (bestProtocol === "udp") {
        return isRealtime
            ? "Real-time mode with low jitter and loss favors UDP"
            : "UDP selected only because the network is unusually clean";
    }

    if (network.packetLoss >= 0.03 && bestProtocol === "http3") {
        return "Packet loss and jitter favor HTTP/3 over UDP";
    }

    if (network.rttMs > 120 && bestProtocol === "http3") {
        return "High latency with moderate loss favors HTTP/3";
    }

    if (bestProtocol === "http2") {
        return network.packetLoss >= 0.03 || network.jitterMs >= 25
            ? "HTTP/2 is the most reliable fallback under instability"
            : "Stable low-latency network favors HTTP/2";
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
    const jitterPressure = clamp(network.jitterMs / 60, 0, 1);
    const lossPressure = clamp(network.packetLoss / 0.12, 0, 1);

    if (network.packetLoss >= 0.05) {
        adjusted.udp += 1.2;
        adjusted.http2 += 0.24;

        if (protocols.http3.success) {
            adjusted.http3 -= 0.12;
        }
    }

    if (network.packetLoss >= 0.08) {
        adjusted.udp += 0.9;

        if (protocols.http3.success) {
            adjusted.http3 -= 0.1;
        }
    }

    if (network.jitterMs >= 20) {
        adjusted.udp += jitterPressure * 0.9 + 0.1;
        adjusted.http2 += jitterPressure * 0.08;

        if (protocols.http3.success) {
            adjusted.http3 -= Math.min(0.08, jitterPressure * 0.06);
        }
    }

    if (network.rttMs >= 100 && protocols.http3.success) {
        adjusted.http3 -= 0.03 + lossPressure * 0.04;
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
    const switchCooldown = isRealtime ? REALTIME_SWITCH_COOLDOWN_MS : RESET_SWITCH_COOLDOWN_MS;
    const minSwitchGap = isRealtime ? REALTIME_MIN_SWITCH_GAP : RELIABLE_MIN_SWITCH_GAP;

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
    const currentProtocolState = protocols[lastProtocol];

    // ---------- UDP ELIGIBILITY ----------
    const udpEligible =
        protocols.udp.success &&
        network.packetLoss < 0.03 &&
        network.jitterMs < 22 &&
        protocols.udp.packetLoss < 0.03 &&
        protocols.udp.throughputMbps >= 0.5;

    // ---------- REALTIME BOOST ----------
    if (isRealtime && udpEligible && network.packetLoss < 0.02 && network.rttMs < 60 && network.jitterMs < 25) {
        scores.udp -= 0.5;
    }

    // ---------- DISCOURAGE UDP IN NORMAL MODE ----------
    if (!isRealtime) {
        scores.udp += 1.35;
    }

    // ---------- HTTP/2 RECOVERY ----------
    if (!isRealtime && network.packetLoss < 0.025 && network.rttMs < 100 && network.jitterMs < 35) {
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
    scores.udp += network.packetLoss * 2.2 + network.jitterMs * 0.01 + 0.65;

    if (!udpEligible) {
        scores.udp += 1.15;
    }

    // ---------- PROTOCOL STICKINESS ----------
    if (currentProtocolState.success && network.packetLoss < 0.03 && network.jitterMs < 20) {
        scores[lastProtocol] -= isRealtime ? 0.03 : 0.05;
    }

    // ---------- SORT ----------
    const sorted = (Object.entries(scores) as [ProtocolName, number][]).sort((a, b) => a[1] - b[1]);

    const [bestProtocol, bestScore] = sorted[0];
    const [, secondScore] = sorted[1];

    const gap = secondScore - bestScore;
    const confidence = computeConfidence(scores);
    const unstableNetwork = network.packetLoss >= 0.05 || network.jitterMs >= 30;

    // ---------- HYSTERESIS ----------
    const canSwitch =
        bestProtocol !== lastProtocol && confidence > 30 && gap > minSwitchGap && now - lastSwitchTime > switchCooldown;

    let finalProtocol = canSwitch ? bestProtocol : lastProtocol;

    if (canSwitch) {
        lastProtocol = bestProtocol;
        lastSwitchTime = now;
    }

    // ---------- FAST DEGRADATION RESPONSE ----------
    if (lastProtocol === "udp" && unstableNetwork) {
        finalProtocol = protocols.http2.success ? "http2" : "http3";
        lastProtocol = finalProtocol;
        lastSwitchTime = now;
    }

    if (lastProtocol === "http3" && !protocols.http3.success && protocols.http2.success) {
        finalProtocol = "http2";
        lastProtocol = "http2";
        lastSwitchTime = now;
    }

    // ---------- SAFETY ----------
    if (finalProtocol === "udp" && !udpEligible) {
        const fallback =
            (sorted.find(([name]) => name === "http2" && protocols.http2.success) as [ProtocolName, number])?.[0] ||
            (sorted.find(([name]) => name === "http3" && protocols.http3.success) as [ProtocolName, number])?.[0] ||
            "http2";

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
