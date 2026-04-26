import { Bell, Search, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useNetworkStore } from "../store/networkStore";

export const Topbar = () => {
    const location = useLocation();
    const title = location.pathname === "/analyzer" ? "Protocol Analyzer" : "Dashboard";
    const { connectionStatus, control, decision, lastUpdated, toggleRunning } = useNetworkStore();
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    const freshnessSeconds = useMemo(() => {
        if (!lastUpdated) {
            return null;
        }
        return Math.max(0, Math.floor((now - lastUpdated) / 1000));
    }, [lastUpdated, now]);

    const isConnected = connectionStatus === "connected";
    const isRunning = control?.running ?? false;
    const mode = control?.mode ?? decision?.mode ?? "auto";

    return (
        <header className="bg-surface/70 backdrop-blur-2xl sticky top-0 z-30 flex justify-between items-center px-8 py-4 w-full border-b border-outline-variant/5">
            <div className="flex items-center gap-6">
                <div className="text-2xl font-black text-primary tracking-tight font-display uppercase">{title}</div>
                {location.pathname === "/" && (
                    <span
                        className={`px-3 py-1 text-[10px] font-bold rounded-full border tracking-wider ${
                            isRunning
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-error/10 text-error border-error/20"
                        }`}
                    >
                        {isRunning ? "RUNNING" : "STOPPED"}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-4 lg:gap-6">
                <div className="hidden lg:flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold">
                    <span className={isConnected ? "text-primary" : "text-error"}>
                        {isConnected ? "Connected" : "Disconnected"}
                    </span>
                    <span className="text-on-surface-variant">{mode === "manual" ? "Manual Mode" : "Auto Mode"}</span>
                    <span className="text-on-surface-variant">
                        Last Updated: {freshnessSeconds === null ? "--" : `${freshnessSeconds}s`}
                    </span>
                </div>

                <div className="hidden md:flex bg-surface-container rounded-full px-6 lg:px-10 py-1.5 items-center gap-2 border border-outline-variant/20 focus-within:border-primary transition-colors">
                    <Search className="text-primary" size={16} />
                    <input
                        className="bg-transparent border-none focus:ring-0 focus:outline-none text-xs font-body text-on-surface-variant placeholder:text-slate-600 w-48"
                        placeholder="QUERY SIGNAL..."
                        type="text"
                    />
                </div>

                <button className="text-primary p-2 hover:bg-white/5 rounded-full transition-colors relative">
                    <Bell size={20} />
                    <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-surface"></span>
                </button>

                <button className="text-primary p-2 hover:bg-white/5 rounded-full transition-colors">
                    <Terminal size={20} />
                </button>

                {location.pathname === "/" && (
                    <button
                        onClick={() => {
                            void toggleRunning();
                        }}
                        className="ml-4 bg-gradient-to-br from-primary to-primary-container text-on-primary font-body font-bold px-6 py-2 rounded-2xl text-sm lg:text-base transition-transform active:scale-95 shadow-lg shadow-primary/20"
                    >
                        {isRunning ? "Stop Optimizer" : "Start Optimizer"}
                    </button>
                )}
            </div>
        </header>
    );
};
