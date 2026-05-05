import { engine } from "../server";
import { OptimizerSnapshot, ProtocolName } from "../types";
import { requestHttp2, RouteRequestOptions } from "./http2Client";
import { requestHttp3 } from "./http3Client";
import { requestUdp } from "./udpClient";

export async function routeRequest(options: RouteRequestOptions): Promise<Response> {
    const snapshot = engine.getSnapshot();
    const bestProtocol = snapshot?.decision?.bestProtocol || "http2";

    try {
        const response = await executeWithProtocol(bestProtocol, options);
        logRequest(bestProtocol, true, response.headers.get("x-router-latency") || "unknown");
        return response;
    } catch (error: any) {
        logRequest(bestProtocol, false, "error");
        console.warn(`[router] ${bestProtocol} failed: ${error.message}. Attempting fallback...`);

        const fallbackOrder = buildFallbackOrder(snapshot, bestProtocol);

        for (const fallbackProtocol of fallbackOrder) {
            try {
                const fallbackResponse = await executeWithProtocol(fallbackProtocol, options);
                logRequest(
                    fallbackProtocol,
                    true,
                    fallbackResponse.headers.get("x-router-latency") || "unknown",
                    "fallback",
                );
                return fallbackResponse;
            } catch (fallbackErr: any) {
                logRequest(fallbackProtocol, false, "error", "fallback");
            }
        }

        throw error;
    }
}

function buildFallbackOrder(snapshot: OptimizerSnapshot | null, failedProtocol: ProtocolName): ProtocolName[] {
    if (!snapshot) {
        return failedProtocol === "http2" ? ["http3", "udp"] : ["http2", "http3"];
    }

    const fallbackProtocols: ProtocolName[] = [];
    const realtime = snapshot.control.trafficType === "realtime";

    if (failedProtocol !== "http2" && snapshot.protocols.http2.success) {
        fallbackProtocols.push("http2");
    }

    if (failedProtocol === "http2") {
        if (snapshot.protocols.http3.success) {
            fallbackProtocols.push("http3");
        }
        if (realtime && snapshot.protocols.udp.success) {
            fallbackProtocols.push("udp");
        }
        return fallbackProtocols;
    }

    if (failedProtocol === "http3") {
        if (realtime && snapshot.protocols.udp.success) {
            fallbackProtocols.push("udp");
        }
        return fallbackProtocols;
    }

    // UDP is the least reliable option, so it should fall back to the dependable transport first.
    if (snapshot.protocols.http3.success) {
        fallbackProtocols.push("http3");
    }

    return fallbackProtocols;
}

async function executeWithProtocol(protocol: string, options: RouteRequestOptions): Promise<Response> {
    switch (protocol) {
        case "http3":
            return requestHttp3(options);
        case "udp":
            return requestUdp(options);
        case "http2":
        default:
            return requestHttp2(options);
    }
}

function logRequest(protocol: string, success: boolean, latencyStr: string, context = "primary") {
    console.log(`[router] protocol=${protocol} latency=${latencyStr}ms success=${success} context=${context}`);
}
