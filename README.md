# ProtoFlow (Traffic Optimizer)

ProtoFlow is a dynamic multi-protocol traffic optimizer and smart proxy routing system built as a modern desktop application. It continuously monitors network conditions and dynamically routes real-time traffic across HTTP/2, HTTP/3, and UDP to ensure optimal network performance, minimizing latency and packet loss.

## Key Features

- **Dynamic Protocol Switching**: Automatically evaluates and switches routing between HTTP/2, HTTP/3, and UDP based on real-time network conditions.
- **Smart Proxy Router**: A local lightweight proxy layer that handles incoming requests and routes them through the optimal protocol using the decision engine.
- **Real-Time Network Monitoring**: Uses native C++ addons (N-API) and `quiche-client` to accurately probe network metrics (latency, jitter, packet loss, throughput) without imposing high overhead.
- **Modern Desktop Dashboard**: A responsive, desktop-first Tauri app built with React, Vite, and Tailwind CSS ("Aether Protocol" design system) providing comprehensive visualization of:
  - Network Map & Routing paths
  - System Health & Real-Time Protocol Scoring
  - Security Logs & Event deduplication
  - Real-Time Settings & Configuration Configuration
- **Configurable Settings**: Support for manual protocol overrides, dynamic auto-switching configurations, and simulated network degradation.

## Tech Stack

- **Frontend**: React 19, Vite, TailwindCSS (v4), Recharts, Lucide React
- **Desktop Environment**: Tauri v2
- **Backend**: Node.js (TypeScript), Express, WebSockets for real-time telemetry
- **Native Layer**: C++ (node-gyp), quiche-client for low-level network probing

## Getting Started

### Prerequisites

- Node.js (v18+)
- Rust & Cargo (for Tauri and quiche-client)
- C++ build tools (`build-essential`, `cmake`, `clang` etc.)

### Installation

1. **Install Dependencies**
   ```bash
   npm install
   cd backend && npm install
   ```

2. **Run Development Mode**
   Starts both the React frontend and the backend API/WebSocket server concurrently.
   ```bash
   npm run dev
   ```

3. **Run as Desktop App (Tauri)**
   ```bash
   npm run tauri:dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   npm run tauri:build
   ```

## Architecture Notes

- The backend serves as the core decision engine and smart proxy router.
- Native bindings are used for high-fidelity measurements. See `backend/README.md` for specific instructions on compiling the native addons and enabling real HTTP/3 via Cloudflare's `quiche-client`.