import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Dashboard } from './pages/Dashboard';
import { ProtocolAnalyzer } from './pages/ProtocolAnalyzer';

import { SecurityLogs } from './pages/SecurityLogs';
import { SystemHealth } from './pages/SystemHealth';
import { Settings } from './pages/Settings';
import { Docs } from './pages/Docs';
import { Support } from './pages/Support';

function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen font-body text-on-background selection:bg-primary/30">
        <Sidebar />
        <main className="flex-1 ml-16 lg:ml-64 flex flex-col relative overflow-x-hidden bg-surface">
          <Topbar />
          <div className="flex-1 overflow-y-auto w-full">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analyzer" element={<ProtocolAnalyzer />} />

              <Route path="/security-logs" element={<SecurityLogs />} />
              <Route path="/system-health" element={<SystemHealth />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="/support" element={<Support />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
