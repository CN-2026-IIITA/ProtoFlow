import { useEffect, useState } from "react";

interface Config {
  autoSwitch: boolean;
  preferredProtocol: "http2" | "http3" | "udp";
  probeInterval: number;
  timeout: number;
  turboMode: boolean;
}

const API_BASE = "http://localhost:4317";

export const Settings = () => {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/config`)
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(console.error);
  }, []);

  const updateConfig = async (patch: Partial<Config>) => {
    if (!config) return;
    const oldConfig = { ...config };
    setConfig({ ...config, ...patch });

    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to update config");
      const updatedConfig = await res.json();
      setConfig(updatedConfig);
    } catch (err) {
      console.error(err);
      setConfig(oldConfig);
    }
  };

  return (
    <div className="p-8 lg:p-12 animate-in fade-in duration-500">
      
{/*  TopAppBar Component  */}
<header className="sticky top-0 z-40 w-full flex justify-between items-center h-20 px-8 bg-[#0e141c]/70 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
<div className="flex items-center gap-4">
<h2 className="text-lg font-black tracking-widest text-[#55d8e1] uppercase font-['Inter']">DYNAMIC MULTI-PROTOCOL</h2>
</div>
<div className="flex items-center gap-8">
<div className="hidden lg:flex items-center bg-surface-container-low px-4 py-2 rounded-full ghost-border">
<span className="material-symbols-outlined text-outline text-sm">search</span>
<input className="bg-transparent border-none focus:ring-0 text-sm w-64 text-on-surface" placeholder="Search parameters..." type="text"/>
</div>
<div className="flex items-center gap-6">
<span className="material-symbols-outlined text-slate-400 cursor-pointer hover:text-primary transition-colors">notifications_active</span>
<span className="material-symbols-outlined text-slate-400 cursor-pointer hover:text-primary transition-colors">settings_input_component</span>
<span className="material-symbols-outlined text-slate-400 cursor-pointer hover:text-primary transition-colors">account_tree</span>
<div className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center overflow-hidden border border-outline-variant/30">
<img alt="User Profile" className="w-full h-full object-cover" data-alt="close-up portrait of a tech professional with neutral expression and soft studio lighting background" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCo50HV2N8N9FQ-Vj4gIy9wusnJ3DBDx-wIxBAFgegp6dtZhlClioBKmr9ed5UeE0JdPZkaNbEn3a2CP4Y_Y0zdjq-ThyrBcm2382JX0ic3olht68xvlYNwOL2V0s0B_YuxQfcf_Q-V0jEA7x9dA2j7diAY0X4NsiyiE4nz727rUup5CJujVHpPwnb9r9zAS9O6DJUKMSero-4wqtpvCql-wghaVFmVLswga_iCf5W_8OsQH8PCBS4WTVk0zILP6vRl-2oynebCoskN"/>
</div>
</div>
</div>
</header>
{/*  Content Canvas  */}
<div className="p-12 max-w-6xl mx-auto">
<div className="mb-12">
<h3 className="text-4xl font-headline font-bold text-on-surface tracking-tight mb-2">System Configuration</h3>
<p className="text-on-surface-variant max-w-2xl">Modify global traffic orchestration parameters and security protocols. Changes are applied immediately in real-time.</p>
</div>
<div className="grid grid-cols-1 md:grid-cols-12 gap-8">
{/*  Navigation Sub-Sidebar  */}
<div className="md:col-span-3">
<div className="sticky top-32 flex flex-col gap-2">
<button className="flex items-center justify-between px-5 py-4 bg-surface-container-highest rounded-2xl text-primary font-semibold transition-all group">
                            General <span className="material-symbols-outlined text-primary/50 group-hover:translate-x-1 transition-transform">chevron_right</span>
</button>
<button className="flex items-center justify-between px-5 py-4 hover:bg-surface-container-low rounded-2xl text-on-surface-variant transition-all group">
                            Network <span className="material-symbols-outlined opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">chevron_right</span>
</button>
<button className="flex items-center justify-between px-5 py-4 hover:bg-surface-container-low rounded-2xl text-on-surface-variant transition-all group">
                            Protocol Preferences <span className="material-symbols-outlined opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">chevron_right</span>
</button>
<button className="flex items-center justify-between px-5 py-4 hover:bg-surface-container-low rounded-2xl text-on-surface-variant transition-all group">
                            Advanced <span className="material-symbols-outlined opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all">chevron_right</span>
</button>
</div>
</div>
{/*  Settings Content Area  */}
<div className="md:col-span-9 space-y-8">
{/*  Section: General Settings  */}
<section className="bg-surface-container-low rounded-3xl p-8 space-y-10">
<div className="flex items-center gap-4">
<span className="material-symbols-outlined text-primary p-3 bg-primary/10 rounded-xl">settings_suggest</span>
<h4 className="text-2xl font-headline font-semibold">General Optimization</h4>
</div>
{/*  Toggle Switch Setting  */}
{config ? (
<>
<div className="flex items-start justify-between gap-12 group">
<div className="space-y-1">
<label className="text-lg font-medium text-on-surface block">Auto-switching Protocols</label>
<p className="text-sm text-on-surface-variant">Automatically pivot between protocols based on real-time latency and packet loss metrics.</p>
</div>
<button 
  onClick={() => updateConfig({ autoSwitch: !config.autoSwitch })}
  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${config.autoSwitch ? "bg-primary" : "bg-surface-container-highest"}`}>
