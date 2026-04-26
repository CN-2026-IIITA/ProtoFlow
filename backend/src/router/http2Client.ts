import http2 from "node:http2";

export interface RouteRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
    timeoutMs?: number;
}

export async function requestHttp2(options: RouteRequestOptions): Promise<Response> {
    const target = new URL(options.url);
    const authority = `${target.protocol}//${target.host}`;
    const path = `${target.pathname}${target.search}` || "/";

    return new Promise((resolve, reject) => {
        const client = http2.connect(authority);
        const timeoutMs = options.timeoutMs ?? 5000;

        const reqOptions: http2.OutgoingHttpHeaders = {
            ":path": path,
            ":method": options.method || "GET",
            ...options.headers,
        };

        const start = performance.now();
        let completed = false;

        const cleanup = () => {
            try { client.close(); } catch {}
        };

        const fail = (err: unknown) => {
            if (completed) return;
            completed = true;
            clearTimeout(timer);
            cleanup();
            reject(err instanceof Error ? err : new Error(String(err)));
        };

        client.on("error", (err) => {
            console.error("[http2] session error:", err.message);
            fail(err);
        });

        const request = client.request(reqOptions);

        const timer = setTimeout(() => {
            if (completed) return;
            fail(new Error(`HTTP/2 timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        request.on("response", (headers) => {
            let bodyStr = "";

            request.on("data", (chunk: Buffer) => {
                bodyStr += chunk.toString("utf8");
            });

            request.on("end", () => {
                if (completed) return;
                completed = true;
                clearTimeout(timer);
                cleanup();

                const latencyMs = Math.max(1, performance.now() - start);

                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(headers)) {
                    if (value && !key.startsWith(":")) {
                        responseHeaders.set(key, String(value));
                    }
                }

                responseHeaders.set("x-router-latency", latencyMs.toFixed(2));
                responseHeaders.set("x-router-protocol", "http2");

                resolve(new Response(bodyStr, {
                    status: Number(headers[":status"]) || 200,
                    headers: responseHeaders,
                }));
            });
        });

        request.on("error", (err) => {
            console.error("[http2] request error:", err.message);
            fail(err);
        });

        request.on("close", () => {
            if (!completed) {
                fail(new Error("HTTP/2 connection closed prematurely"));
            }
        });

        if (options.body) {
            request.write(options.body);
        }

        request.end();
    });
}