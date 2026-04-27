export const Docs = () => {
  return (
    <div className="p-8 lg:p-12 animate-in fade-in duration-500">
      
{/*  Header Section  */}
<section className="mb-16">
<div className="inline-block px-3 py-1 mb-4 rounded-full bg-primary/10 border border-primary/20">
<span className="text-xs font-bold text-primary tracking-widest uppercase">Aether Protocol</span>
</div>
<h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6 text-on-background">
                Next-Gen <span className="text-primary italic">Kinetic</span> Traffic
            </h1>
<p className="text-xl text-on-surface-variant max-w-2xl leading-relaxed">
                Documentation for the world's first protocol-agnostic traffic optimizer. Achieve zero-latency switching between transport layers with sub-millisecond decision logic.
            </p>
</section>
{/*  Section 1: How it works  */}
<section className="mb-24" id="how-it-works">
<div className="flex items-center gap-4 mb-8">
<div className="w-12 h-1 bg-primary"></div>
<h2 className="text-3xl font-bold tracking-tight">How it works</h2>
</div>
<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
<div className="lg:col-span-7 bg-surface-container-low p-8 rounded-2xl relative overflow-hidden group">
<div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
<span className="material-symbols-outlined text-[120px]" style={{fontVariationSettings: "'FILL' 1"}}>bolt</span>
</div>
<h3 className="text-xl font-bold text-primary mb-4">Kinetic Signal Optimization</h3>
<div className="space-y-4 text-on-surface-variant leading-relaxed">
<p>
                            Aether doesn't just route packets; it analyzes the physical characteristics of the network environment in real-time. By measuring jitter, packet loss tail-ends, and round-trip fluctuations, it creates a <strong>kinetic profile</strong> of your connection.
                        </p>
<p>
                            When a signal degrades, the optimizer doesn't wait for a timeout. It preemptively duplicates critical payloads across multiple transport protocols, ensuring the signal remains unbroken regardless of environmental interference.
                        </p>
</div>
</div>
<div className="lg:col-span-5 h-full">
<div className="bg-surface-container-highest h-full p-8 rounded-2xl flex flex-col justify-center border-l-4 border-primary">
<div className="mb-6">
<span className="text-4xl font-bold text-on-background">99.99%</span>
<p className="text-sm text-primary uppercase tracking-widest font-bold">Signal Integrity</p>
</div>
<div className="space-y-6">
<div className="flex items-center gap-4">
<span className="material-symbols-outlined text-tertiary">check_circle</span>
<span className="text-on-surface">Zero-buffer streaming</span>
</div>
<div className="flex items-center gap-4">
<span className="material-symbols-outlined text-tertiary">check_circle</span>
<span className="text-on-surface">Sub-5ms jitter compensation</span>
</div>
<div className="flex items-center gap-4">
<span className="material-symbols-outlined text-tertiary">check_circle</span>
<span className="text-on-surface">Global peer mesh support</span>
</div>
</div>
</div>
</div>
</div>
</section>
{/*  Section 2: Protocol Explanation  */}
<section className="mb-24" id="protocol-explanation">
<div className="flex items-center gap-4 mb-8">
<div className="w-12 h-1 bg-primary"></div>
<h2 className="text-3xl font-bold tracking-tight">Protocol Explanation</h2>
</div>
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
{/*  HTTP/2 Card  */}
<div className="bg-surface-container-low p-8 rounded-2xl flex flex-col hover:bg-surface-container transition-colors">
<div className="w-14 h-14 rounded-xl bg-surface-container-highest flex items-center justify-center mb-6">
<span className="material-symbols-outlined text-primary text-3xl">history</span>
</div>
<h3 className="text-xl font-bold mb-2">HTTP/2 (Legacy)</h3>
<p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                        The fallback standard. Best for static asset delivery and legacy hardware compatibility where advanced QUIC features are unavailable.
                    </p>
<div className="mt-auto pt-4 border-t border-outline-variant/10">
<span className="text-xs font-mono text-outline uppercase tracking-tighter">Use Case: Static Files</span>
</div>
</div>
{/*  HTTP/3 Card  */}
<div className="bg-surface-container-highest p-8 rounded-2xl flex flex-col border-b-4 border-primary shadow-xl">
<div className="w-14 h-14 rounded-xl kinetic-gradient flex items-center justify-center mb-6">
<span className="material-symbols-outlined text-on-primary text-3xl" style={{fontVariationSettings: "'FILL' 1"}}>speed</span>
</div>
<h3 className="text-xl font-bold mb-2">HTTP/3 (QUIC)</h3>
<p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                        The performance baseline. Built on UDP with built-in encryption and stream multiplexing to eliminate Head-of-Line blocking.
                    </p>
<div className="mt-auto pt-4 border-t border-outline-variant/20">
<span className="text-xs font-mono text-primary uppercase tracking-tighter">Use Case: Real-time API</span>
</div>
</div>
{/*  UDP Card  */}
<div className="bg-surface-container-low p-8 rounded-2xl flex flex-col hover:bg-surface-container transition-colors">
<div className="w-14 h-14 rounded-xl bg-surface-container-highest flex items-center justify-center mb-6">
<span className="material-symbols-outlined text-tertiary text-3xl">hub</span>
</div>
<h3 className="text-xl font-bold mb-2">UDP (Raw)</h3>
<p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                        Unfiltered speed. Used for Aether's custom packet fragmentation and multi-path telemetry data without the overhead of TLS handshakes.
                    </p>
<div className="mt-auto pt-4 border-t border-outline-variant/10">
<span className="text-xs font-mono text-tertiary uppercase tracking-tighter">Use Case: Telemetry</span>
</div>
</div>
</div>
</section>
{/*  Section 3: Decision Logic  */}
<section className="mb-24" id="decision-logic">
<div className="flex items-center gap-4 mb-8">
<div className="w-12 h-1 bg-primary"></div>
<h2 className="text-3xl font-bold tracking-tight">Decision Logic</h2>
</div>
<div className="bg-surface-container-lowest p-8 md:p-12 rounded-2xl border border-outline-variant/10">
<div className="flex flex-col md:flex-row gap-12">
<div className="md:w-1/3">
<h3 className="text-2xl font-bold mb-6">The Selection Hierarchy</h3>
<p className="text-on-surface-variant leading-relaxed">
                            Aether utilizes a weighted priority matrix based on three primary telemetry metrics. Decisions are refreshed every 150ms.
                        </p>
<div className="mt-8 space-y-4">
<div className="p-4 rounded-xl bg-surface-container-low">
<span className="text-primary font-bold text-xs uppercase block mb-1">Priority 1</span>
<span className="text-on-surface font-medium">Latency Stability</span>
</div>
<div className="p-4 rounded-xl bg-surface-container-low opacity-70">
<span className="text-outline font-bold text-xs uppercase block mb-1">Priority 2</span>
<span className="text-on-surface font-medium">Throughput Cap</span>
</div>
<div className="p-4 rounded-xl bg-surface-container-low opacity-40">
<span className="text-outline font-bold text-xs uppercase block mb-1">Priority 3</span>
<span className="text-on-surface font-medium">Power Efficiency</span>
</div>
</div>
</div>
<div className="md:w-2/3 space-y-8">
<div className="flex gap-6">
<div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs">1</div>
<div>
<h4 className="text-lg font-bold mb-2">Probe Stage</h4>
<p className="text-on-surface-variant text-sm">Synthetic heartbeat packets are sent across all protocols simultaneously to measure current path efficiency.</p>
</div>
</div>
<div className="flex gap-6">
<div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs">2</div>
<div>
<h4 className="text-lg font-bold mb-2">Metric Comparison</h4>
<p className="text-on-surface-variant text-sm">Real-time stats are compared against the desired Quality of Service (QoS) profile defined by the application layer.</p>
</div>
</div>
<div className="flex gap-6">
<div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-xs">3</div>
<div>
<h4 className="text-lg font-bold mb-2">Path Switching</h4>
<p className="text-on-surface-variant text-sm">If a superior path is detected, the protocol orchestrator migrates active sessions seamlessly using Aether's proprietary "Mirror Shift" technique.</p>
</div>
</div>
{/*  Visual Flow Hint  */}
<div className="mt-12 p-6 rounded-2xl bg-surface-container-low flex items-center justify-between overflow-hidden">
<div className="flex gap-2">
<div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
<div className="w-3 h-3 rounded-full bg-primary/40"></div>
<div className="w-3 h-3 rounded-full bg-primary/20"></div>
</div>
<span className="text-xs font-mono text-primary/60">SIMULATING_ENVIRONMENT_DYNAMICS...</span>
</div>
</div>
</div>
</div>
</section>
{/*  Footer Meta  */}
<footer className="mt-24 pt-12 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between gap-6 text-outline text-xs">
<p>© 2024 Aether Protocol Research Group. All rights reserved.</p>
<div className="flex gap-8">
<a className="hover:text-primary transition-colors" href="#">Security Policy</a>
<a className="hover:text-primary transition-colors" href="#">System Status</a>
<a className="hover:text-primary transition-colors" href="#">Changelog</a>
</div>
</footer>

    </div>
  );
};
