import { useEffect, useRef, useState, useCallback } from "react";

// ── types ──────────────────────────────────────────────────────────────────
type ProtocolName = "http2" | "http3" | "udp";
type EventSeverity = "CRITICAL" | "WARNING" | "INFO";
type EventType = "ANOMALY" | "PROTOCOL_SWITCH" | "THROUGHPUT_DROP" | "REQUEST_FAILURE";

interface NetworkStats {
  rttMs: number;
  jitterMs: number;
  packetLoss: number;
  source: string;
}

interface ProtocolSample {
  latencyMs: number;
  packetLoss: number;
  success: boolean;
}

interface OptimizerSnapshot {
  timestamp: number;
  network: NetworkStats;
  protocols: Record<ProtocolName, ProtocolSample>;
  decision: { bestProtocol: ProtocolName; confidence: number; reason: string };
}

interface EventLog {
  id: string;
  timestamp: number;
  type: EventType;
  severity: EventSeverity;
  protocol: ProtocolName | "system";
  message: string;
}

interface TrendPoint {
  ts: number;
  rttMs: number;
  packetLoss: number;
}

const MAX_TREND = 30;
const MAX_EVENTS = 20;
const WS_URL =
  (import.meta.env.VITE_BACKEND_WS_URL as string | undefined) ??
  "ws://localhost:4317/ws";

// ── helpers ────────────────────────────────────────────────────────────────
function healthLabel(rttMs: number, packetLoss: number): { label: string; cls: string } {
  if (rttMs >= 600 || packetLoss >= 0.4) return { label: "CRITICAL", cls: "text-error" };
  if (rttMs >= 300 || packetLoss >= 0.15) return { label: "DEGRADED", cls: "text-tertiary" };
  if (rttMs >= 150 || packetLoss >= 0.05) return { label: "STRESSED", cls: "text-tertiary" };
  return { label: "HEALTHY", cls: "text-primary" };
}

function fmtMs(n: number | null | undefined): string { return typeof n === "number" && isFinite(n) ? `${n.toFixed(0)} ms` : "—"; }
function safeMin(arr: number[], fallback = 0) { return arr.length ? Math.min(...arr) : fallback; }
function safeMax(arr: number[], fallback = 0) { return arr.length ? Math.max(...arr) : fallback; }
function fmtPct(n: number | null | undefined): string { return typeof n === "number" && isFinite(n) ? `${(n * 100).toFixed(2)}%` : "—"; }
function fmtTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

const SEV_CLS: Record<EventSeverity, string> = {
  CRITICAL: "text-error",
  WARNING: "text-tertiary",
  INFO: "text-primary",
};

const PROTO_ICONS: Record<ProtocolName, string> = {
  http2: "cloud_sync",
  http3: "language",
  udp: "rebase_edit",
};

