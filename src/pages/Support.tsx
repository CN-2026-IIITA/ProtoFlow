export const Support = () => {
  return (
    <div className="p-8 lg:p-12 animate-in fade-in duration-500">
      
{/*  Connection Status Card  */}
<section className="relative overflow-hidden bg-surface-container-low rounded-3xl p-6 transition-all duration-300">
<div className="flex justify-between items-start mb-6">
<div className="flex flex-col">
<span className="text-on-surface-variant font-label text-xs uppercase tracking-widest mb-1">Network Integrity</span>
<h2 className="font-display text-3xl font-bold tracking-tight">Active Node</h2>
</div>
<div className="flex items-center gap-2 bg-surface-container-highest px-3 py-1.5 rounded-full">
<span className="relative flex h-3 w-3">
<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
<span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
</span>
<span className="text-primary font-label text-sm font-bold">FRA-01</span>
</div>
</div>
<div className="grid grid-cols-2 gap-4">
<div className="bg-surface-container-highest/40 p-4 rounded-2xl">
<div className="text-primary-fixed-dim font-display text-2xl font-bold">99.9%</div>
<div className="text-on-surface-variant text-[10px] uppercase font-bold tracking-tighter">Signal Stability</div>
</div>
<div className="bg-surface-container-highest/40 p-4 rounded-2xl">
<div className="text-on-surface font-display text-2xl font-bold">14ms</div>
<div className="text-on-surface-variant text-[10px] uppercase font-bold tracking-tighter">Latency</div>
</div>
</div>
{/*  Kinetic Signal Visualizer  */}
<div className="absolute bottom-0 left-0 w-full h-1 bg-surface-container-highest overflow-hidden">
<div className="h-full bg-primary w-1/3 animate-[pulse_2s_infinite]"></div>
</div>
</section>
{/*  Recent Logs Card  */}
<section className="bg-surface-container-low rounded-3xl p-6">
<div className="flex items-center justify-between mb-6">
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-tertiary">terminal</span>
<h3 className="font-display font-semibold text-lg">System Logs</h3>
</div>
<span className="text-on-surface-variant font-label text-xs">Live Feed</span>
</div>
<div className="bg-surface-container-lowest rounded-2xl p-4 font-mono text-sm leading-relaxed overflow-hidden border border-outline-variant/10">
<div className="flex gap-3 mb-2">
<span className="text-outline shrink-0">[12:44:02]</span>
<span className="text-on-surface">Switched to HTTP/3 protocol</span>
</div>
<div className="flex gap-3 mb-2">
<span className="text-outline shrink-0">[12:44:05]</span>
<span className="text-primary">Node FRA-01 handshake successful</span>
</div>
<div className="flex gap-3 mb-2 opacity-60">
<span className="text-outline shrink-0">[12:45:12]</span>
<span className="text-on-surface">Entropy pool re-seeded via local source</span>
</div>
<div className="flex gap-3 opacity-40">
<span className="text-outline shrink-0">[12:45:22]</span>
<span className="text-on-surface">Cleaning cache headers...</span>
</div>
</div>
</section>
{/*  Primary Action Cluster  */}
<div className="grid grid-cols-2 gap-4">
<button className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-surface-container-highest/50 text-on-surface font-bold border border-outline-variant/20 hover:bg-surface-container-highest transition-all active:scale-95">
<span className="material-symbols-outlined text-[20px]">ios_share</span>
<span className="font-label">Export Logs</span>
</button>
<button className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-kinetic-gradient text-on-primary font-bold shadow-lg shadow-primary-container/20 hover:opacity-90 transition-all active:scale-95">
<span className="material-symbols-outlined text-[20px]" style={{fontVariationSettings: "'FILL' 1"}}>report</span>
<span className="font-label">Report Issue</span>
</button>
</div>
{/*  Help Modules  */}
<section className="grid grid-cols-1 gap-4">
<div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-2xl group cursor-pointer hover:bg-surface-container-high transition-colors">
<div className="w-12 h-12 rounded-xl bg-tertiary/10 flex items-center justify-center text-tertiary">
<span className="material-symbols-outlined">description</span>
</div>
<div className="flex-1">
<h4 className="font-semibold text-on-surface">Documentation</h4>
<p className="text-on-surface-variant text-sm">Integration guides and API specs</p>
</div>
<span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">chevron_right</span>
</div>
<div className="flex items-center gap-4 p-4 bg-surface-container-low rounded-2xl group cursor-pointer hover:bg-surface-container-high transition-colors">
<div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
<span className="material-symbols-outlined">forum</span>
</div>
<div className="flex-1">
<h4 className="font-semibold text-on-surface">Community Hub</h4>
<p className="text-on-surface-variant text-sm">Join the Aether Protocol discord</p>
</div>
<span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">chevron_right</span>
</div>
</section>

    </div>
  );
};