<span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${config.autoSwitch ? "translate-x-7" : "translate-x-1"}`}></span>
</button>
</div>
{/*  Dropdown Setting  */}
<div className="flex flex-col gap-4">
<div className="space-y-1">
<label className="text-lg font-medium text-on-surface block">Default Preferred Protocol</label>
<p className="text-sm text-on-surface-variant">Primary protocol used for initial handshake before optimization occurs.</p>
</div>
<div className="relative w-full max-w-md">
<select 
  disabled={config.autoSwitch}
  value={config.preferredProtocol}
  onChange={(e) => updateConfig({ preferredProtocol: e.target.value as Config['preferredProtocol'] })}
  className={`w-full bg-surface-container-highest border-none rounded-2xl py-4 px-6 focus:ring-2 focus:ring-primary appearance-none cursor-pointer ${config.autoSwitch ? "text-on-surface-variant/50 cursor-not-allowed" : "text-on-surface"}`}>
<option value="http3">HTTP/3 (QUIC)</option>
<option value="http2">HTTP/2 (TCP)</option>
<option value="udp">UDP Direct</option>
</select>
<span className={`material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${config.autoSwitch ? "text-outline/50" : "text-outline"}`}>expand_more</span>
</div>
</div>
{/*  Numerical Input Group  */}
<div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
<div className="space-y-4">
<div className="space-y-1">
<label className="text-lg font-medium text-on-surface block">Probe Interval</label>
<p className="text-sm text-on-surface-variant">Frequency of health check probes in milliseconds.</p>
</div>
<div className="flex items-center gap-2">
<input 
  className="w-full bg-surface-container-highest border-none rounded-2xl py-4 px-6 text-on-surface focus:ring-2 focus:ring-primary" 
  type="number" 
  value={config.probeInterval}
  onChange={(e) => updateConfig({ probeInterval: parseInt(e.target.value) || 250 })}
/>
<span className="text-sm font-bold text-outline">MS</span>
</div>
</div>
<div className="space-y-4">
<div className="space-y-1">
<label className="text-lg font-medium text-on-surface block">Probe Timeout</label>
<p className="text-sm text-on-surface-variant">Maximum duration to wait for a probe response.</p>
</div>
<div className="flex items-center gap-2">
<input 
  className="w-full bg-surface-container-highest border-none rounded-2xl py-4 px-6 text-on-surface focus:ring-2 focus:ring-primary" 
  type="number" 
  value={config.timeout}
  onChange={(e) => updateConfig({ timeout: parseInt(e.target.value) || 1000 })}
/>
<span className="text-sm font-bold text-outline">MS</span>
</div>
</div>
</div>
</>
) : (
<div className="animate-pulse flex flex-col gap-8">
<div className="h-12 bg-surface-container-highest rounded-2xl"></div>
<div className="h-20 bg-surface-container-highest rounded-2xl"></div>
<div className="h-20 bg-surface-container-highest rounded-2xl"></div>
</div>
)}
</section>
{/*  Section: Visual Telemetry (Bento Style)  */}
{config && (
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
<div className="md:col-span-2 bg-surface-container-highest rounded-3xl p-8 relative overflow-hidden group flex flex-col justify-between">
<div className="relative z-10 space-y-4">
<div className="flex items-center gap-3">
<span className="material-symbols-outlined text-tertiary">bolt</span>
<span className="text-sm font-bold tracking-widest text-tertiary">TURBO MODE</span>
</div>
<h5 className="text-3xl font-headline font-bold">Dynamic Bursting</h5>
<p className="text-on-surface-variant text-sm">Enable short-term bandwidth spikes during peak congestion. Recommended for VOIP and video traffic.</p>
</div>
<div className="relative z-10 mt-6">
<button 
  onClick={() => updateConfig({ turboMode: !config.turboMode })}
  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none ${config.turboMode ? "bg-tertiary" : "bg-surface-container-low"}`}>
<span className={`inline-block h-6 w-6 transform rounded-full bg-white transition duration-200 ${config.turboMode ? "translate-x-7" : "translate-x-1"}`}></span>
</button>
</div>
<div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
<span className="material-symbols-outlined text-[180px] text-tertiary" style={{fontVariationSettings: "'FILL' 1"}}>speed</span>
</div>
</div>
<div className="bg-surface-container-low rounded-3xl p-8 flex flex-col justify-between hover:bg-surface-container-high transition-colors cursor-pointer">
<span className="material-symbols-outlined text-primary text-4xl">cloud_sync</span>
<div>
<h5 className="text-xl font-headline font-bold mb-1">Live Sync</h5>
<p className="text-xs text-on-surface-variant uppercase tracking-tighter">Synced in real-time</p>
</div>
</div>
</div>
)}

</div>
</div>
</div>

    </div>
  );
};