// ── mini bar chart ─────────────────────────────────────────────────────────
function TrendBars({
  values,
  colorCls,
  maxVal,
}: {
  values: number[];
  colorCls: string;
  maxVal: number;
}) {
  const safe = maxVal > 0 ? maxVal : 1;
  return (
    <div className="flex items-end gap-0.5 h-16 w-full">
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t-sm transition-all ${colorCls}`}
          style={{ height: `${Math.max(4, (v / safe) * 100)}%`, opacity: 0.4 + (i / values.length) * 0.6 }}
        />
      ))}
    </div>
  );
}

// ── hook ───────────────────────────────────────────────────────────────────
function useHealthData() {
  const [snapshot, setSnapshot] = useState<OptimizerSnapshot | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [events, setEvents] = useState<EventLog[]>([]);
  const [switchCount, setSwitchCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);

  const pushTrend = useCallback((snap: OptimizerSnapshot) => {
    setTrend(prev => {
      const next = [...prev, { ts: snap.timestamp, rttMs: snap.network.rttMs, packetLoss: snap.network.packetLoss }];
      return next.length > MAX_TREND ? next.slice(next.length - MAX_TREND) : next;
    });
  }, []);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;

    function connect() {
      if (stopped) return;
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => { attempt = 0; setConnected(true); };

        ws.onmessage = (ev: MessageEvent) => {
          try {
            const msg = JSON.parse(ev.data as string) as { type: string; data: unknown };

            if (msg.type === "snapshot" || msg.type === "update") {
              const snap = msg.data as OptimizerSnapshot;
              setSnapshot(snap);
              pushTrend(snap);
            }

            if (msg.type === "EVENT_LOG") {
              const log = msg.data as EventLog;
              if (log.type === "PROTOCOL_SWITCH") {
                setSwitchCount(c => c + 1);
              }
              setEvents(prev => {
                const next = [log, ...prev];
                return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
              });
            }
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          if (stopped) return;
          setConnected(false);
          const delay = Math.min(10000, 500 * 2 ** Math.min(attempt++, 5));
          timerRef.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => ws.close();
      } catch {
        if (!stopped) {
          const delay = Math.min(10000, 500 * 2 ** Math.min(attempt++, 5));
          timerRef.current = window.setTimeout(connect, delay);
        }
      }
    }

    connect();
    return () => {
      stopped = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
  }, [pushTrend]);

  return { snapshot, trend, events, switchCount, connected };
}

// ── component ──────────────────────────────────────────────────────────────
export const SystemHealth = () => {
  const { snapshot, trend, events, switchCount, connected } = useHealthData();

  const net = snapshot?.network;
  const protocols = snapshot?.protocols;
  const decision = snapshot?.decision;

  const health = net ? healthLabel(net.rttMs, net.packetLoss) : null;

  const latencies = trend.map(p => p.rttMs).filter(v => isFinite(v));
  const losses = trend.map(p => p.packetLoss * 100).filter(v => isFinite(v));
  const maxLatency = safeMax(latencies, 1);
  const maxLoss = safeMax(losses, 0.01);

  const latencyMin = safeMin(latencies, 0);
  const latencyMax = safeMax(latencies, 0);
  const latencyAvg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const currentLoss = typeof net?.packetLoss === "number" ? net.packetLoss : 0;

  const recentIssues = events.filter(e => e.severity !== "INFO").slice(0, 5);
  const criticalCount = events.filter(e => e.severity === "CRITICAL").length;

  const PROTOCOLS: ProtocolName[] = ["http2", "http3", "udp"];

  // ── loading guard — render placeholder until first WS snapshot arrives ──
  if (!snapshot && !connected) {
    return (
      <div className="p-8 lg:p-12 flex items-center justify-center h-96">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-slate-500 animate-pulse">wifi_off</span>
          <p className="text-slate-500 font-mono text-xs tracking-widest">CONNECTING TO BACKEND…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-12 animate-in fade-in duration-500">

      {/* TopAppBar */}
      <header className="sticky top-0 z-40 w-full bg-[#0e141c]/70 backdrop-blur-xl flex justify-between items-center h-20 px-8 font-['Inter'] font-medium">
        <div className="flex items-center gap-4">
          <span className="text-lg font-black tracking-widest text-[#55d8e1] uppercase">DYNAMIC MULTI-PROTOCOL</span>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] rounded font-bold tracking-tighter">
            {connected ? "LIVE FEED" : "RECONNECTING"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className={`flex items-center gap-1.5 ${connected ? "text-primary" : "text-slate-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-primary animate-pulse" : "bg-slate-500"}`} />
            {connected ? "CONNECTED" : "OFFLINE"}
          </span>
        </div>
      </header>

      <div className="p-8 space-y-8 max-w-[1600px] mx-auto">

        {/* Page Header */}
        <section className="flex flex-col md:flex-row gap-6 items-end justify-between">
          <div className="space-y-2">
            <h1 className="text-5xl font-bold font-headline tracking-tighter text-on-surface">System Health</h1>
            <p className="text-on-surface-variant max-w-lg text-sm">
              Real-time network diagnostics from live probe data. No simulated values.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-surface-container-low px-6 py-4 rounded-2xl flex flex-col gap-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Data Source</span>
              <span className="font-headline font-bold text-lg">
                {net ? (net.source === "native" ? "NATIVE PROBE" : "MOCK MODE") : "—"}
              </span>
            </div>
            <div className="bg-surface-container-low px-6 py-4 rounded-2xl flex flex-col gap-1 min-w-[180px]">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Network Status</span>
              <span className={`font-headline font-bold text-lg ${health?.cls ?? "text-slate-500"}`}>
                {health?.label ?? "AWAITING…"}
              </span>
            </div>
          </div>
        </section>

        {/* Metric Cards */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Current RTT */}
          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col justify-between h-44 hover:bg-surface-container-high transition-colors">
            <div className="flex justify-between items-start">
              <div className="p-3 rounded-xl bg-surface-container-highest text-primary">
                <span className="material-symbols-outlined">speed</span>
              </div>
              <span className="text-[10px] font-bold text-primary">LIVE</span>
            </div>
            <div>
              <div className="text-4xl font-headline font-bold">
                {typeof net?.rttMs === "number" ? net.rttMs.toFixed(0) : "—"}
                <span className="text-xl text-slate-500"> ms</span>
              </div>
              <div className="text-xs text-slate-500 font-medium tracking-wide mt-1 uppercase">Round-Trip Latency</div>
            </div>
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${net && net.rttMs >= 300 ? "bg-error" : "bg-primary"}`}
                style={{ width: `${Math.min((net?.rttMs ?? 0) / 600 * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Jitter */}
          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col justify-between h-44 hover:bg-surface-container-high transition-colors">
            <div className="flex justify-between items-start">
              <div className="p-3 rounded-xl bg-surface-container-highest text-primary">
                <span className="material-symbols-outlined">ssid_chart</span>
              </div>
              <span className="text-[10px] font-bold text-slate-500">JITTER</span>
            </div>
            <div>
              <div className="text-4xl font-headline font-bold">
                {typeof net?.jitterMs === "number" ? net.jitterMs.toFixed(1) : "—"}
                <span className="text-xl text-slate-500"> ms</span>
              </div>
              <div className="text-xs text-slate-500 font-medium tracking-wide mt-1 uppercase">Network Jitter</div>
            </div>
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${net && net.jitterMs >= 80 ? "bg-error" : "bg-primary"}`}
                style={{ width: `${Math.min((net?.jitterMs ?? 0) / 100 * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Packet Loss */}
          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col justify-between h-44 hover:bg-surface-container-high transition-colors">
            <div className="flex justify-between items-start">
              <div className="p-3 rounded-xl bg-surface-container-highest text-tertiary">
                <span className="material-symbols-outlined">nearby_error</span>
              </div>
              <span className={`text-[10px] font-bold ${currentLoss >= 0.15 ? "text-error" : "text-slate-500"}`}>
                {currentLoss >= 0.15 ? "HIGH" : currentLoss >= 0.05 ? "WARN" : "OK"}
              </span>
            </div>
            <div>
              <div className={`text-4xl font-headline font-bold ${currentLoss >= 0.15 ? "text-error" : currentLoss >= 0.05 ? "text-tertiary" : ""}`}>
                {typeof net?.packetLoss === "number" ? (net.packetLoss * 100).toFixed(2) : "—"}
                <span className="text-xl text-slate-500">%</span>
              </div>
              <div className="text-xs text-slate-500 font-medium tracking-wide mt-1 uppercase">Packet Loss</div>
            </div>
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${currentLoss >= 0.15 ? "bg-error" : currentLoss >= 0.05 ? "bg-tertiary" : "bg-primary"}`}
                style={{ width: `${Math.min(currentLoss / 0.4 * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Protocol Switches */}
          <div className="bg-surface-container-low p-6 rounded-2xl flex flex-col justify-between h-44 hover:bg-surface-container-high transition-colors">
            <div className="flex justify-between items-start">
              <div className="p-3 rounded-xl bg-surface-container-highest text-primary">
                <span className="material-symbols-outlined">sync_alt</span>
              </div>
              <span className="text-[10px] font-bold text-slate-500">SESSION</span>
            </div>
            <div>
              <div className="text-4xl font-headline font-bold">{switchCount}</div>
              <div className="text-xs text-slate-500 font-medium tracking-wide mt-1 uppercase">Protocol Switches</div>
            </div>
            <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${Math.min(switchCount * 10, 100)}%` }} />
            </div>
          </div>
        </section>

        {/* Trend Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latency Trend */}
          <div className="bg-surface-container-low rounded-2xl overflow-hidden flex flex-col">
            <div className="p-6 flex justify-between items-center">
              <div className="space-y-1">
                <h3 className="font-headline text-xl font-bold">Latency Trend</h3>
                <p className="text-xs text-slate-500">Last {trend.length} probe samples (live)</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">CURRENT</span>
                <span className="font-bold text-primary">{net ? fmtMs(net.rttMs) : "—"}</span>
              </div>
            </div>
            <div className="px-6 pb-2">
              {trend.length > 0 ? (
                <TrendBars values={latencies} colorCls="bg-primary" maxVal={maxLatency} />
              ) : (
                <div className="h-16 flex items-center justify-center text-xs text-slate-500 font-mono">AWAITING DATA…</div>
              )}
            </div>
            <div className="bg-surface-container px-6 py-3 border-t border-outline-variant/10 flex justify-between">
              <div className="flex gap-6">
                <div><span className="text-[10px] text-slate-500 block">MIN</span><span className="font-bold text-xs">{latencies.length ? fmtMs(latencyMin) : "—"}</span></div>
                <div><span className="text-[10px] text-slate-500 block">AVG</span><span className="font-bold text-xs">{latencies.length ? fmtMs(latencyAvg) : "—"}</span></div>
                <div><span className="text-[10px] text-slate-500 block">MAX</span><span className={`font-bold text-xs ${latencyMax >= 300 ? "text-error" : "text-on-surface"}`}>{latencies.length ? fmtMs(latencyMax) : "—"}</span></div>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <span className="material-symbols-outlined text-sm">radio_button_checked</span>
                {net?.source ?? "—"}
              </div>
            </div>
          </div>

          {/* Packet Loss Trend */}
          <div className="bg-surface-container-low rounded-2xl overflow-hidden flex flex-col">
            <div className="p-6 flex justify-between items-center">
              <div className="space-y-1">
                <h3 className="font-headline text-xl font-bold">Packet Loss Trend</h3>
                <p className="text-xs text-slate-500">Loss % per probe cycle</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">CURRENT</span>
                <span className={`font-bold ${currentLoss >= 0.15 ? "text-error" : currentLoss >= 0.05 ? "text-tertiary" : "text-primary"}`}>
                  {net ? fmtPct(net.packetLoss) : "—"}
                </span>
              </div>
            </div>
            <div className="px-6 pb-2">
              {trend.length > 0 ? (
                <TrendBars
                  values={losses}
                  colorCls={currentLoss >= 0.15 ? "bg-error" : currentLoss >= 0.05 ? "bg-tertiary" : "bg-primary"}
                  maxVal={maxLoss}
                />
              ) : (
                <div className="h-16 flex items-center justify-center text-xs text-slate-500 font-mono">AWAITING DATA…</div>
              )}
            </div>
            <div className="bg-surface-container px-6 py-3 border-t border-outline-variant/10 flex items-center justify-between">
              <div className="flex gap-6">
                <div><span className="text-[10px] text-slate-500 block">MIN</span><span className="font-bold text-xs">{losses.length ? fmtPct(safeMin(losses) / 100) : "—"}</span></div>
                <div><span className="text-[10px] text-slate-500 block">MAX</span><span className="font-bold text-xs">{losses.length ? fmtPct(safeMax(losses) / 100) : "—"}</span></div>
              </div>
              <span className={`text-xs font-bold ${currentLoss >= 0.15 ? "text-error" : currentLoss >= 0.05 ? "text-tertiary" : "text-primary"}`}>
                {currentLoss >= 0.15 ? "⚠ HIGH LOSS" : currentLoss >= 0.05 ? "⚠ ELEVATED" : "✓ NORMAL"}
              </span>
            </div>
          </div>
        </section>

        {/* Protocol Stability + Current Issues */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Protocol Stability */}
          <div className="bg-surface-container-low rounded-2xl p-6 flex flex-col gap-4">
            <div className="space-y-1">
              <h3 className="font-headline text-xl font-bold">Protocol Stability</h3>
              <p className="text-xs text-slate-500">
                Active: <span className="text-primary font-bold uppercase">{decision?.bestProtocol ?? "—"}</span>
                {" · "}{decision?.confidence ?? 0}% confidence
              </p>
            </div>
            <div className="space-y-3">
              {PROTOCOLS.map(proto => {
                const sample = protocols?.[proto];
                const isActive = decision?.bestProtocol === proto;
                const ok = sample?.success ?? false;
                return (
                  <div
                    key={proto}
                    className={`flex items-center justify-between p-4 rounded-xl transition-colors ${
                      isActive ? "bg-primary/10 border border-primary/20" : "bg-surface-container-highest"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isActive ? "bg-primary/20 text-primary" : "bg-[#242a33] text-slate-400"}`}>
                        <span className="material-symbols-outlined text-base">{PROTO_ICONS[proto]}</span>
                      </div>
                      <div>
                        <div className="font-bold text-sm uppercase">{proto}</div>
                        <div className="text-[10px] text-slate-500">
                          {sample ? fmtMs(sample.latencyMs) : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-bold ${ok ? (isActive ? "text-primary" : "text-on-surface") : "text-error"}`}>
                        {ok ? (isActive ? "ACTIVE" : "STANDBY") : "FAIL"}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        loss {sample ? fmtPct(sample.packetLoss) : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {decision && (
              <div className="mt-auto pt-3 border-t border-outline-variant/10 text-xs text-slate-500">
                <span className="font-bold text-on-surface-variant">Reason: </span>{decision.reason}
              </div>
            )}
          </div>

          {/* Current Issue Summary */}
          <div className="lg:col-span-2 bg-surface-container-low rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="font-headline text-xl font-bold">Current Issues</h3>
                <p className="text-xs text-slate-500">Recent anomalies & failures from event log</p>
              </div>
              <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                criticalCount > 0 ? "bg-error/20 text-error" : "bg-primary/10 text-primary"
              }`}>
                {criticalCount > 0 ? `${criticalCount} CRITICAL` : "NOMINAL"}
              </div>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {recentIssues.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-xs tracking-widest">
                  {events.length === 0 ? "AWAITING EVENTS FROM BACKEND…" : "NO ACTIVE ISSUES"}
                </div>
              ) : (
                recentIssues.map(ev => (
                  <div
                    key={ev.id}
                    className={`flex items-start gap-3 p-4 rounded-xl bg-surface-container-highest border-l-2 ${
                      ev.severity === "CRITICAL" ? "border-error" : "border-tertiary"
                    }`}
                  >
                    <span className={`material-symbols-outlined text-base mt-0.5 ${SEV_CLS[ev.severity]}`}>
                      {ev.severity === "CRITICAL" ? "dangerous" : "warning"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-black uppercase ${SEV_CLS[ev.severity]}`}>{ev.severity}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{ev.type}</span>
                        <span className="text-[10px] text-primary font-mono uppercase">{ev.protocol}</span>
                      </div>
                      <p className="text-xs text-on-surface-variant truncate">{ev.message}</p>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">{fmtTime(ev.timestamp)}</span>
                  </div>
                ))
              )}
            </div>

            {/* All recent events mini-list */}
            {events.length > 0 && recentIssues.length > 0 && (
              <div className="border-t border-outline-variant/10 pt-3 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>{events.length} total events this session</span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-error inline-block" />{events.filter(e=>e.severity==="CRITICAL").length} CRIT</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-tertiary inline-block" />{events.filter(e=>e.severity==="WARNING").length} WARN</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />{events.filter(e=>e.severity==="INFO").length} INFO</span>
                </span>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
};
