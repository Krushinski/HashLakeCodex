import type { HashlakeEventBus, LargeTradeSide } from "./eventBus";

export type FeedStatus = "ok" | "stale" | "error" | "offline" | "reconnecting";
export type FeedSource = "live" | "cached" | "sim" | "none";
export type DataMode = "LIVE" | "MANUAL" | "CACHED" | "STALE";
export type PollingMode = "active" | "slowed" | "backoff";
export type LargeTradeDetectorStatus =
  | "listening"
  | "event detected"
  | "no recent event"
  | "websocket unavailable"
  | "manual test";

export type FeedName =
  | "price"
  | "market"
  | "fees"
  | "mempool"
  | "block"
  | "difficulty"
  | "hashrate"
  | "whales"
  | "websocket";

export type FeedHealth = {
  name: FeedName;
  status: FeedStatus;
  source: FeedSource;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  message: string;
};

export type BitcoinMetrics = {
  priceUsd: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  fastestFee: number | null;
  mempoolCount: number | null;
  blockHeight: number | null;
  blockTimestamp: number | null;
  difficultyChange: number | null;
  hashrateChange: number | null;
};

export type MarketWebSocketState = {
  status: FeedStatus;
  lastTickAt: number | null;
  lastHeartbeatAt: number | null;
  lastPriceDisplayAt: number | null;
  message: string;
};

export type LargeTradeState = {
  thresholdBtc: number;
  lastDetectedAt: number | null;
  btcAmount: number | null;
  side: LargeTradeSide;
  price: number | null;
  source: "market-proxy" | "manual" | "none";
  detectorStatus: LargeTradeDetectorStatus;
  tradeMessageCount: number;
  lastTradeMessageAt: number | null;
  lastTradeBtcAmount: number | null;
  lastTradePrice: number | null;
  lastSplashSource: "live" | "manual" | "test" | "none";
};

export type StormContributions = {
  priceTrend: number;
  network: number;
  fees: number;
  congestion: number;
  freshness: number;
};

export type LiveBitcoinSnapshot = {
  metrics: BitcoinMetrics;
  feeds: Record<FeedName, FeedHealth>;
  dataMode: DataMode;
  pollingMode: PollingMode;
  marketWebSocket: MarketWebSocketState;
  largeTrade: LargeTradeState;
  stormIndex: number;
  staleness: number;
  contributions: StormContributions;
};

export type LiveBitcoinStore = {
  getSnapshot: () => LiveBitcoinSnapshot;
  recordManualLargeTrade: (
    btcAmount: number,
    side?: LargeTradeSide,
    price?: number | null,
  ) => void;
  start: () => void;
  stop: () => void;
  subscribe: (listener: LiveBitcoinListener) => () => void;
};

type LiveBitcoinListener = (snapshot: LiveBitcoinSnapshot) => void;
type StoredFeed<T> = {
  data: T;
  lastSuccessAt: number;
};

type PriceData = {
  priceUsd: number;
  priceChange24h: number | null;
  priceChange7d: number | null;
};

type FeeData = {
  fastestFee: number;
};

type MempoolData = {
  count: number;
};

type BlockData = {
  height: number;
  timestamp: number | null;
};

type NetworkData = {
  difficultyChange: number | null;
  hashrateChange: number | null;
};

const CACHE_PREFIX = "hashlake.feed.";
const FETCH_TIMEOUT_MS = 7000;
const STALE_AFTER_MS = 1000 * 60 * 4;
const PRICE_INTERVAL_MS = 20000;
const FEES_INTERVAL_MS = 35000;
const MEMPOOL_INTERVAL_MS = 40000;
const BLOCK_INTERVAL_MS = 22000;
const NETWORK_INTERVAL_MS = 1000 * 60 * 3;
const MARKET_PRICE_DISPLAY_INTERVAL_MS = 10000;
const MARKET_PRICE_FORCE_UPDATE_USD = 50;
const HEARTBEAT_MS = 1000;
const HIDDEN_HEARTBEAT_MS = 5000;
const HIDDEN_POLL_MULTIPLIER = 4;
const MAX_BACKOFF_MULTIPLIER = 4;
const WEBSOCKET_RETRY_MS = 30000;
const MARKET_WEBSOCKET_RETRY_MS = 12000;
const COINBASE_MARKET_WS_URL = "wss://advanced-trade-ws.coinbase.com";
export const WHALE_MIN_BTC = 3;
export const WHALE_MEDIUM_BTC = 10;
export const WHALE_LARGE_BTC = 50;
export const WHALE_HUGE_BTC = 300;
const LARGE_TRADE_RECENT_MS = 30000;

