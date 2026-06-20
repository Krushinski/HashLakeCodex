import type { HashlakeEventBus } from "./eventBus";

export type FeedStatus = "ok" | "stale" | "error" | "offline" | "reconnecting";
export type FeedSource = "live" | "cached" | "sim" | "none";
export type DataMode = "LIVE" | "MANUAL" | "CACHED" | "STALE";

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
  stormIndex: number;
  staleness: number;
  contributions: StormContributions;
};

export type LiveBitcoinStore = {
  getSnapshot: () => LiveBitcoinSnapshot;
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
const PRICE_INTERVAL_MS = 30000;
const FEES_INTERVAL_MS = 45000;
const MEMPOOL_INTERVAL_MS = 52000;
const BLOCK_INTERVAL_MS = 25000;
const NETWORK_INTERVAL_MS = 1000 * 60 * 4;
const WEBSOCKET_RETRY_MS = 30000;

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
  source: name === "whales" ? "sim" : source,
  lastSuccessAt: name === "whales" ? now() : null,
  lastAttemptAt: null,
  message: name === "whales" ? "Simulated manual whale hook" : "Waiting for first update",
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
  const metrics: BitcoinMetrics = { ...DEFAULT_METRICS };
  const timers: number[] = [];
  let websocket: WebSocket | null = null;
  let latestBlockHeight: number | null = null;
  let started = false;

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
    writeCache(name, data, timestamp);
  };

  const markFailure = (name: FeedName, error: unknown) => {
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
    try {
      const data = await fetchJson<unknown>(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&price_change_percentage=24h%2C7d",
      );
      const first = Array.isArray(data) && isRecord(data[0]) ? data[0] : null;
      if (!first) {
        throw new Error("Price payload missing bitcoin market row");
      }

      const priceData: PriceData = {
        priceUsd: numberFrom(first.current_price) ?? 0,
        priceChange24h: numberFrom(first.price_change_percentage_24h_in_currency),
        priceChange7d: numberFrom(first.price_change_percentage_7d_in_currency),
      };
      markSuccess("price", priceData, (next) => {
        metrics.priceUsd = next.priceUsd;
        metrics.priceChange24h = next.priceChange24h;
        metrics.priceChange7d = next.priceChange7d;
      });
      feeds.market = { ...feeds.price, name: "market" };
    } catch (error) {
      markFailure("price", error);
      markFailure("market", error);
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
        intensity: 0.85,
        message: "New block found.",
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
    } catch (error) {
      markFailure("difficulty", error);
      markFailure("hashrate", error);
    }
    emit();
  };

  const schedule = (task: () => Promise<void>, initialDelay: number, cadence: number) => {
    let timer = 0;
    const run = () => {
      void task().finally(() => {
        timer = window.setTimeout(run, cadence);
        timers.push(timer);
      });
    };
    timer = window.setTimeout(run, initialDelay);
    timers.push(timer);
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
        websocket?.send(JSON.stringify({ action: "want", data: ["blocks"] }));
        emit();
      });

      websocket.addEventListener("message", (message) => {
        feeds.websocket.status = "ok";
        feeds.websocket.lastSuccessAt = now();
        feeds.websocket.message = "Heartbeat";
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
        feeds.websocket.status = "offline";
        feeds.websocket.message = "Polling fallback active";
        emit();
        if (started) {
          const timer = window.setTimeout(openWebSocket, WEBSOCKET_RETRY_MS);
          timers.push(timer);
        }
      });

      websocket.addEventListener("error", () => {
        feeds.websocket.status = "offline";
        feeds.websocket.message = "Websocket failed";
        emit();
      });
    } catch (error) {
      feeds.websocket.status = "offline";
      feeds.websocket.message = error instanceof Error ? error.message : "Websocket unavailable";
      emit();
    }
  };

  const getSnapshot = (): LiveBitcoinSnapshot => {
    FEED_NAMES.forEach((name) => {
      feeds[name].status = statusForCurrentAge(feeds[name]);
    });
    const scored = scoreFromMetrics(metrics, feeds);
    return {
      metrics: { ...metrics },
      feeds: { ...feeds },
      dataMode: getDataMode(feeds),
      stormIndex: scored.stormIndex,
      staleness: scored.staleness,
      contributions: scored.contributions,
    };
  };

  loadCaches();

  return {
    getSnapshot,
    start: () => {
      if (started) {
        return;
      }

      started = true;
      emit();
      schedule(refreshPrice, 50, PRICE_INTERVAL_MS);
      schedule(refreshFees, 900, FEES_INTERVAL_MS);
      schedule(refreshMempool, 1700, MEMPOOL_INTERVAL_MS);
      schedule(refreshBlock, 2500, BLOCK_INTERVAL_MS);
      schedule(refreshNetwork, 4200, NETWORK_INTERVAL_MS);
      openWebSocket();
    },
    stop: () => {
      started = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.length = 0;
      websocket?.close();
      websocket = null;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
  };
};
