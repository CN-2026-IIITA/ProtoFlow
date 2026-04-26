import { Activity, AlertCircle, ChevronRight, Timer, Zap } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useNetworkStore } from "../store/networkStore";

const protocolLabel = {
    http2: "HTTP/2",
    http3: "HTTP/3",
    udp: "UDP",
} as const;

export const Dashboard = () => {
    const {
        metrics,
        protocols,
        decision,
        control,
        throughputHistory,
        switchHistory,
        isLoading,
        error,
        setMode,
        setManualProtocol,
        clearHistory,
    } = useNetworkStore();

    const chartData = useMemo(
        () =>
            throughputHistory.map((point, index) => ({
                time: index,
                latency: Number(point.latency.toFixed(2)),
                throughput: Number(point.throughput.toFixed(2)),
            })),
        [throughputHistory],
    );

    const latencyMs = metrics?.rttMs ?? 0;
    const packetLossPercent = (metrics?.packetLoss ?? 0) * 100;
    const throughputMbps = decision && protocols ? protocols[decision.bestProtocol].throughputMbps : 0;
    const activeProtocolName = decision ? `${protocolLabel[decision.bestProtocol]} Adaptive` : "Pending";
    const activeProtocolDetail = decision?.reason ?? "Waiting for backend decision stream";

    const orderedSwitches = [...switchHistory].reverse();

    return (
        <div className="w-full max-w-[1400px] mx-auto p-8 lg:p-12">
            {(isLoading || error) && (
                <div
                    className={`mb-6 rounded-2xl border px-6 lg:px-10 py-3 text-xs font-bold uppercase tracking-widest ${
                        error
                            ? "border-error/30 bg-error/10 text-error"
                            : "border-primary/20 bg-primary/10 text-primary"
                    }`}
                >
                    {error ? `Backend Notice: ${error}` : "Loading live network snapshot..."}
                </div>
            )}

            {/* Metric Cards Bento */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Latency */}
                <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/5 shadow-[0_0_20px_-5px_rgba(85,216,225,0.2)] flex flex-col justify-between h-40 group hover:-translate-y-1 transition-transform">
                    <div className="flex justify-between items-start">
                        <span className="text-on-surface-variant text-xs font-medium uppercase tracking-widest">
                            Latency
                        </span>
                        <Timer className="text-primary" size={20} />
                    </div>
                    <div>
                        <div className="text-4xl font-black font-display tracking-tighter text-on-surface">
                            {latencyMs.toFixed(1)}
                            <span className="text-primary text-xl ml-1">ms</span>
                        </div>
                        <div className="text-[10px] text-primary mt-1 font-bold">
                            JITTER {metrics?.jitterMs.toFixed(2) ?? "0.00"}ms
                        </div>
                    </div>
                </div>

                {/* Packet Loss */}
                <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/5 flex flex-col justify-between h-40 group hover:-translate-y-1 transition-transform">
                    <div className="flex justify-between items-start">
                        <span className="text-on-surface-variant text-xs font-medium uppercase tracking-widest">
                            Packet Loss
                        </span>
                        <AlertCircle className="text-tertiary" size={20} />
                    </div>
                    <div>
                        <div className="text-4xl font-black font-display tracking-tighter text-on-surface">
                            {packetLossPercent.toFixed(2)}
                            <span className="text-tertiary text-xl ml-1">%</span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant mt-1 font-bold">LOSS IMPACT MONITORING</div>
                    </div>
                </div>

                {/* Throughput */}
                <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/5 flex flex-col justify-between h-40 group hover:-translate-y-1 transition-transform">
                    <div className="flex justify-between items-start">
                        <span className="text-on-surface-variant text-xs font-medium uppercase tracking-widest">
                            Throughput
                        </span>
                        <Activity className="text-primary" size={20} />
                    </div>
                    <div>
                        <div className="text-4xl font-black font-display tracking-tighter text-on-surface">
                            {throughputMbps.toFixed(1)}
                            <span className="text-primary text-xl ml-1">Mbps</span>
                        </div>
                        <div className="text-[10px] text-primary mt-1 font-bold">LIVE PATH PERFORMANCE</div>
                    </div>
                </div>

                {/* Active Protocol */}
                <div className="bg-surface-container-highest p-6 rounded-2xl border border-outline-variant/10 flex flex-col justify-between h-40 group hover:-translate-y-1 transition-transform relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-primary/10 rounded-full blur-2xl"></div>
                    <div className="flex justify-between items-start relative z-10">
                        <span className="text-on-surface-variant text-xs font-medium uppercase tracking-widest">
                            Active Protocol
                        </span>
                        <Zap className="text-primary" size={20} />
                    </div>
                    <div className="relative z-10">
                        <div className="text-2xl font-black font-display tracking-tight text-primary">
                            {activeProtocolName}
                        </div>
                        <div className="text-[10px] text-on-surface-variant mt-1 font-bold">{activeProtocolDetail}</div>
                    </div>
                </div>
            </div>

            {/* Asymmetric Grid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Live Graph Section */}
                <div className="lg:col-span-2 space-y-8">
                    <section className="bg-surface-container-low p-8 rounded-2xl border border-outline-variant/5">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h2 className="text-xl font-bold font-display">Telemetry Stream</h2>
                                <p className="text-xs text-on-surface-variant">
                                    Real-time latency and throughput synchronization
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <span className="flex items-center gap-2 text-[10px] font-bold text-primary px-3 py-1 bg-primary/5 rounded-full uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>{" "}
                                    Throughput
                                </span>
                                <span className="flex items-center gap-2 text-[10px] font-bold text-on-surface-variant px-3 py-1 bg-white/5 rounded-full uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant"></span> Latency
                                </span>
                            </div>
                        </div>

                        <div className="h-64 w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#55d8e1" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#55d8e1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
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
                                        dataKey="throughput"
                                        stroke="#55d8e1"
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorThroughput)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="latency"
                                        stroke="#dde3ef"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                        fillOpacity={0}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    {/* Control Panel Card */}
                    <section className="bg-surface-container-low p-8 rounded-2xl flex flex-col md:flex-row gap-8 items-center justify-between border border-outline-variant/5">
                        <div className="flex flex-wrap items-center gap-6">
                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">
                                    Operation Mode
                                </span>
                                <div className="flex items-center gap-3">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            checked={(control?.mode ?? "auto") === "auto"}
                                            onChange={event => {
                                                void setMode(event.target.checked ? "auto" : "manual");
                                            }}
                                            className="sr-only peer"
                                            type="checkbox"
                                        />
                                        <div className="w-11 h-6 bg-surface-container-highest peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                    </label>
                                    <span className="font-display font-bold">
                                        {(control?.mode ?? "auto") === "auto" ? "Auto Mode" : "Manual Mode"}
                                    </span>
                                </div>
                            </div>

                            <div className="hidden md:block h-10 w-px bg-outline-variant/20"></div>

                            <div className="flex flex-col gap-1">
                                <span className="text-xs text-on-surface-variant font-bold uppercase tracking-widest">
                                    Manual Override
                                </span>
                                <select
                                    value={control?.manualProtocol ?? "http3"}
                                    onChange={event => {
                                        void setManualProtocol(event.target.value as "http2" | "http3" | "udp");
                                    }}
                                    className="bg-surface-container-highest border border-outline-variant/20 text-on-surface text-sm lg:text-base rounded-xl focus:ring-1 focus:ring-primary focus:border-primary font-bold px-6 lg:px-10 py-2 outline-none appearance-none cursor-pointer hover:bg-surface-container-highest/80 transition-colors"
                                >
                                    <option value="http3">HTTP/3</option>
                                    <option value="http2">HTTP/2</option>
                                    <option value="udp">UDP</option>
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={clearHistory}
                            className="bg-surface-variant/30 hover:bg-surface-variant/50 border border-outline-variant/30 px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 w-full md:w-auto"
                        >
                            Reset All Stats
                        </button>
                    </section>
                </div>

                {/* Protocol Switch Timeline */}
                <aside className="bg-surface-container-low rounded-2xl flex flex-col border border-outline-variant/5">
                    <div className="p-8 border-b border-outline-variant/10">
                        <h2 className="text-xl font-bold font-display mb-1">Switch Log</h2>
                        <p className="text-xs text-on-surface-variant">Automated protocol transition history</p>
                    </div>
                    <div className="p-8 space-y-8 overflow-y-auto max-h-[500px]">
                        {orderedSwitches.length === 0 && (
                            <div className="text-xs text-on-surface-variant uppercase tracking-widest">
                                Waiting for protocol transitions...
                            </div>
                        )}

                        {orderedSwitches.map((log, index) => {
                            let borderColor = "border-outline-variant/20";
                            let dotColor = "bg-outline-variant";
                            let timeColor = "text-on-surface-variant";

                            if (log.confidence >= 70) {
                                borderColor = "border-primary/30";
                                dotColor = "bg-primary ring-4 ring-primary/20 animate-pulse";
                                timeColor = "text-primary";
                            } else if (log.confidence < 40) {
                                borderColor = "border-tertiary/30";
                                dotColor = "bg-tertiary";
                                timeColor = "text-tertiary";
                            }

                            return (
                                <div
                                    key={index}
                                    className={`relative pl-6 border-l-2 ${borderColor} group hover:pl-7 transition-all`}
                                >
                                    <div
                                        className={`absolute -left-[7px] top-0 w-3 h-3 rounded-full ${dotColor}`}
                                    ></div>
                                    <p className={`text-[10px] ${timeColor} font-bold mb-1`}>
                                        {new Date(log.timestamp).toLocaleTimeString()}
                                    </p>
                                    <p className="text-sm lg:text-base font-bold text-on-surface">
                                        Switched {log.from ? `${protocolLabel[log.from]} -> ` : ""}
                                        {protocolLabel[log.to]}
                                    </p>
                                    <p className="text-xs text-on-surface-variant mt-1">
                                        {log.reason} ({log.confidence}% confidence)
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-auto p-6 bg-surface-container-highest/30 rounded-b-2xl cursor-pointer hover:bg-surface-container-highest/50 transition-colors">
                        <div className="text-primary text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                            View Full Network History <ChevronRight size={14} />
                        </div>
                    </div>
                </aside>
            </div>

            <footer className="mt-12 flex flex-col md:flex-row justify-between items-center gap-4 lg:gap-6 text-[10px] text-on-surface-variant/60 font-medium uppercase tracking-[0.2em]">
                <div className="flex gap-8">
                    <span>IP: 192.168.1.105</span>
                    <span>Uptime: 14d 02h 33m</span>
                    <span>Node: Seattle-IX-4</span>
                </div>
                <div className="flex gap-4 lg:gap-6">
                    <span>Dynamic Multi-Protocol Traffic Optimizer © 2026</span>
                </div>
            </footer>
        </div>
    );
};
