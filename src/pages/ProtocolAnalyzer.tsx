import { Wifi } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNetworkStore } from "../store/networkStore";

const protocolLabel = {
    http2: "HTTP/2",
    http3: "HTTP/3",
    udp: "UDP",
} as const;

export const ProtocolAnalyzer = () => {
    const [isTesting, setIsTesting] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const [activeSimulation, setActiveSimulation] = useState<"latency" | "loss" | "stable" | null>(null);
    const previousBestRef = useRef<"http2" | "http3" | "udp" | null>(null);

    const { protocols, decision, protocolHistory, switchHistory, refreshSnapshot, connectionStatus } =
        useNetworkStore();

    const bestProtocol = decision?.bestProtocol ?? "http3";
    const confidence = decision?.confidence ?? 0;
    const reason = decision?.reason ?? "Waiting for live backend decision...";

    useEffect(() => {
        if (previousBestRef.current && previousBestRef.current !== bestProtocol) {
            setIsSwitching(true);
            const timer = window.setTimeout(() => {
                setIsSwitching(false);
            }, 1200);

            return () => {
                window.clearTimeout(timer);
            };
        }

        previousBestRef.current = bestProtocol;
        return undefined;
    }, [bestProtocol]);

    useEffect(() => {
        previousBestRef.current = bestProtocol;
    }, [bestProtocol]);

    const graphData = useMemo(
        () =>
            protocolHistory.map((point, index) => ({
                time: index,
                http3: Number(point.http3.toFixed(2)),
                http2: Number(point.http2.toFixed(2)),
                udp: Number(point.udp.toFixed(2)),
            })),
        [protocolHistory],
    );

    const rows = useMemo(() => {
        if (!protocols) {
            return [];
        }

        const ordered: Array<"http3" | "http2" | "udp"> = ["http3", "http2", "udp"];

        return ordered.map(name => {
            const sample = protocols[name];
            const score = decision?.scores[name] ?? 1;
            const stability = Math.max(0, Math.round((1 - Math.min(score, 1.5) / 1.5) * 100));

            return {
                key: name,
                name: protocolLabel[name],
                latency: `${sample.latencyMs.toFixed(2)}ms`,
                packetLoss: `${(sample.packetLoss * 100).toFixed(2)}%`,
                throughput: `${sample.throughputMbps.toFixed(2)} Mbps`,
                stability,
                status: name === bestProtocol ? "WINNER" : sample.success ? "ACTIVE" : "IDLE",
                active: name === bestProtocol,
            };
        });
    }, [protocols, decision?.scores, bestProtocol]);

    const aiLogs = useMemo(() => {
        const latestSwitches = [...switchHistory].slice(-5);
        const mapped = latestSwitches.map(entry => ({
            time: new Date(entry.timestamp).toLocaleTimeString(),
            type: "DECISION",
            message: `${entry.from ? `${protocolLabel[entry.from]} -> ` : ""}${protocolLabel[entry.to]} (${entry.confidence}%): ${entry.reason}`,
            animate: false,
        }));

        mapped.push({
            time: new Date().toLocaleTimeString(),
            type: connectionStatus === "connected" ? "SYSTEM_IDLE" : "ANALYZING",
            message:
                connectionStatus === "connected"
                    ? "Streaming live telemetry from backend..."
                    : "Reconnecting to backend stream...",
            animate: connectionStatus !== "connected",
        });

        return mapped;
    }, [switchHistory, connectionStatus]);

    const confidenceBarClass = confidence > 70 ? "bg-primary" : confidence >= 40 ? "bg-tertiary" : "bg-error";

    const handleSimulationToggle = (type: "latency" | "loss" | "stable") => {
        const nextActive = activeSimulation === type ? null : type;
        setActiveSimulation(nextActive);
        
        let payload = {};
        if (nextActive === "latency") payload = { latency: 300 };
        else if (nextActive === "loss") payload = { loss: 0.05 };
        else if (nextActive === "stable") payload = { latency: 50, jitter: 5, loss: 0 };

        fetch("http://localhost:4317/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).catch(console.error);
    };

    const handleRunBenchmark = () => {
        setIsTesting(true);
        let payload = {};
        if (activeSimulation === "latency") payload = { latency: 300 };
        else if (activeSimulation === "loss") payload = { loss: 0.05 };
        else if (activeSimulation === "stable") payload = { latency: 50, jitter: 5, loss: 0 };

        fetch("http://localhost:4317/simulate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }).finally(() => {
            void refreshSnapshot().finally(() => {
                window.setTimeout(() => setIsTesting(false), 800);
            });
        });
    };

    return (
        <div className="w-full max-w-[1400px] mx-auto p-8 lg:p-12 space-y-8">
            {/* Best Protocol Highlight */}
            <section className="relative group">
                <div
                    className={`absolute -inset-0.5 bg-gradient-to-r from-primary to-primary-container rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000 ${isSwitching ? "animate-pulse" : ""}`}
                ></div>
                <div className="relative bg-surface-container-high p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 border border-primary/20">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <span className="inline-flex h-3 w-3 rounded-full bg-primary animate-ping"></span>
                            <span className="font-display text-sm lg:text-base uppercase tracking-widest text-primary-fixed">
                                OPTIMAL SIGNAL FOUND
                            </span>
                        </div>
                        <h2 className="font-display text-3xl md:text-5xl font-black text-on-surface tracking-tight">
                            Best Protocol: <span className="text-primary">{protocolLabel[bestProtocol]}</span>
                        </h2>
                        <p className="text-on-surface-variant text-lg lg:text-xl">Reason: {reason}</p>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="text-center">
                            <div className="text-5xl font-display font-bold text-primary">{confidence}%</div>
                            <div className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mt-1">
                                CONFIDENCE
                            </div>
                            <div className="w-28 h-2 mt-3 bg-surface-container-highest rounded-full overflow-hidden border border-outline-variant/20">
                                <div
                                    className={`h-full transition-all duration-300 ${confidenceBarClass}`}
                                    style={{ width: `${confidence}%` }}
                                ></div>
                            </div>
                        </div>
                        <div className="hidden md:block h-16 w-px bg-outline-variant/30"></div>
                        <div className="bg-surface-container-highest p-4 rounded-xl border border-outline-variant/20 hidden md:block">
                            <Wifi className="text-primary" size={32} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Performance Graph */}
                <div className="lg:col-span-2 bg-surface-container-low rounded-2xl p-6 flex flex-col gap-6 border border-outline-variant/5 shadow-lg">
                    <div className="flex justify-between items-end flex-wrap gap-4 lg:gap-6">
                        <div>
                            <h3 className="font-display text-xl font-bold">Performance Over Time</h3>
                            <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                                REAL-TIME TELEMETRY (ms)
                            </p>
                        </div>
                        <div className="flex gap-4 lg:gap-6">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-primary"></span>
                                <span className="text-[10px] uppercase font-bold text-slate-400">HTTP/3</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-tertiary"></span>
                                <span className="text-[10px] uppercase font-bold text-slate-400">HTTP/2</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full bg-error"></span>
                                <span className="text-[10px] uppercase font-bold text-slate-400">UDP</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-64 w-full relative mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={graphData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2f353e" vertical={false} />
                                <XAxis dataKey="time" hide />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "#1a2029",
                                        borderColor: "#3c494a",
                                        borderRadius: "0.5rem",
                                        fontSize: "12px",
                                    }}
                                    itemStyle={{ color: "#dde3ef" }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="http3"
                                    stroke="#55d8e1"
                                    strokeWidth={3}
                                    fill="#55d8e1"
                                    fillOpacity={0.1}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="http2"
                                    stroke="#ffb68d"
                                    strokeWidth={2}
                                    fill="transparent"
                                />
                                <Area
                                    type="monotone"
                                    dataKey="udp"
                                    stroke="#ffb4ab"
                                    strokeWidth={2}
                                    fill="transparent"
                                    strokeDasharray="4 4"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Manual Testing / Controls */}
                <div className="bg-surface-container-low rounded-2xl p-6 space-y-8 border border-outline-variant/5 shadow-lg">
                    <div>
                        <h3 className="font-display text-xl font-bold">Manual Testing</h3>
                        <p className="text-xs text-on-surface-variant uppercase tracking-widest">SIMULATE CONDITIONS</p>
                    </div>
                    <div className="space-y-4">
                        {/* Toggles */}
                        <div 
                            onClick={() => handleSimulationToggle("latency")}
                            className={`flex items-center justify-between p-4 bg-surface-container-highest rounded-xl cursor-pointer transition-colors ${activeSimulation === "latency" ? "border border-primary/30 shadow-[0_0_10px_rgba(0,173,181,0.1)]" : "border border-outline-variant/10 hover:border-outline-variant/30"}`}>
                            <span className={`text-sm lg:text-base font-medium ${activeSimulation === "latency" ? "text-primary" : ""}`}>High Latency</span>
                            <div className={`w-10 h-5 rounded-full relative p-1 transition-colors ${activeSimulation === "latency" ? "bg-primary/40" : "bg-surface"}`}>
                                <div className={`w-3 h-3 rounded-full absolute ${activeSimulation === "latency" ? "bg-primary right-1" : "bg-slate-400"}`}></div>
                            </div>
                        </div>

                        <div 
                            onClick={() => handleSimulationToggle("loss")}
                            className={`flex items-center justify-between p-4 bg-surface-container-highest rounded-xl cursor-pointer transition-colors ${activeSimulation === "loss" ? "border border-primary/30 shadow-[0_0_10px_rgba(0,173,181,0.1)]" : "border border-outline-variant/10 hover:border-outline-variant/30"}`}>
                            <span className={`text-sm lg:text-base font-medium ${activeSimulation === "loss" ? "text-primary" : ""}`}>Packet Loss (5%)</span>
                            <div className={`w-10 h-5 rounded-full relative p-1 transition-colors ${activeSimulation === "loss" ? "bg-primary/40" : "bg-surface"}`}>
                                <div className={`w-3 h-3 rounded-full absolute ${activeSimulation === "loss" ? "bg-primary right-1" : "bg-slate-400"}`}></div>
                            </div>
                        </div>

                        <div 
                            onClick={() => handleSimulationToggle("stable")}
                            className={`flex items-center justify-between p-4 bg-surface-container-highest rounded-xl cursor-pointer transition-colors ${activeSimulation === "stable" ? "border border-primary/30 shadow-[0_0_10px_rgba(0,173,181,0.1)]" : "border border-outline-variant/10 hover:border-outline-variant/30"}`}>
                            <span className={`text-sm lg:text-base font-medium ${activeSimulation === "stable" ? "text-primary" : ""}`}>Stable Network</span>
                            <div className={`w-10 h-5 rounded-full relative p-1 transition-colors ${activeSimulation === "stable" ? "bg-primary/40" : "bg-surface"}`}>
                                <div className={`w-3 h-3 rounded-full absolute ${activeSimulation === "stable" ? "bg-primary right-1" : "bg-slate-400"}`}></div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleRunBenchmark}
                        className="w-full py-4 bg-gradient-to-r from-primary to-primary-container rounded-2xl font-display font-bold text-on-primary-container uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-[0.98] hover:scale-[1.02] transition-all flex justify-center items-center h-14"
                    >
                        {isTesting ? (
                            <div className="w-5 h-5 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            "Run Benchmark Test"
                        )}
                    </button>
                </div>

                {/* Comparison Table */}
                <div className="lg:col-span-3 bg-surface-container-low rounded-2xl overflow-hidden shadow-lg border border-outline-variant/5">
                    <div className="p-6 border-b border-outline-variant/10">
                        <h3 className="font-display text-xl font-bold">Protocol Matrix</h3>
                        <p className="text-xs text-on-surface-variant uppercase tracking-widest">
                            REAL-TIME COMPARISON
                        </p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-surface-container-highest/50">
                                    <th className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                                        Protocol
                                    </th>
                                    <th className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                                        Latency
                                    </th>
                                    <th className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                                        Packet Loss
                                    </th>
                                    <th className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                                        Throughput
                                    </th>
                                    <th className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                                        Stability
                                    </th>
                                    <th className="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/10">
                                {rows.map(p => (
                                    <tr
                                        key={p.key}
                                        className={
                                            p.active
                                                ? "bg-primary/5 border-l-4 border-primary"
                                                : "hover:bg-surface-container-highest/30 transition-colors"
                                        }
                                    >
                                        <td
                                            className={`px-6 py-6 font-display font-bold ${p.active ? "text-primary" : "text-on-surface"}`}
                                        >
                                            {p.name}
                                        </td>
                                        <td className="px-6 py-6 text-sm lg:text-base">{p.latency}</td>
                                        <td className="px-6 py-6 text-sm lg:text-base">{p.packetLoss}</td>
                                        <td className="px-6 py-6 text-sm lg:text-base">{p.throughput}</td>
                                        <td className="px-6 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-24 h-1.5 bg-surface-container-highest rounded-full overflow-hidden border border-outline-variant/10">
                                                    <div
                                                        className={`h-full rounded-full ${p.active ? "bg-primary" : p.stability > 50 ? "bg-tertiary" : "bg-error"}`}
                                                        style={{ width: `${p.stability}%` }}
                                                    ></div>
                                                </div>
                                                <span className="text-[10px] font-bold">{p.stability}%</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6">
                                            <span
                                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${
                                                    p.status === "WINNER"
                                                        ? "bg-primary/20 text-primary border border-primary/20"
                                                        : p.status === "ACTIVE"
                                                          ? "bg-surface-variant text-slate-300"
                                                          : "bg-surface text-slate-500"
                                                }`}
                                            >
                                                {p.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Decision Explanation (Terminal Style) */}
                <div className="lg:col-span-3 bg-[#080f17] rounded-2xl p-6 border border-outline-variant/20 font-mono text-xs overflow-hidden group shadow-inner">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-outline-variant/10">
                        <div className="flex gap-2">
                            <div className="w-3 h-3 rounded-full bg-error/60 shadow-[0_0_5px_rgba(255,180,171,0.5)]"></div>
                            <div className="w-3 h-3 rounded-full bg-tertiary/60 shadow-[0_0_5px_rgba(255,182,141,0.5)]"></div>
                            <div className="w-3 h-3 rounded-full bg-primary/60 shadow-[0_0_5px_rgba(85,216,225,0.5)]"></div>
                        </div>
                        <div className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">
                            REASONING LOGS // LogicStream v4.2
                        </div>
                    </div>
                    <div className="space-y-2 opacity-90 leading-relaxed">
                        {aiLogs.map((log, i) => (
                            <p key={i} className={log.animate ? "animate-pulse" : ""}>
                                <span className="text-primary mr-2">[{log.time}]</span>
                                <span
                                    className={`font-bold mr-2 ${
                                        log.type === "SUCCESS"
                                            ? "text-primary"
                                            : log.type === "ANALYZING"
                                              ? "text-tertiary"
                                              : log.type === "DECISION"
                                                ? "text-error"
                                                : "text-primary-fixed"
                                    }`}
                                >
                                    {log.type}
                                </span>
                                <span className="text-slate-300">{log.message}</span>
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
