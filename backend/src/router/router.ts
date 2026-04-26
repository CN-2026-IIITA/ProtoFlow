import { engine } from "../server";
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

        // Fallback Logic
        if (bestProtocol === "http3") {
            try {
                const fallbackResponse = await executeWithProtocol("http2", options);
                logRequest("http2", true, fallbackResponse.headers.get("x-router-latency") || "unknown", "fallback");
                return fallbackResponse;
            } catch (fallbackErr: any) {
                logRequest("http2", false, "error", "fallback");
                throw fallbackErr;
            }
        }

        if (bestProtocol === "udp") {
            try {
                const fallbackResponse = await executeWithProtocol("http3", options);
                logRequest("http3", true, fallbackResponse.headers.get("x-router-latency") || "unknown", "fallback");
                return fallbackResponse;
            } catch (fallbackErr) {
                try {
                    const fallbackResponse2 = await executeWithProtocol("http2", options);
                    logRequest("http2", true, fallbackResponse2.headers.get("x-router-latency") || "unknown", "fallback-2");
                    return fallbackResponse2;
                } catch (fallbackErr2: any) {
                    logRequest("http2", false, "error", "fallback-2");
                    throw fallbackErr2;
                }
            }
        }

        throw error;
    }
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
