export type ProtocolName = "http2" | "http3" | "udp";
export type TrafficType = "reliable" | "realtime";

export interface NetworkStats {
    timestamp: number;
    rttMs: number;
    jitterMs: number;
    packetLoss: number;
    sampleCount: number;
    source: "native" | "mock";
}

export interface ProtocolSample {
    protocol: ProtocolName;
    latencyMs: number;
    throughputMbps: number;
    packetLoss: number;
    success: boolean;
    error?: string;
    meta?: Record<string, number | string | boolean>;
}

export interface ProtocolComparison {
    http2: ProtocolSample;
    http3: ProtocolSample;
    udp: ProtocolSample;
}

export interface ProtocolScores {
    http2: number;
    http3: number;
    udp: number;
}

export interface Decision {
    bestProtocol: ProtocolName;
    confidence: number;
    reason: string;
    scores: ProtocolScores;
    mode: "auto" | "manual";
    manualProtocol?: ProtocolName;
}

export interface ControlState {
    running: boolean;
    mode: "auto" | "manual";
    manualProtocol?: ProtocolName;
    targetUrl: string;
    probeHost: string;
    probePort: number;
    intervalMs: number;
    mockMode: boolean;
    timeoutMs: number;
    turboMode: boolean;

    trafficType: TrafficType;
}

export interface OptimizerSnapshot {
    timestamp: number;
    network: NetworkStats;
    protocols: ProtocolComparison;
    decision: Decision;
    control: ControlState;
}

export interface Http3ProbeResult {
    latencyMs: number;
    handshakeMs: number;
    success: boolean;
    error?: string;
}

export interface UdpProbeResult {
    latencyMs: number;
    jitterMs: number;
    packetLoss: number;
    throughputMbps: number;
    success: boolean;
    packetsSent: number;
    packetsReceived: number;
    error?: string;
}

export interface NativeNetworkStats {
    rtt: number;
    jitter: number;
    loss: number;
    sampleCount: number;
}

export type EventType = "ANOMALY" | "PROTOCOL_SWITCH" | "THROUGHPUT_DROP" | "REQUEST_FAILURE";
export type EventSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface EventLog {
    id: string;
    timestamp: number;
    type: EventType;
    severity: EventSeverity;
    protocol: ProtocolName | "system";
    message: string;
}
