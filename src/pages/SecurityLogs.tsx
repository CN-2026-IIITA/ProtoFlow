import { useEffect, useRef, useState } from "react";

// ── types ──────────────────────────────────────────────────────────────────
type EventType = "ANOMALY" | "PROTOCOL_SWITCH" | "THROUGHPUT_DROP" | "REQUEST_FAILURE";
type EventSeverity = "CRITICAL" | "WARNING" | "INFO";
type Protocol = "http2" | "http3" | "udp" | "system";

interface EventLog {
  id: string;
  timestamp: number;
  type: EventType;
  severity: EventSeverity;
  protocol: Protocol;
  message: string;
}

const MAX_LOGS = 100;
const SOCKET_URL =
  (import.meta.env.VITE_BACKEND_WS_URL as string | undefined) ??
  "ws://localhost:4317/ws";

// ── helpers ────────────────────────────────────────────────────────────────
const SEV_META: Record<
  EventSeverity,
  { label: string; icon: string; rowCls: string; badgeCls: string; iconCls: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    icon: "dangerous",
    rowCls: "hover:bg-error-container/5 border-l-4 border-error/50",
    badgeCls: "bg-error text-on-error",
    iconCls: "text-error",
  },
  WARNING: {
    label: "WARNING",
    icon: "warning",
    rowCls: "hover:bg-surface-container-highest/40",
    badgeCls: "bg-tertiary text-on-tertiary",
    iconCls: "text-tertiary",
  },
  INFO: {
    label: "INFO",
    icon: "info",
    rowCls: "hover:bg-surface-container-highest/40",
    badgeCls: "bg-surface-container-highest text-on-surface-variant",
    iconCls: "text-primary",
  },
};

