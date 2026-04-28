# Dynamic Multi-Protocol Traffic Optimizer Backend

This backend runs a local adaptive proxy decision engine and streams metrics for HTTP/2, HTTP/3, and UDP.

## Implemented Components

- `src/server.ts`
    - REST API on `http://localhost:4317`
    - WebSocket updates on `ws://localhost:4317/ws`
    - Runtime control endpoint (`/control`)
- `src/prober.ts`
    - Native addon integration with automatic fallback to mock mode
- `src/protocols.ts`
    - HTTP/2 benchmark (Node `http2`)
    - HTTP/3 + UDP benchmark input from native layer
- `src/metrics.ts`
    - Weighted scoring and normalization
- `src/switcher.ts`
    - Protocol decision logic and confidence/reason generation
- `native/*.cpp`
    - N-API addon
    - TCP RTT/loss/jitter probing for network stats
    - UDP probing
    - HTTP/3 probing through `quiche-client` when enabled

## API Contract

- `GET /health`
- `GET /metrics`
- `GET /protocols`
- `GET /decision`
- `GET /snapshot`
- `POST /control`

### `POST /control` Body

```json
{
    "action": "start",
    "mode": "auto",
    "manualProtocol": "http3",
    "targetUrl": "https://cloudflare-quic.com/",
    "probeHost": "1.1.1.1",
    "probePort": 443,
    "intervalMs": 1500,
    "mockMode": false
}
```

## Build and Run

### 1) Install Node Dependencies

```bash
cd backend
npm install
```

### 2) Build Native Addon (node-gyp)

```bash
cd backend
npm run native:build
```

### 3) Enable Real HTTP/3 via quiche-client

By default, native HTTP/3 probing is disabled and mock/native fallback is used.
To enable real HTTP/3 probing:

```bash
cd backend
QUICHE_ENABLED=1 npm run native:build
```

This expects `quiche-client` to be available on `PATH`.

#### Linux / Arch setup for quiche-client

Example workflow:

```bash
# Base toolchain
sudo pacman -S --needed git rust clang cmake openssl pkgconf

# Build quiche tools
git clone https://github.com/cloudflare/quiche.git
cd quiche
cargo build --release --package quiche_apps

# Add quiche-client to PATH (adjust path as needed)
export PATH="$PWD/target/release:$PATH"
quiche-client --help
```

If `quiche-client --help` works, rebuild native with `QUICHE_ENABLED=1` and restart backend.

### 4) Run Backend

Development mode:

```bash
cd backend
npm run dev
```

Production mode:

```bash
cd backend
npm run build
npm start
```

## Testing

Decision engine tests:

```bash
cd backend
npm test
```

## Mock Mode

Mock mode avoids native dependencies and still exercises full switching logic.

```bash
cd backend
MOCK_MODE=1 npm run dev
```

## Notes

- Scores use weighted normalization:
    - `0.5 * latency_norm`
    - `0.3 * loss_norm`
    - `0.2 * throughput_penalty`
- Lower score is better.
- Control mode `manual` forces selected protocol.
