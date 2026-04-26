import dgram from "node:dgram";
import dns from "node:dns/promises";
import { RouteRequestOptions } from "./http2Client";

export async function requestUdp(options: RouteRequestOptions): Promise<Response> {
    return new Promise(async (resolve, reject) => {
        const target = new URL(options.url);
        const host = target.hostname;
        const port = Number(target.port) || (target.protocol === "https:" ? 443 : 80);

        const timeoutMs = options.timeoutMs ?? 2000;
        const client = dgram.createSocket("udp4");
        
        let completed = false;
        const start = performance.now();

        const timer = setTimeout(() => {
            if (completed) return;
            completed = true;
            client.close();
            // Since we are simulating, a timeout on receive is normal 
            // if the remote server doesn't respond to raw UDP datagrams.
            // We resolve a synthesized response.
            resolveSimulatedResponse(host, port, start, true);
        }, timeoutMs);

        function resolveSimulatedResponse(targetHost: string, targetPort: number, startTime: number, timedOut: boolean) {
            const latencyMs = Math.max(1, performance.now() - startTime);
            
            const headers = new Headers();
            headers.set("content-type", "application/json");
            headers.set("x-router-protocol", "udp");
            headers.set("x-router-latency", latencyMs.toFixed(2));

            const simulatedBody = JSON.stringify({
                status: "ok",
                protocol: "udp",
                message: `Raw datagram sent to ${targetHost}:${targetPort}.`,
                timedOut,
                latencyMs,
            });

            resolve(new Response(simulatedBody, {
                status: 200,
                headers,
            }));
        }

        client.on("error", (err) => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            client.close();
            reject(err);
        });

        client.on("message", (msg) => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            client.close();
            
            // If we actually get a response!
            const latencyMs = Math.max(1, performance.now() - start);
            const headers = new Headers();
            headers.set("content-type", "application/octet-stream");
            headers.set("x-router-protocol", "udp");
            headers.set("x-router-latency", latencyMs.toFixed(2));
            headers.set("x-udp-bytes-received", msg.length.toString());

            resolve(new Response(msg, {
                status: 200,
                headers,
            }));
        });

        try {
            // Resolve DNS
            const addresses = await dns.resolve4(host);
            if (addresses.length === 0) {
                throw new Error(`Could not resolve IPv4 for ${host}`);
            }

            const ip = addresses[0];
            const payload = options.body ? Buffer.from(options.body as string) : Buffer.from("PING");

            client.send(payload, port, ip, (err) => {
                if (err) {
                    if (completed) return;
                    completed = true;
                    clearTimeout(timer);
                    client.close();
                    return reject(err);
                }
                
                // Payload sent successfully.
                // We wait for a response or timeout.
            });
        } catch (err) {
            if (!completed) {
                completed = true;
                clearTimeout(timer);
                client.close();
                reject(err);
            }
        }
    });
}