const TYPE_META: Record<EventType, { icon: string }> = {
  ANOMALY: { icon: "monitor_heart" },
  PROTOCOL_SWITCH: { icon: "sync_alt" },
  THROUGHPUT_DROP: { icon: "trending_down" },
  REQUEST_FAILURE: { icon: "error" },
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.` +
    String(d.getMilliseconds()).padStart(3, "0").slice(0, 2)
  );
}

// ── hook: raw WS that captures every EVENT_LOG without debounce drops ──────
function useEventLogs(): EventLog[] {
  const [logs, setLogs] = useState<EventLog[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;

    function connect() {
      if (stopped) return;
      try {
        const ws = new WebSocket(SOCKET_URL);
        wsRef.current = ws;

        ws.onmessage = (ev: MessageEvent) => {
          try {
            const payload = JSON.parse(ev.data as string) as {
              type: string;
              data: EventLog;
            };
            if (payload.type !== "EVENT_LOG") return;
            setLogs(prev => {
              const next = [payload.data, ...prev];
              return next.length > MAX_LOGS ? next.slice(0, MAX_LOGS) : next;
            });
          } catch {
            // ignore malformed frames
          }
        };

        ws.onopen = () => {
          attempt = 0;
        };

        ws.onclose = () => {
          if (stopped) return;
          const delay = Math.min(10000, 500 * 2 ** Math.min(attempt++, 5));
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!stopped) {
          const delay = Math.min(10000, 500 * 2 ** Math.min(attempt++, 5));
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        }
      }
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectTimerRef.current !== null)
        window.clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  return logs;
}

// ── component ──────────────────────────────────────────────────────────────
export const SecurityLogs = () => {
  const logs = useEventLogs();
  const [severityFilter, setSeverityFilter] = useState<EventSeverity | "ALL">("ALL");
  const [protocolFilter, setProtocolFilter] = useState<Protocol | "ALL">("ALL");
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  // Clearing is done by tracking IDs cleared so the ring-buffer hook stays
  // as the single source of truth.
  const activeLogs = logs.filter(l => !cleared.has(l.id));

  const criticalCount = activeLogs.filter(l => l.severity === "CRITICAL").length;
  const warningCount = activeLogs.filter(l => l.severity === "WARNING").length;

  const visible = activeLogs.filter(l => {
    if (severityFilter !== "ALL" && l.severity !== severityFilter) return false;
    if (protocolFilter !== "ALL" && l.protocol !== protocolFilter) return false;
    return true;
  });

  const toggleSev = (sev: EventSeverity) =>
    setSeverityFilter(prev => (prev === sev ? "ALL" : sev));

  const clearAll = () => setCleared(new Set(logs.map(l => l.id)));

  return (
    <div className="p-8 lg:p-12 animate-in fade-in duration-500">
      {/*  TopAppBar  */}
      <header className="sticky top-0 z-50 w-full bg-surface/70 backdrop-blur-xl flex justify-between items-center h-20 px-8 font-['Inter'] font-medium">
        <div className="flex items-center gap-6">
          <h1 className="text-lg font-black tracking-widest text-primary uppercase">
            DYNAMIC MULTI-PROTOCOL
          </h1>
          <div className="h-6 w-px bg-outline-variant/30"></div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>{" "}
              SYSTEM_LIVE
            </span>
            <span className="text-slate-500">
              {activeLogs.length > 0 ? `EVENTS: ${activeLogs.length}` : "AWAITING EVENTS"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-colors cursor-pointer active:opacity-80">
              <span className="material-symbols-outlined text-slate-400">notifications_active</span>
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-colors cursor-pointer active:opacity-80">
              <span className="material-symbols-outlined text-slate-400">settings_input_component</span>
            </button>
          </div>
        </div>
      </header>

      {/*  Content Canvas  */}
      <div className="p-8 flex flex-col gap-8">
        {/*  Page Header  */}
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <span className="font-mono text-[10px] text-primary tracking-[0.3em] uppercase">
              Security Module
            </span>
            <h2 className="font-headline text-4xl font-bold tracking-tight">System Event Logs</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end mr-4">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">
                Active Violations
              </span>
              <span
                className={`text-xl font-headline font-bold ${
                  criticalCount > 0 ? "text-error" : "text-primary"
                }`}
              >
                {criticalCount > 0 ? `${criticalCount} CRITICAL` : "NOMINAL"}
              </span>
            </div>
            <div className="w-32 h-10 bg-surface-container-low rounded-xl overflow-hidden flex items-end px-1 pb-1">
              {[0.3, 0.5, 0.2, 0.7, 0.4, 0.6].map((h, i) => (
                <div
                  key={i}
                  className={`w-1/6 mx-0.5 rounded-sm ${
                    criticalCount > 0 ? "bg-error" : "bg-primary"
                  }`}
                  style={{ height: `${h * 100}%`, opacity: 0.2 + h * 0.8 }}
                />
              ))}
            </div>
          </div>
        </div>

        {/*  Filter Bar  */}
        <div className="bg-surface-container-low rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            {/* Severity toggle buttons */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter">
                Severity
              </span>
              <div className="flex gap-1">
                {(["CRITICAL", "WARNING", "INFO"] as EventSeverity[]).map(sev => (
                  <button
                    key={sev}
                    id={`filter-sev-${sev.toLowerCase()}`}
                    onClick={() => toggleSev(sev)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      severityFilter === sev
                        ? sev === "CRITICAL"
                          ? "bg-error-container/60 border border-error/40 text-error"
                          : sev === "WARNING"
                          ? "bg-tertiary/20 border border-tertiary/40 text-tertiary"
                          : "bg-primary/20 border border-primary/40 text-primary"
                        : "bg-surface-container-highest text-on-surface-variant border border-transparent hover:border-outline-variant/20"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-8 w-px bg-outline-variant/10"></div>

            {/* Protocol select */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-tighter">
                Protocol
              </span>
              <select
                id="filter-protocol"
                value={protocolFilter}
                onChange={e => setProtocolFilter(e.target.value as Protocol | "ALL")}
                className="bg-surface-container-highest text-on-surface border-none rounded-lg text-xs font-mono py-1.5 pl-3 pr-8 focus:ring-1 focus:ring-primary/50 outline-none appearance-none"
              >
                <option value="ALL">ALL_PROTOCOLS</option>
                <option value="http2">HTTP/2</option>
                <option value="http3">HTTP/3</option>
                <option value="udp">UDP</option>
                <option value="system">SYSTEM</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-clear-logs"
              onClick={clearAll}
              className="flex items-center gap-2 px-4 py-2 bg-surface-container-highest rounded-xl text-xs font-medium hover:bg-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">delete_sweep</span> CLEAR
            </button>
          </div>
        </div>

        {/*  Log Table  */}
        <div className="bg-surface-container-low rounded-2xl overflow-hidden shadow-2xl">
          <div className="max-h-[600px] overflow-y-auto scroll-smooth">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-surface-container-high/95 backdrop-blur-md">
                <tr>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Timestamp
                  </th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Event Type
                  </th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Protocol
                  </th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Severity
                  </th>
                  <th className="py-4 px-6 text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Message
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-16 text-center text-slate-500 font-mono text-xs tracking-widest"
                    >
                      {activeLogs.length === 0
                        ? "AWAITING EVENTS FROM BACKEND…"
                        : "NO EVENTS MATCH CURRENT FILTERS"}
                    </td>
                  </tr>
                ) : (
                  visible.map(log => {
                    const sev = SEV_META[log.severity];
                    const typ = TYPE_META[log.type];
                    return (
                      <tr key={log.id} className={`group transition-colors ${sev.rowCls}`}>
                        <td className="py-4 px-6 font-mono text-xs text-on-surface-variant whitespace-nowrap">
                          {fmtTime(log.timestamp)}
                        </td>
                        <td className="py-4 px-6">
                          <span className="flex items-center gap-2 text-xs font-bold text-on-surface">
                            <span
                              className={`material-symbols-outlined text-lg ${sev.iconCls}`}
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              {typ.icon}
                            </span>
                            {log.type}
                          </span>
                        </td>
                        <td className="py-4 px-6 font-mono text-[10px] text-primary uppercase">
                          {log.protocol}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${sev.badgeCls}`}
                          >
                            {sev.label}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-xs text-on-surface-variant max-w-sm truncate">
                          {log.message}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/*  Footer  */}
          <div className="bg-surface-container-high px-6 py-4 flex items-center justify-between">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Showing {visible.length} of {activeLogs.length} events (max {MAX_LOGS})
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-error inline-block"></span>
                {criticalCount} CRITICAL
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary inline-block"></span>
                {warningCount} WARNING
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
                {activeLogs.length - criticalCount - warningCount} INFO
              </span>
            </div>
          </div>
        </div>

        {/*  Stat Cards  */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
              Total Events
            </span>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-headline font-bold text-on-surface tracking-tighter">
                {activeLogs.length}
              </span>
              <span className="text-xs text-primary mb-1 font-mono">LIVE</span>
            </div>
            <div className="w-full h-1 bg-surface-container-highest rounded-full mt-2">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min((activeLogs.length / MAX_LOGS) * 100, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
              Critical Events
            </span>
            <div className="flex items-end gap-2">
              <span
                className={`text-3xl font-headline font-bold tracking-tighter ${
                  criticalCount > 0 ? "text-error" : "text-on-surface"
                }`}
              >
                {String(criticalCount).padStart(2, "0")}
              </span>
              <span className="text-xs text-slate-500 mb-1 font-mono">
                {criticalCount > 0 ? "ACTIVE" : "NONE"}
              </span>
            </div>
            <div className="w-full h-1 bg-surface-container-highest rounded-full mt-2">
              <div
                className="h-full bg-error rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (criticalCount / Math.max(activeLogs.length, 1)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
              Warnings
            </span>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-headline font-bold text-on-surface tracking-tighter">
                {String(warningCount).padStart(2, "0")}
              </span>
              <span className="text-xs text-tertiary mb-1 font-mono">MONITORED</span>
            </div>
            <div className="w-full h-1 bg-surface-container-highest rounded-full mt-2">
              <div
                className="h-full bg-tertiary rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (warningCount / Math.max(activeLogs.length, 1)) * 100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="bg-surface-container-low p-6 rounded-2xl md:col-span-1 flex justify-between items-center relative overflow-hidden group">
            <div className="relative z-10 flex flex-col gap-2">
              <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                Network Health
              </span>
              <div className="flex items-center gap-4">
                <span
                  className={`text-3xl font-headline font-bold ${
                    criticalCount > 0
                      ? "text-error"
                      : warningCount > 0
                      ? "text-tertiary"
                      : "text-primary"
                  }`}
                >
                  {criticalCount > 0 ? "DEGRADED" : warningCount > 0 ? "STRESSED" : "OPTIMAL"}
                </span>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:opacity-20 transition-opacity">
              <span
                className="material-symbols-outlined text-[160px]"
                style={{ fontVariationSettings: "'wght' 200" }}
              >
                security
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
