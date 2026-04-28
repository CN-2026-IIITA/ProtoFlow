import { randomUUID } from "node:crypto";
import { EventLog, EventSeverity, OptimizerSnapshot, ProtocolName } from "./types";

// ---------- thresholds ----------
const HIGH_LATENCY_MS    = 300;
const HIGH_JITTER_MS     = 80;
const HIGH_LOSS_RATE     = 0.15;   // 15 %
const LOW_THROUGHPUT_MBPS = 1.0;
const CRITICAL_LATENCY_MS = 600;
const CRITICAL_LOSS_RATE  = 0.4;
const COOLDOWN_MS         = 10_000; // 10 s between identical event keys

// ---------- state ----------
const PROTOCOLS: ProtocolName[] = ["http2", "http3", "udp"];

/** Last time a given event-key was emitted (epoch ms). */
const cooldownMap = new Map<string, number>();

/** Last known success state per protocol (undefined = not yet seen). */
const protoSuccessState = new Map<ProtocolName, boolean>();

// ---------- helpers ----------
function makeId(): string {
    return randomUUID();
}

function severityFor(critical: boolean, warning: boolean): EventSeverity {
    if (critical) return "CRITICAL";
    if (warning)  return "WARNING";
    return "INFO";
}

/**
 * Returns true and records the current time if the event key has not fired
 * within COOLDOWN_MS, otherwise returns false.
 */
function allowEvent(key: string, now: number): boolean {
    const last = cooldownMap.get(key);
    if (last !== undefined && now - last < COOLDOWN_MS) return false;
    cooldownMap.set(key, now);
    return true;
}

// ---------- main analyser ----------
export function analyseSnapshot(
    snapshot: OptimizerSnapshot,
    previousBest: ProtocolName | null,
): EventLog[] {
    const events: EventLog[] = [];
    const { network, protocols, decision } = snapshot;
    const ts = snapshot.timestamp;

    // ── ANOMALY: high latency / jitter / loss ───────────────────────────────
    const criticalNet =
        network.rttMs >= CRITICAL_LATENCY_MS || network.packetLoss >= CRITICAL_LOSS_RATE;
    const warningNet =
        network.rttMs >= HIGH_LATENCY_MS ||
        network.jitterMs >= HIGH_JITTER_MS ||
        network.packetLoss >= HIGH_LOSS_RATE;

    if ((criticalNet || warningNet) && allowEvent("ANOMALY", ts)) {
        const parts: string[] = [];
        if (network.rttMs     >= HIGH_LATENCY_MS) parts.push(`latency ${network.rttMs.toFixed(0)} ms`);
        if (network.jitterMs  >= HIGH_JITTER_MS)  parts.push(`jitter ${network.jitterMs.toFixed(0)} ms`);
        if (network.packetLoss >= HIGH_LOSS_RATE) parts.push(`loss ${(network.packetLoss * 100).toFixed(1)} %`);

        events.push({
            id: makeId(),
            timestamp: ts,
            type: "ANOMALY",
            severity: severityFor(criticalNet, warningNet),
            protocol: decision.bestProtocol,
            message: `Network anomaly detected — ${parts.join(", ")}. Source: ${network.source}.`,
        });
    }

    // ── PROTOCOL_SWITCH ─────────────────────────────────────────────────────
    // State changes are inherently non-repetitive — no cooldown needed.
    if (previousBest !== null && previousBest !== decision.bestProtocol) {
        events.push({
            id: makeId(),
            timestamp: ts,
            type: "PROTOCOL_SWITCH",
            severity: "INFO",
            protocol: decision.bestProtocol,
            message: `Protocol switched ${previousBest.toUpperCase()} → ${decision.bestProtocol.toUpperCase()}. Confidence ${decision.confidence}%. Reason: ${decision.reason}`,
        });
    }

    // ── THROUGHPUT_DROP ─────────────────────────────────────────────────────
    for (const proto of PROTOCOLS) {
        const sample = protocols[proto];
        if (!sample.success) continue;
        if (sample.throughputMbps < LOW_THROUGHPUT_MBPS) {
            const key = `THROUGHPUT_DROP:${proto}`;
            if (!allowEvent(key, ts)) continue;

            const critical = sample.throughputMbps < LOW_THROUGHPUT_MBPS * 0.2;
            events.push({
                id: makeId(),
                timestamp: ts,
                type: "THROUGHPUT_DROP",
                severity: severityFor(critical, true),
                protocol: proto,
                message: `${proto.toUpperCase()} throughput degraded to ${sample.throughputMbps.toFixed(2)} Mbps (threshold ${LOW_THROUGHPUT_MBPS} Mbps).`,
            });
        }
    }

    // ── REQUEST_FAILURE / state-change tracking ─────────────────────────────
    // Count how many protocols are currently failing.
    const failingNow = PROTOCOLS.filter(p => !protocols[p].success);
    const allFailing = failingNow.length === PROTOCOLS.length;

    for (const proto of PROTOCOLS) {
        const sample  = protocols[proto];
        const wasOk   = protoSuccessState.get(proto); // undefined on first cycle
        const isOk    = sample.success;

        // Update tracked state (one-per-cycle, no duplication within cycle).
        protoSuccessState.set(proto, isOk);

        if (!isOk && sample.error) {
            // Only emit on transition  OK → FAIL  or after cooldown expires.
            const key = `REQUEST_FAILURE:${proto}`;
            const isNewFailure = wasOk === true;  // was working, now broken
            if (!isNewFailure && !allowEvent(key, ts)) continue;
            if (isNewFailure) cooldownMap.set(key, ts); // record so cooldown starts now

            const severity: EventSeverity = allFailing ? "CRITICAL" : "WARNING";
            events.push({
                id: makeId(),
                timestamp: ts,
                type: "REQUEST_FAILURE",
                severity,
                protocol: proto,
                message: `${proto.toUpperCase()} probe failed: ${sample.error}`,
            });
        } else if (isOk && wasOk === false) {
            // Transition FAIL → OK: log a recovery as INFO using REQUEST_FAILURE type.
            // Reset cooldown so a future failure will fire immediately again.
            cooldownMap.delete(`REQUEST_FAILURE:${proto}`);
            events.push({
                id: makeId(),
                timestamp: ts,
                type: "REQUEST_FAILURE",
                severity: "INFO",
                protocol: proto,
                message: `${proto.toUpperCase()} probe recovered — connection restored.`,
            });
        }
    }

    return events;
}
