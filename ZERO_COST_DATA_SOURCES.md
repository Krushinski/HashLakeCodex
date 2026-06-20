# Hashlake Zero-Cost Data Guard

Hashlake should use only no-key, public, zero-cost data paths unless the user explicitly approves a change.

Current app data sources:

- Coinbase Advanced Trade public market-data WebSocket: `wss://advanced-trade-ws.coinbase.com`
  - Channels: `ticker_batch`, `market_trades`, `heartbeats`
  - No API key or account secret is used.
- mempool.space public REST endpoints and websocket:
  - Fees, mempool count, latest blocks, difficulty adjustment, block websocket
  - No API key or account secret is used.
- Local browser cache:
  - `localStorage` fallback for previously fetched public values.

Do not add paid APIs, metered API keys, secret tokens, or authenticated market data without stopping and asking first.

If a provider changes terms, requires authentication, requires a paid plan, or starts surfacing billing language for the endpoint in use, alert the user immediately and remove or disable that source before continuing.
