import assert from "node:assert/strict";
import test from "node:test";
import { decideBestProtocol } from "../src/switcher";
import { ControlState, NetworkStats, ProtocolComparison } from "../src/types";

function baseControl(): ControlState {
    return {
        running: true,
        mode: "auto",
        targetUrl: "https://example.com",
        probeHost: "1.1.1.1",
        probePort: 443,
        intervalMs: 1000,
        mockMode: true,
    };
}

function stableNetwork(): NetworkStats {
    return {
        timestamp: Date.now(),
        rttMs: 28,
        jitterMs: 4,
        packetLoss: 0.01,
        sampleCount: 8,
        source: "mock",
    };
}

test("manual mode always enforces selected protocol", () => {
    const protocols: ProtocolComparison = {
        http2: { protocol: "http2", latencyMs: 20, throughputMbps: 220, packetLoss: 0, success: true },
        http3: { protocol: "http3", latencyMs: 30, throughputMbps: 200, packetLoss: 0, success: true },
        udp: { protocol: "udp", latencyMs: 10, throughputMbps: 250, packetLoss: 0.3, success: true },
    };

    const control = baseControl();
    control.mode = "manual";
    control.manualProtocol = "http3";

    const decision = decideBestProtocol(protocols, stableNetwork(), control);
    assert.equal(decision.bestProtocol, "http3");
    assert.equal(decision.confidence, 100);
});

test("high packet loss tends to favor http3", () => {
    const protocols: ProtocolComparison = {
        http2: { protocol: "http2", latencyMs: 75, throughputMbps: 110, packetLoss: 0.11, success: true },
        http3: { protocol: "http3", latencyMs: 52, throughputMbps: 180, packetLoss: 0.03, success: true },
        udp: { protocol: "udp", latencyMs: 18, throughputMbps: 300, packetLoss: 0.3, success: true },
    };

    const network = {
        ...stableNetwork(),
        packetLoss: 0.12,
        rttMs: 84,
    };

    const decision = decideBestProtocol(protocols, network, baseControl());
    assert.equal(decision.bestProtocol, "http3");
    assert.match(decision.reason, /packet loss|QUIC|resilience/i);
});

test("stable low-latency network tends to favor http2", () => {
    const protocols: ProtocolComparison = {
        http2: { protocol: "http2", latencyMs: 24, throughputMbps: 250, packetLoss: 0.001, success: true },
        http3: { protocol: "http3", latencyMs: 40, throughputMbps: 190, packetLoss: 0.002, success: true },
        udp: { protocol: "udp", latencyMs: 11, throughputMbps: 270, packetLoss: 0.08, success: true },
    };

    const decision = decideBestProtocol(protocols, stableNetwork(), baseControl());
    assert.equal(decision.bestProtocol, "http2");
    assert.match(decision.reason, /stable low latency|efficient/i);
});

test("8% packet loss should not choose udp", () => {
    const protocols: ProtocolComparison = {
        http2: { protocol: "http2", latencyMs: 35, throughputMbps: 180, packetLoss: 0.03, success: true },
        http3: { protocol: "http3", latencyMs: 30, throughputMbps: 210, packetLoss: 0.02, success: true },
        udp: { protocol: "udp", latencyMs: 14, throughputMbps: 320, packetLoss: 0.08, success: true },
    };

    const network = {
        ...stableNetwork(),
        packetLoss: 0.08,
        rttMs: 52,
        jitterMs: 16,
    };

    const decision = decideBestProtocol(protocols, network, baseControl());
    assert.notEqual(decision.bestProtocol, "udp");
    assert.ok(["http2", "http3"].includes(decision.bestProtocol));
});
