import {
    Activity,
    BookOpen,
    HelpCircle,
    LayoutDashboard,
    Settings,
    ShieldCheck,
    Stethoscope,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useNetworkStore } from "../store/networkStore";

export const Sidebar = () => {
    const location = useLocation();
    const { connectionStatus, control } = useNetworkStore();
    const connected = connectionStatus === "connected";

    return (
        <aside className="fixed left-0 top-0 h-screen w-16 lg:w-64 bg-surface-container-low flex flex-col gap-4 py-8 px-2 lg:px-6 z-40 border-r border-outline-variant/5">
            <div className="mb-10 px-2 lg:px-4 hidden lg:block">
                <h1 className="font-display font-bold text-primary text-xl tracking-widest">SMART PROTOCOL</h1>
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    SWITCHER V.4.2
                </p>
            </div>

            <nav className="flex flex-col gap-2">
                <NavLink
                    to="/"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive || location.pathname === ""
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <LayoutDashboard size={18} className="shrink-0" />
                    <span className="hidden lg:inline">Dashboard</span>
                </NavLink>

                <NavLink
                    to="/analyzer"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <Activity size={18} className="shrink-0" />
                    <span className="hidden lg:inline">Protocol Analyzer</span>
                </NavLink>

                <div className="h-px w-full bg-outline-variant/10 my-2"></div>



                <NavLink
                    to="/security-logs"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <ShieldCheck size={18} className="shrink-0" />
                    <span className="hidden lg:inline">Security Logs</span>
                </NavLink>

                <NavLink
                    to="/system-health"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <Stethoscope size={18} className="shrink-0" />
                    <span className="hidden lg:inline">System Health</span>
                </NavLink>

                <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <Settings size={18} className="shrink-0" />
                    <span className="hidden lg:inline">Settings</span>
                </NavLink>
            </nav>

            <div className="mt-auto flex flex-col gap-2">
                <div className="p-2 lg:p-4 rounded-2xl bg-surface-container-high border border-outline-variant/10 mb-4 hidden lg:block">
                    <p className="text-[10px] uppercase tracking-widest text-outline mb-2">Engine Status</p>
                    <div className="flex items-center gap-2">
                        <div
                            className={`w-2 h-2 rounded-full ${connected ? "bg-primary animate-pulse" : "bg-error"}`}
                        ></div>
                        <span className="text-xs font-bold text-on-surface">
                            {connected ? "Active" : "Disconnected"}
                        </span>
                    </div>
                    <div className="mt-2 text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">
                        {control?.mode === "manual" ? "Manual Override" : "Auto Switching"}
                    </div>
                </div>

                <NavLink
                    to="/docs"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <BookOpen size={18} className="shrink-0" />
                    <span className="hidden lg:inline">Docs</span>
                </NavLink>
                
                <NavLink
                    to="/support"
                    className={({ isActive }) =>
                        `p-3 lg:p-4 font-body text-xs font-semibold uppercase tracking-widest flex items-center justify-center lg:justify-start gap-4 transition-all duration-200 rounded-2xl ${
                            isActive
                                ? "bg-surface-container-highest text-primary shadow-[0_0_20px_rgba(0,173,181,0.15)]"
                                : "text-slate-500 hover:bg-surface-container-high hover:text-white hover:translate-x-1"
                        }`
                    }
                >
                    <HelpCircle size={18} className="shrink-0" />
                    <span className="hidden lg:inline">Support</span>
                </NavLink>
            </div>
        </aside>
    );
};
