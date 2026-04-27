export const dashboardMetrics = {
    latency: { value: 24, unit: 'ms', change: '−2.4% FROM LAST HOUR', trend: 'down' },
    packetLoss: { value: 0.02, unit: '%', change: 'STABLE SIGNAL', trend: 'neutral' },
    throughput: { value: 842, unit: 'Mbps', change: '+12.8% OPTIMIZED', trend: 'up' },
    activeProtocol: { name: 'HTTP/3 (QUIC)', detail: 'SECURE UDP TUNNEL' }
};

export const switchLog = [
    { time: '12:44:02 PM', title: 'Switched to HTTP/3', reason: 'Jitter detected on TCP stack (>15ms fluctuation).', type: 'primary' },
    { time: '12:30:15 PM', title: 'BBR Congestion Control Active', reason: 'Throughput increased by 45MB/s on uplink.', type: 'neutral' },
    { time: '11:58:22 AM', title: 'Route Optimization Applied', reason: 'New peering node identified in US-EAST-1.', type: 'neutral' },
    { time: '11:20:01 AM', title: 'Packet Loss Warning', reason: '0.5% loss detected. Initiating redundancy protocol.', type: 'warning' },
];

export const protocolComparison = [
    { name: 'HTTP/3 (QUIC)', latency: '42ms', packetLoss: '0.01%', throughput: '1.2 Gbps', stability: 95, status: 'WINNER', active: true },
    { name: 'HTTP/2 (TCP)', latency: '118ms', packetLoss: '4.2%', throughput: '450 Mbps', stability: 60, status: 'ACTIVE', active: false },
    { name: 'UDP (RAW)', latency: '12ms', packetLoss: '12.5%', throughput: '2.8 Gbps', stability: 35, status: 'IDLE', active: false },
];

export const aiLogs = [
    { time: '14:22:01', type: 'ANALYZING', message: 'Jitter increase detected in Region: US-WEST-2 (TCP retransmits > 5%).' },
    { time: '14:22:03', type: 'COMPUTING', message: 'HOL-blocking probability on current HTTP/2 session: 72%.' },
    { time: '14:22:04', type: 'INITIATING', message: 'Parallel probe of QUIC handshake (0-RTT enabled).' },
    { time: '14:22:05', type: 'SUCCESS', message: 'Handshake complete in 18ms. Throughput gain estimated: +160%.' },
    { time: '14:22:06', type: 'DECISION', message: 'Switching routing layer to HTTP/3. Reason: Congestion window resilience.' },
    { time: '14:22:07', type: 'SYSTEM_IDLE', message: 'Waiting for next telemetry burst...', animate: true },
];

// Mock data for Recharts
export const throughputData = Array.from({ length: 20 }, (_, i) => ({
    time: i,
    latency: Math.floor(Math.random() * 20) + 20,
    throughput: Math.floor(Math.random() * 200) + 600,
}));

export const protocolPerformanceData = Array.from({ length: 20 }, (_, i) => ({
    time: i,
    http3: Math.floor(Math.random() * 10) + 30,
    http2: Math.floor(Math.random() * 30) + 100,
    udp: Math.floor(Math.random() * 5) + 10,
}));
