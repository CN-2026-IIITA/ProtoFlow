# Project Formula List

This file lists the main formulas used in the project for protocol scoring, throughput estimation, event thresholds, and dashboard display.

## Core backend formulas

- Clamp helper: `clamp(x, min, max) = min(max, max(min, x))`
    - Used throughout scoring and decision logic in [backend/src/metrics.ts](backend/src/metrics.ts) and [backend/src/switcher.ts](backend/src/switcher.ts).

- Latency normalization: `latencyNorm = clamp(latency / 200, 0, 1)`
    - Treats `200 ms` as the upper bound for a bad latency signal.

- Loss normalization: `lossNorm = clamp(loss / 0.06, 0, 1)`
    - Treats `6%` packet loss as a severe loss signal.

- Throughput signal normalization: `throughputSignal = clamp(log1p(max(throughput, 0)) / log1p(320), 0, 1)`
    - Converts throughput into a bounded signal with saturation at `320 Mbps`.

- Throughput penalty: `throughputPenalty = 1 - throughputSignal`

- Jitter normalization: `jitterNorm = clamp(jitter / 60, 0, 1)`

- Base protocol score: `score = 0.38 * latencyNorm + 0.42 * lossNorm + 0.14 * throughputPenalty + 0.06 * jitterNorm`
    - This is the main weighted score in [backend/src/metrics.ts](backend/src/metrics.ts).

- HTTP/2 adjustment: `score += loss * 0.75 + jitter * 0.0008`

- HTTP/3 adjustment: `score -= min(loss * 0.15, 0.08) + jitter * 0.00035`

- UDP adjustment: `score += loss * 1.15 + jitter * 0.0018 + 0.12`
    - Extra UDP penalty: `score += 0.08` when `loss >= 0.03 || jitter >= 25`.

- Failure penalty: `score += 0.55` when the protocol sample is not successful.

- Protocol confidence: `confidence = round(clamp(max((secondBest - best) / baseline, 0.05), 0, 1) * 100)`
    - Implemented in [backend/src/switcher.ts](backend/src/switcher.ts).

- Network context pressure values:
    - `jitterPressure = clamp(jitterMs / 60, 0, 1)`
    - `lossPressure = clamp(packetLoss / 0.12, 0, 1)`

- Context adjustments:
    - If `packetLoss >= 0.05`, UDP is boosted and HTTP/2 is slightly penalized.
    - If `packetLoss >= 0.08`, UDP is boosted again.
    - If `jitterMs >= 20`, UDP is boosted by `jitterPressure * 0.9 + 0.1` and HTTP/2 by `jitterPressure * 0.08`.
    - If `rttMs >= 100` and HTTP/3 succeeded, HTTP/3 is reduced by `0.03 + lossPressure * 0.04`.

- UDP eligibility rule:
    - `protocols.udp.success && network.packetLoss < 0.03 && network.jitterMs < 22 && protocols.udp.packetLoss < 0.03 && protocols.udp.throughputMbps >= 0.5`

- UDP realtime boost:
    - If realtime mode and the network is clean, `scores.udp -= 0.5`.

- UDP normal-mode penalty:
    - If not realtime, `scores.udp += 1.35`.

- UDP safety penalty:
    - `scores.udp += network.packetLoss * 2.2 + network.jitterMs * 0.01 + 0.65`
    - If UDP is not eligible, add another `1.15`.

- Stickiness bonus:
    - If the current protocol is still healthy, `scores[lastProtocol] -= 0.03` in realtime mode or `0.05` otherwise.

## Throughput formulas

- Fallback throughput in backend probing: `throughput = max(0.1, (protocolBase / latency) * instability)`
    - `instability = max(0.25, 1 - packetLossFactor - jitterFactor)`
    - Used in [backend/src/protocols.ts](backend/src/protocols.ts).

- Estimated throughput:
    - `stabilityFactor = max(0.18, 1 - loss * lossPenaltyByProtocol - jitter * jitterPenaltyByProtocol)`
    - `estimated = (baseByProtocol / (rtt + 18 + (protocol === "http3" ? 10 : 0))) * stabilityFactor`
    - Final value is clamped to `0.1 .. 1200 Mbps`.

- Throughput recovery for successful samples:
    - If the measured throughput is below `1 Mbps`, the code replaces it with `max(1, fallbackThroughput(...))`.

- HTTP/2 measured throughput:
    - `measuredThroughputMbps = (measuredBytes * 8) / (elapsedMs / 1000) / 1_000_000`
    - Fallback throughput: `max(1, 500 / elapsedMs)`

- HTTP/3 derived throughput:
    - `throughputMbps = max(12, 900 / max(1, latencyMs + handshakeMs * 0.45))`

- Success floor:
    - UDP and HTTP/3 throughput are also constrained to at least `1 Mbps` in successful-path handling.

- Throughput stabilization/blending:
    - When a current sample is valid, the project blends it with the previous sample using a protocol-specific weight.
    - When a sample is weak or missing, the code blends the previous throughput with the estimated throughput using a recovery weight.

## Event and health thresholds

- High latency: `rttMs >= 300`
- High jitter: `jitterMs >= 80`
- High loss: `packetLoss >= 0.15`
- Critical latency: `rttMs >= 600`
- Critical loss: `packetLoss >= 0.4`

- Throughput drop event: `sample.throughputMbps < 1.0`
    - Critical throughput drop if `sample.throughputMbps < 0.2`.

- Health labels in the UI:
    - `CRITICAL` if `rttMs >= 600 || packetLoss >= 0.4`
    - `DEGRADED` if `rttMs >= 300 || packetLoss >= 0.15`
    - `STRESSED` if `rttMs >= 150 || packetLoss >= 0.05`
    - `HEALTHY` otherwise

## Frontend display formulas

- Packet loss percent display: `packetLossPercent = packetLoss * 100`
    - Used in [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx) and [src/pages/SystemHealth.tsx](src/pages/SystemHealth.tsx).

- Trend bar height: `height = max(4, (value / maxValue) * 100)%`

- RTT bar width: `width = min((rttMs / 600) * 100, 100)%`

- Jitter bar width: `width = min((jitterMs / 100) * 100, 100)%`

- Packet-loss bar width: `width = min((currentLoss / 0.4) * 100, 100)%`

- Switch-count bar width: `width = min(switchCount * 10, 100)%`

- Protocol stability score in the analyzer: `stability = max(0, round((1 - min(score, 1.5) / 1.5) * 100))`

- Confidence bar width in the analyzer: `width = confidence%`

## Source files touched by formulas

- [backend/src/metrics.ts](backend/src/metrics.ts)
- [backend/src/switcher.ts](backend/src/switcher.ts)
- [backend/src/protocols.ts](backend/src/protocols.ts)
- [backend/src/eventLogger.ts](backend/src/eventLogger.ts)
- [src/pages/SystemHealth.tsx](src/pages/SystemHealth.tsx)
- [src/pages/ProtocolAnalyzer.tsx](src/pages/ProtocolAnalyzer.tsx)
- [src/pages/Dashboard.tsx](src/pages/Dashboard.tsx)