const FEED_NAMES: FeedName[] = [
  "price",
  "market",
  "fees",
  "mempool",
  "block",
  "difficulty",
  "hashrate",
  "whales",
  "websocket",
];

const DEFAULT_METRICS: BitcoinMetrics = {
  priceUsd: null,
  priceChange24h: null,
  priceChange7d: null,
  fastestFee: null,
  mempoolCount: null,
  blockHeight: null,
  blockTimestamp: null,
  difficultyChange: null,
  hashrateChange: null,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const now = () => Date.now();

const createFeed = (name: FeedName, source: FeedSource = "none"): FeedHealth => ({
  name,
  status: name === "whales" ? "ok" : "offline",
  source: name === "whales" ? "live" : source,
  lastSuccessAt: name === "whales" ? now() : null,
  lastAttemptAt: null,
  message: name === "whales" ? "Large Trade FX armed" : "Waiting for first update",
});

const readCache = <T>(name: FeedName): StoredFeed<T> | null => {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${name}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredFeed<T>;
    if (!parsed || typeof parsed.lastSuccessAt !== "number") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

const writeCache = <T>(name: FeedName, data: T, lastSuccessAt: number) => {
  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}${name}`,
      JSON.stringify({ data, lastSuccessAt }),
    );
  } catch {
    // Cache is a convenience only; private mode or storage quota must not break rendering.
  }
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeout);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const numberFrom = (value: unknown) => (typeof value === "number" ? value : null);

const numberLikeFrom = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeTradeSide = (value: unknown): LargeTradeSide => {
  if (typeof value !== "string") {
    return "unknown";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("buy") || normalized === "bid") {
    return "buy";
  }

  if (normalized.includes("sell") || normalized === "ask") {
    return "sell";
  }

  return "unknown";
};

const applyCachedStatus = (feed: FeedHealth, lastSuccessAt: number) => {
  feed.lastSuccessAt = lastSuccessAt;
  feed.status = now() - lastSuccessAt > STALE_AFTER_MS ? "stale" : "ok";
  feed.source = "cached";
  feed.message = feed.status === "stale" ? "Using stale cache" : "Using cache";
};

const statusForCurrentAge = (feed: FeedHealth): FeedStatus => {
  if (feed.status === "reconnecting") {
    return "reconnecting";
  }

  if (!feed.lastSuccessAt) {
    return feed.status;
  }

  return now() - feed.lastSuccessAt > STALE_AFTER_MS ? "stale" : feed.status;
};

const scoreFromMetrics = (
  metrics: BitcoinMetrics,
  feeds: Record<FeedName, FeedHealth>,
): { contributions: StormContributions; stormIndex: number; staleness: number } => {
  const priceChange = metrics.priceChange24h ?? 0;
  const priceTrend = clamp(-priceChange * 1.15 + Math.max(0, -(metrics.priceChange7d ?? 0)) * 0.25, 0, 10);
  const fees = clamp((metrics.fastestFee ?? 3) / 8, 0, 10);
  const congestion = clamp((metrics.mempoolCount ?? 90000) / 30000, 0, 10);
  const network = clamp(Math.max(0, -(metrics.difficultyChange ?? 0)) * 1.1 + Math.max(0, -(metrics.hashrateChange ?? 0)) * 0.7, 0, 10);
  const nonSimFeeds = FEED_NAMES.filter((name) => name !== "whales");
  const unhealthy = nonSimFeeds.filter((name) => {
    const status = statusForCurrentAge(feeds[name]);
    return status !== "ok";
  }).length;
  const staleness = unhealthy / nonSimFeeds.length;
  const freshness = clamp(staleness * 10, 0, 10);
  const stormIndex = clamp(
    (priceTrend * 0.35 + network * 0.25 + fees * 0.2 + congestion * 0.1 + freshness * 0.1) *
      10,
    0,
    100,
  );

  return {
    contributions: {
      priceTrend,
      network,
      fees,
      congestion,
      freshness,
    },
    stormIndex,
    staleness,
  };
};

const getDataMode = (feeds: Record<FeedName, FeedHealth>) => {
  const critical: FeedName[] = ["price", "fees", "mempool", "block"];
  const statuses = critical.map((name) => statusForCurrentAge(feeds[name]));
  if (statuses.every((status) => status === "ok")) {
    return "LIVE";
  }

  if (statuses.some((status) => status === "ok" || status === "stale")) {
    return "CACHED";
  }

  return "STALE";
};

export const createLiveBitcoinStore = (eventBus: HashlakeEventBus): LiveBitcoinStore => {
  const listeners = new Set<LiveBitcoinListener>();
  const feeds = Object.fromEntries(FEED_NAMES.map((name) => [name, createFeed(name)])) as Record<
    FeedName,
    FeedHealth
  >;
  const failures = Object.fromEntries(FEED_NAMES.map((name) => [name, 0])) as Record<
    FeedName,
    number
  >;
  const metrics: BitcoinMetrics = { ...DEFAULT_METRICS };
  const timers: number[] = [];
  let websocket: WebSocket | null = null;
  let marketWebSocket: WebSocket | null = null;
  let latestBlockHeight: number | null = null;
  let started = false;
  const marketWebSocketState: MarketWebSocketState = {
    status: "offline",
    lastTickAt: null,
    lastHeartbeatAt: null,
    lastPriceDisplayAt: null,
    message: "Waiting for market tape",
  };
  const largeTradeState: LargeTradeState = {
    thresholdBtc: WHALE_MIN_BTC,
    lastDetectedAt: null,
    btcAmount: null,
    side: "unknown",
    price: null,
    source: "none",
    detectorStatus: "no recent event",
    tradeMessageCount: 0,
    lastTradeMessageAt: null,
    lastTradeBtcAmount: null,
    lastTradePrice: null,
    lastSplashSource: "none",
  };
  let lastLargeTradeEmitAt = 0;
  let lastMarketPriceAppliedAt = 0;
  let lastMarketHeartbeatEventAt = 0;

  const emit = () => {
    const snapshot = getSnapshot();
    listeners.forEach((listener) => listener(snapshot));
  };

  const markAttempt = (name: FeedName) => {
    feeds[name].lastAttemptAt = now();
  };

  const markSuccess = <T>(name: FeedName, data: T, apply: (data: T) => void) => {
    const timestamp = now();
    apply(data);
    feeds[name].status = "ok";
    feeds[name].source = "live";
    feeds[name].lastSuccessAt = timestamp;
    feeds[name].message = "Live update";
    failures[name] = 0;
    writeCache(name, data, timestamp);
  };

  const markFailure = (name: FeedName, error: unknown) => {
    failures[name] = Math.min(MAX_BACKOFF_MULTIPLIER, failures[name] + 1);
    const hasCache = Boolean(feeds[name].lastSuccessAt);
    feeds[name].status = hasCache ? "stale" : "error";
    feeds[name].source = hasCache ? "cached" : "none";
    feeds[name].message = error instanceof Error ? error.message : "Feed failed";
  };

  const loadCaches = () => {
    const price = readCache<PriceData>("price");
    if (price) {
      metrics.priceUsd = price.data.priceUsd;
      metrics.priceChange24h = price.data.priceChange24h;
      metrics.priceChange7d = price.data.priceChange7d;
      applyCachedStatus(feeds.price, price.lastSuccessAt);
      applyCachedStatus(feeds.market, price.lastSuccessAt);
    }

    const fees = readCache<FeeData>("fees");
    if (fees) {
      metrics.fastestFee = fees.data.fastestFee;
      applyCachedStatus(feeds.fees, fees.lastSuccessAt);
    }

    const mempool = readCache<MempoolData>("mempool");
    if (mempool) {
      metrics.mempoolCount = mempool.data.count;
      applyCachedStatus(feeds.mempool, mempool.lastSuccessAt);
    }

    const block = readCache<BlockData>("block");
    if (block) {
      metrics.blockHeight = block.data.height;
      metrics.blockTimestamp = block.data.timestamp;
      latestBlockHeight = block.data.height;
      applyCachedStatus(feeds.block, block.lastSuccessAt);
    }

    const network = readCache<NetworkData>("difficulty");
    if (network) {
      metrics.difficultyChange = network.data.difficultyChange;
      metrics.hashrateChange = network.data.hashrateChange;
      applyCachedStatus(feeds.difficulty, network.lastSuccessAt);
      applyCachedStatus(feeds.hashrate, network.lastSuccessAt);
    }
  };

  const refreshPrice = async () => {
    markAttempt("price");
    markAttempt("market");
    const cached = readCache<PriceData>("price");
    if (cached) {
      metrics.priceUsd = cached.data.priceUsd;
      metrics.priceChange24h = cached.data.priceChange24h;
      metrics.priceChange7d = cached.data.priceChange7d;
      applyCachedStatus(feeds.price, cached.lastSuccessAt);
      applyCachedStatus(feeds.market, cached.lastSuccessAt);
    } else if (marketWebSocketState.status !== "ok") {
      markFailure("price", new Error("Coinbase websocket price pending"));
      markFailure("market", new Error("Coinbase websocket market pending"));
    }
    emit();
  };

  const refreshFees = async () => {
    markAttempt("fees");
    try {
      const data = await fetchJson<unknown>("https://mempool.space/api/v1/fees/recommended");
      if (!isRecord(data)) {
        throw new Error("Fee payload invalid");
      }

      const feeData: FeeData = {
        fastestFee: numberFrom(data.fastestFee) ?? numberFrom(data.halfHourFee) ?? 0,
      };
      markSuccess("fees", feeData, (next) => {
        metrics.fastestFee = next.fastestFee;
      });
    } catch (error) {
      markFailure("fees", error);
    }
    emit();
  };

  const refreshMempool = async () => {
    markAttempt("mempool");
    try {
      const data = await fetchJson<unknown>("https://mempool.space/api/mempool");
      if (!isRecord(data)) {
        throw new Error("Mempool payload invalid");
      }

      const mempoolData: MempoolData = {
        count: numberFrom(data.count) ?? 0,
      };
      markSuccess("mempool", mempoolData, (next) => {
        metrics.mempoolCount = next.count;
      });
    } catch (error) {
      markFailure("mempool", error);
    }
    emit();
  };

  const applyBlock = (blockData: BlockData, shouldEmitEvent: boolean) => {
    const previousHeight = latestBlockHeight;
    metrics.blockHeight = blockData.height;
    metrics.blockTimestamp = blockData.timestamp;
    latestBlockHeight = blockData.height;

    if (shouldEmitEvent && previousHeight !== null && blockData.height > previousHeight) {
      eventBus.emit({
        type: "newBlock",
        blockHeight: blockData.height,
        intensity: 0.85,
        message: `New block found - #${blockData.height}`,
      });
    }
  };

  const refreshBlock = async () => {
    markAttempt("block");
    try {
      const data = await fetchJson<unknown>("https://mempool.space/api/v1/blocks");
      const first = Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
      if (!first) {
        throw new Error("Block payload missing latest block");
      }

      const blockData: BlockData = {
        height: numberFrom(first.height) ?? 0,
        timestamp: numberFrom(first.timestamp),
      };
      markSuccess("block", blockData, (next) => applyBlock(next, true));
    } catch (error) {
      markFailure("block", error);
    }
    emit();
  };

  const refreshNetwork = async () => {
    markAttempt("difficulty");
    markAttempt("hashrate");
    try {
      const data = await fetchJson<unknown>("https://mempool.space/api/v1/difficulty-adjustment");
      if (!isRecord(data)) {
        throw new Error("Difficulty payload invalid");
      }

      const difficultyChange =
        numberFrom(data.difficultyChange) ??
        numberFrom(data.estimatedRetargetChange) ??
        numberFrom(data.adjustment);
      const networkData: NetworkData = {
        difficultyChange,
        hashrateChange: difficultyChange,
      };
      markSuccess("difficulty", networkData, (next) => {
        metrics.difficultyChange = next.difficultyChange;
        metrics.hashrateChange = next.hashrateChange;
      });
      feeds.hashrate = { ...feeds.difficulty, name: "hashrate" };
      failures.hashrate = 0;
    } catch (error) {
      markFailure("difficulty", error);
      markFailure("hashrate", error);
    }
    emit();
  };

  const applyMarketTick = (priceUsd: number, priceChange24h: number | null) => {
    const timestamp = now();
    const previousPrice = metrics.priceUsd;
    const priceMove = previousPrice === null ? Number.POSITIVE_INFINITY : Math.abs(priceUsd - previousPrice);
    marketWebSocketState.status = "ok";
    marketWebSocketState.lastTickAt = timestamp;
    marketWebSocketState.message = "Ticker live";

    if (
      lastMarketPriceAppliedAt &&
      timestamp - lastMarketPriceAppliedAt < MARKET_PRICE_DISPLAY_INTERVAL_MS &&
      priceMove < MARKET_PRICE_FORCE_UPDATE_USD
    ) {
      feeds.market.status = "ok";
      feeds.market.source = "live";
      feeds.market.lastSuccessAt = timestamp;
      feeds.market.message = "Coinbase ticker throttled";
      failures.market = 0;
      return;
    }

    lastMarketPriceAppliedAt = timestamp;
    marketWebSocketState.lastPriceDisplayAt = timestamp;
    metrics.priceUsd = priceUsd;
    if (priceChange24h !== null) {
      metrics.priceChange24h = priceChange24h;
    }
    feeds.price.status = "ok";
    feeds.price.source = "live";
    feeds.price.lastSuccessAt = timestamp;
    feeds.price.message = "Coinbase ticker";
    feeds.market.status = "ok";
    feeds.market.source = "live";
    feeds.market.lastSuccessAt = timestamp;
    feeds.market.message = "Coinbase market tape";
    failures.price = 0;
    failures.market = 0;
    writeCache(
      "price",
      {
        priceUsd: metrics.priceUsd,
        priceChange24h: metrics.priceChange24h,
        priceChange7d: metrics.priceChange7d,
      },
      timestamp,
    );
    eventBus.emit({
      type: "marketTick",
      price: priceUsd,
      previousPrice: previousPrice ?? undefined,
      intensity: clamp(priceMove / 120, 0.12, 1.25),
    });
  };

  const markMarketHeartbeat = (timestamp: number) => {
    marketWebSocketState.status = "ok";
    marketWebSocketState.lastHeartbeatAt = timestamp;
    marketWebSocketState.message = "Heartbeat";
    feeds.market.status = "ok";
    feeds.market.source = "live";
    feeds.market.lastSuccessAt = timestamp;
    feeds.market.message = "Coinbase heartbeat";
    if (!lastMarketHeartbeatEventAt || timestamp - lastMarketHeartbeatEventAt >= 5000) {
      lastMarketHeartbeatEventAt = timestamp;
      eventBus.emit({
        type: "marketHeartbeat",
        intensity: 0.18,
      });
    }
  };

  const recordMarketTradeMessage = (
    btcAmount: number | null,
    price: number | null,
  ) => {
    const timestamp = now();
    largeTradeState.tradeMessageCount += 1;
    largeTradeState.lastTradeMessageAt = timestamp;
    largeTradeState.lastTradeBtcAmount = btcAmount;
    largeTradeState.lastTradePrice = price;
    feeds.whales.status = "ok";
    feeds.whales.source = "live";
    feeds.whales.lastSuccessAt = timestamp;
    feeds.whales.message =
      btcAmount !== null && btcAmount >= WHALE_MIN_BTC
        ? "Large Trade FX event detected"
        : "Large Trade FX listening";
  };

  const applyLargeTrade = (
    btcAmount: number,
    side: LargeTradeSide,
    price: number | null,
    source: LargeTradeState["source"],
  ) => {
    const timestamp = now();
    largeTradeState.lastDetectedAt = timestamp;
    largeTradeState.btcAmount = btcAmount;
    largeTradeState.side = side;
    largeTradeState.price = price;
    largeTradeState.source = source;
    largeTradeState.lastSplashSource = source === "market-proxy" ? "live" : "manual";
    feeds.whales.status = "ok";
    feeds.whales.source = source === "market-proxy" ? "live" : "sim";
    feeds.whales.lastSuccessAt = timestamp;
    feeds.whales.message =
      source === "market-proxy" ? "Large Trade FX event" : "Manual large trade test";

    if (
      btcAmount < WHALE_MIN_BTC ||
      (source === "market-proxy" && timestamp - lastLargeTradeEmitAt < 1400)
    ) {
      return;
    }

    if (source === "market-proxy") {
      lastLargeTradeEmitAt = timestamp;
    }
    const amountLabel = `${btcAmount.toLocaleString("en-US", {
      maximumFractionDigits: btcAmount >= 100 ? 0 : 1,
    })} BTC`;
    const priceLabel =
      price === null
        ? ""
        : ` @ ${new Intl.NumberFormat("en-US", {
            maximumFractionDigits: 0,
            style: "currency",
            currency: "USD",
          }).format(price)}`;
    const sideLabel =
      btcAmount >= WHALE_HUGE_BTC
        ? "Whale move"
        : btcAmount >= WHALE_LARGE_BTC
          ? "Large BTC move"
          : "BTC move";

    eventBus.emit({
      type: "largeTrade",
      btcAmount,
      side,
      price: price ?? undefined,
      source: source === "none" ? undefined : source,
      intensity: clamp(btcAmount / WHALE_LARGE_BTC, 0.25, 4),
      message: `${sideLabel} - ${amountLabel}${priceLabel}`,
    });
  };

  const handleMarketMessage = (raw: unknown) => {
    const data = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    if (!isRecord(data)) {
      return;
    }

    const channel = typeof data.channel === "string" ? data.channel : "";
    const events = Array.isArray(data.events) ? data.events : [];
    if (channel === "heartbeats" || channel === "subscriptions") {
      markMarketHeartbeat(now());
      return;
    }

    events.forEach((event) => {
      if (!isRecord(event)) {
        return;
      }

      if ((channel === "ticker" || channel === "ticker_batch") && Array.isArray(event.tickers)) {
        event.tickers.forEach((ticker) => {
          if (!isRecord(ticker) || ticker.product_id !== "BTC-USD") {
            return;
          }

          const price = numberLikeFrom(ticker.price);
          if (price === null) {
            return;
          }

          applyMarketTick(price, numberLikeFrom(ticker.price_percent_chg_24_h));
        });
      }

      if (channel === "market_trades" && Array.isArray(event.trades)) {
        if (event.type === "snapshot") {
          return;
        }

        event.trades.forEach((trade) => {
          if (!isRecord(trade) || trade.product_id !== "BTC-USD") {
            return;
          }

          const btcAmount = numberLikeFrom(trade.size);
          const price = numberLikeFrom(trade.price);
          recordMarketTradeMessage(btcAmount, price);
          if (btcAmount === null || btcAmount < WHALE_MIN_BTC) {
            return;
          }

          const side = normalizeTradeSide(
            trade.side ?? trade.taker_side ?? trade.maker_side,
          );
          applyLargeTrade(
            btcAmount,
            side,
            price,
            "market-proxy",
          );
        });
      }
    });
  };

  const getPollingMultiplier = (names: FeedName[]) => {
    const highestFailureCount = Math.max(...names.map((name) => failures[name]));
    const backoffMultiplier =
      highestFailureCount > 0
        ? Math.min(MAX_BACKOFF_MULTIPLIER, 1 + highestFailureCount)
        : 1;
    return Math.max(document.hidden ? HIDDEN_POLL_MULTIPLIER : 1, backoffMultiplier);
  };

  const schedule = (
    task: () => Promise<void>,
    initialDelay: number,
    cadence: number,
    names: FeedName[],
  ) => {
    let timer = 0;
    const run = () => {
      void task().finally(() => {
        if (!started) {
          return;
        }

        timer = window.setTimeout(run, cadence * getPollingMultiplier(names));
        timers.push(timer);
      });
    };
    timer = window.setTimeout(run, initialDelay);
    timers.push(timer);
  };

  const getPollingMode = (): PollingMode => {
    if (document.hidden) {
      return "slowed";
    }

    return FEED_NAMES.some((name) => name !== "whales" && failures[name] > 0)
      ? "backoff"
      : "active";
  };

  const getLargeTradeDetectorStatus = (): LargeTradeDetectorStatus => {
    const timestamp = now();
    if (
      largeTradeState.source === "manual" &&
      largeTradeState.lastDetectedAt !== null &&
      timestamp - largeTradeState.lastDetectedAt < LARGE_TRADE_RECENT_MS
    ) {
      return "manual test";
    }

    if (
      largeTradeState.source === "market-proxy" &&
      largeTradeState.lastDetectedAt !== null &&
      timestamp - largeTradeState.lastDetectedAt < LARGE_TRADE_RECENT_MS
    ) {
      return "event detected";
    }

    if (marketWebSocketState.status === "ok") {
      return largeTradeState.lastTradeMessageAt === null ? "no recent event" : "listening";
    }

    return "websocket unavailable";
  };

  const syncLargeTradeFeedStatus = () => {
    const detectorStatus = getLargeTradeDetectorStatus();
    largeTradeState.detectorStatus = detectorStatus;
    if (detectorStatus === "websocket unavailable") {
      feeds.whales.status = "offline";
      feeds.whales.source = "none";
      feeds.whales.message = "Market websocket unavailable";
      return;
    }

    feeds.whales.status = "ok";
    feeds.whales.source = largeTradeState.lastSplashSource === "manual" ? "sim" : "live";
    feeds.whales.lastSuccessAt =
      largeTradeState.lastTradeMessageAt ?? largeTradeState.lastDetectedAt ?? feeds.whales.lastSuccessAt;
    feeds.whales.message =
      detectorStatus === "manual test"
        ? "Manual Large Trade FX test"
        : detectorStatus === "event detected"
          ? "Large Trade FX event detected"
          : "Listening - no recent >=3 BTC event";
  };

  const runHeartbeat = () => {
    if (!started) {
      return;
    }

    emit();
    const timer = window.setTimeout(
      runHeartbeat,
      document.hidden ? HIDDEN_HEARTBEAT_MS : HEARTBEAT_MS,
    );
    timers.push(timer);
  };

  const handleVisibilityChange = () => {
    emit();
  };

  const openWebSocket = () => {
    if (websocket) {
      websocket.close();
    }

    try {
      feeds.websocket.status = "reconnecting";
      feeds.websocket.source = "live";
      feeds.websocket.message = "Connecting";
      websocket = new WebSocket("wss://mempool.space/api/v1/ws");

      websocket.addEventListener("open", () => {
        feeds.websocket.status = "ok";
        feeds.websocket.source = "live";
        feeds.websocket.lastSuccessAt = now();
        feeds.websocket.message = "Live websocket";
        failures.websocket = 0;
        websocket?.send(JSON.stringify({ action: "want", data: ["blocks"] }));
        emit();
      });

      websocket.addEventListener("message", (message) => {
        feeds.websocket.status = "ok";
        feeds.websocket.lastSuccessAt = now();
        feeds.websocket.message = "Heartbeat";
        failures.websocket = 0;
        try {
          const data = JSON.parse(String(message.data)) as unknown;
          const block = isRecord(data) && isRecord(data.block) ? data.block : null;
          const height = block ? numberFrom(block.height) : null;
          const timestamp = block ? numberFrom(block.timestamp) : null;
          if (height !== null) {
            applyBlock({ height, timestamp }, true);
            markSuccess("block", { height, timestamp }, (next) => applyBlock(next, false));
          }
        } catch {
          // Websocket messages are best-effort; polling remains authoritative.
        }
        emit();
      });

      websocket.addEventListener("close", () => {
        failures.websocket = Math.min(MAX_BACKOFF_MULTIPLIER, failures.websocket + 1);
        feeds.websocket.status = "offline";
        feeds.websocket.message = "Polling fallback active";
        emit();
        if (started) {
          const timer = window.setTimeout(openWebSocket, WEBSOCKET_RETRY_MS);
          timers.push(timer);
        }
      });

      websocket.addEventListener("error", () => {
        failures.websocket = Math.min(MAX_BACKOFF_MULTIPLIER, failures.websocket + 1);
        feeds.websocket.status = "offline";
        feeds.websocket.message = "Websocket failed";
        emit();
      });
    } catch (error) {
      failures.websocket = Math.min(MAX_BACKOFF_MULTIPLIER, failures.websocket + 1);
      feeds.websocket.status = "offline";
      feeds.websocket.message = error instanceof Error ? error.message : "Websocket unavailable";
      emit();
    }
  };

  const openMarketWebSocket = () => {
    if (marketWebSocket) {
      marketWebSocket.close();
    }

    try {
      marketWebSocketState.status = "reconnecting";
      marketWebSocketState.message = "Connecting";
      feeds.market.status = "reconnecting";
      feeds.market.source = "live";
      feeds.market.message = "Coinbase market tape connecting";
      markAttempt("market");
      const socket = new WebSocket(COINBASE_MARKET_WS_URL);
      marketWebSocket = socket;

      socket.addEventListener("open", () => {
        marketWebSocketState.status = "ok";
        marketWebSocketState.lastHeartbeatAt = now();
        marketWebSocketState.message = "Subscribing";
        failures.market = 0;
        const subscriptions = [
          { type: "subscribe", product_ids: ["BTC-USD"], channel: "ticker_batch" },
          { type: "subscribe", product_ids: ["BTC-USD"], channel: "market_trades" },
          { type: "subscribe", channel: "heartbeats" },
        ];
        subscriptions.forEach((subscription) => {
          socket.send(JSON.stringify(subscription));
        });
        emit();
      });

      socket.addEventListener("message", (message) => {
        try {
          handleMarketMessage(String(message.data));
          failures.market = 0;
        } catch (error) {
          marketWebSocketState.message =
            error instanceof Error ? error.message : "Market message parse failed";
        }
        emit();
      });

      socket.addEventListener("close", () => {
        if (marketWebSocket !== socket) {
          return;
        }

        marketWebSocket = null;
        failures.market = Math.min(MAX_BACKOFF_MULTIPLIER, failures.market + 1);
        marketWebSocketState.status = "offline";
        marketWebSocketState.message = "Cached fallback active";
        if (!feeds.market.lastSuccessAt) {
          feeds.market.status = "offline";
          feeds.market.source = "none";
        }
        feeds.market.message = "Cached fallback active";
        emit();
        if (started) {
          const timer = window.setTimeout(openMarketWebSocket, MARKET_WEBSOCKET_RETRY_MS);
          timers.push(timer);
        }
      });

      socket.addEventListener("error", () => {
        failures.market = Math.min(MAX_BACKOFF_MULTIPLIER, failures.market + 1);
        marketWebSocketState.status = "offline";
        marketWebSocketState.message = "Coinbase market websocket failed";
        feeds.market.message = "Cached fallback active";
        emit();
      });
    } catch (error) {
      failures.market = Math.min(MAX_BACKOFF_MULTIPLIER, failures.market + 1);
      marketWebSocketState.status = "offline";
      marketWebSocketState.message =
        error instanceof Error ? error.message : "Market websocket unavailable";
      emit();
    }
  };

  const getSnapshot = (): LiveBitcoinSnapshot => {
    FEED_NAMES.forEach((name) => {
      feeds[name].status = statusForCurrentAge(feeds[name]);
    });
    syncLargeTradeFeedStatus();
    const scored = scoreFromMetrics(metrics, feeds);
    return {
      metrics: { ...metrics },
      feeds: { ...feeds },
      dataMode: getDataMode(feeds),
      pollingMode: getPollingMode(),
      marketWebSocket: { ...marketWebSocketState },
      largeTrade: { ...largeTradeState },
      stormIndex: scored.stormIndex,
      staleness: scored.staleness,
      contributions: scored.contributions,
    };
  };

  loadCaches();

  return {
    getSnapshot,
    recordManualLargeTrade: (btcAmount, side = "buy", price = metrics.priceUsd) => {
      applyLargeTrade(btcAmount, side, price, "manual");
      emit();
    },
    start: () => {
      if (started) {
        return;
      }

      started = true;
      emit();
      window.addEventListener("visibilitychange", handleVisibilityChange);
      schedule(refreshPrice, 50, PRICE_INTERVAL_MS, ["price", "market"]);
      schedule(refreshFees, 900, FEES_INTERVAL_MS, ["fees"]);
      schedule(refreshMempool, 1700, MEMPOOL_INTERVAL_MS, ["mempool"]);
      schedule(refreshBlock, 2500, BLOCK_INTERVAL_MS, ["block"]);
      schedule(refreshNetwork, 4200, NETWORK_INTERVAL_MS, ["difficulty", "hashrate"]);
      runHeartbeat();
      openWebSocket();
      openMarketWebSocket();
    },
    stop: () => {
      started = false;
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.length = 0;
      websocket?.close();
      websocket = null;
      marketWebSocket?.close();
      marketWebSocket = null;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
  };
};
