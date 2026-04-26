import { engine } from "../server";
import { RouteRequestOptions } from "./http2Client";

export async function requestHttp3(options: RouteRequestOptions): Promise<Response> {
    const prober = engine.getProber();
    
    // We utilize the existing native HTTP/3 QUIC addon.
    // The addon returns success/latency but not body headers yet.
    // We synthesize a Response to fulfill the router interface.
    
    const start = performance.now();
    const result = await prober.http3Request(options.url);
    const latencyMs = Math.max(1, performance.now() - start);

    if (!result.success) {
        throw new Error(`HTTP/3 request failed: ${result.error || "Unknown error"}`);
    }

    const headers = new Headers();
    headers.set("content-type", "application/json");
    headers.set("x-router-protocol", "http3");
    headers.set("x-router-latency", latencyMs.toFixed(2));
    headers.set("x-quic-handshake-ms", (result.handshakeMs || 0).toFixed(2));

    const simulatedBody = JSON.stringify({
        status: "ok",
        protocol: "http3",
        message: "This is a synthesized response. The native C++ QUIC addon executed successfully but does not currently extract response bodies.",
        url: options.url,
        latencyMs,
    });

    return new Response(simulatedBody, {
        status: 200,
        headers,
    });
}
