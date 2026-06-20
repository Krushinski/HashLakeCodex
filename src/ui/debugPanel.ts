import type { HashlakeEventBus } from "../state/eventBus";
import type {
  FeedName,
  FeedSource,
  FeedStatus,
  LiveBitcoinSnapshot,
  LiveBitcoinStore,
} from "../state/liveBitcoinStore";
import type { WeatherDials, WeatherSnapshot, WeatherStore } from "../state/weatherEngine";
import { LAKE_MAP } from "../scene/lakeMap";

type FeedRow = {
  name: FeedName;
  status: FeedStatus;
  source: FeedSource;
};

type DebugPanel = {
  element: HTMLDivElement;
  destroy: () => void;
  isVisible: () => boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
};

type MetricTile = {
  label: string;
  value: string;
  tone?: "good" | "bad" | "warn" | "muted";
};

type BarValue = {
  label: string;
  weight: string;
  value: number;
  max: number;
};

export type SceneTelemetry = {
  mode: "Frame" | "Drive";
  speed: number;
  position: {
    x: number;
    z: number;
  };
  heading: number;
  visualHeading: number;
  movementVector: {
    x: number;
    z: number;
  };
  steerInput: number;
  cameraPreset: string;
  nearestLocation: string;
  savedTableau: boolean;
};

const metricTiles: MetricTile[] = [
  { label: "Price", value: "$62,989" },
  { label: "24h", value: "+0.48%", tone: "good" },
  { label: "7d", value: "-1.27%", tone: "bad" },
  { label: "Fastest fee", value: "3 sat/vB" },
  { label: "Mempool", value: "113,080 tx" },
  { label: "Block", value: "#954,434" },
  { label: "Block age", value: "12.2 min" },
  { label: "Difficulty", value: "+4.40%" },
  { label: "Hashrate dip", value: "-2.65%" },
  { label: "WebSocket", value: "live", tone: "good" },
  { label: "Polling", value: "active", tone: "good" },
  { label: "Data mode", value: "LIVE", tone: "good" },
  { label: "Staleness", value: "0%", tone: "good" },
  { label: "Fire / FW", value: "0.00 / 0.00" },
  { label: "Mode", value: "Frame", tone: "muted" },
  { label: "Boat speed", value: "0.0" },
  { label: "Boat pos", value: "0, 0" },
  { label: "Heading", value: "0 / 0" },
  { label: "Move vec", value: "0, 0" },
  { label: "Steer", value: "0.00" },
  { label: "Nearest", value: "Dock" },
  { label: "Camera", value: "Cinematic" },
];

const contributionBars: BarValue[] = [
  { label: "price trend", weight: "x0.35", value: 1.6, max: 10 },
  { label: "network", weight: "x0.25", value: 0.3, max: 10 },
  { label: "fees", weight: "x0.2", value: 0.7, max: 10 },
  { label: "congestion", weight: "x0.1", value: 7.1, max: 10 },
  { label: "freshness", weight: "x0.1", value: 0, max: 10 },
];

const dialLabels: Array<{ key: keyof WeatherDials; label: string }> = [
  { key: "chop", label: "chop" },
  { key: "wind", label: "wind" },
  { key: "rain", label: "rain" },
  { key: "lightning", label: "lightning" },
  { key: "skyDark", label: "sky dark" },
  { key: "fog", label: "fog" },
  { key: "fireWeather", label: "fire" },
  { key: "boatInstability", label: "boat" },
  { key: "cameraShake", label: "camera" },
  { key: "ambientActivity", label: "activity" },
];

const feedRows: FeedRow[] = [
  { name: "price", status: "offline", source: "none" },
  { name: "mempool", status: "offline", source: "none" },
  { name: "fees", status: "offline", source: "none" },
  { name: "block", status: "offline", source: "none" },
  { name: "whales", status: "ok", source: "sim" },
  { name: "market", status: "offline", source: "none" },
  { name: "difficulty", status: "offline", source: "none" },
  { name: "hashrate", status: "offline", source: "none" },
  { name: "websocket", status: "offline", source: "none" },
];

const metricLabelsByFeed: Record<FeedName, string[]> = {
  price: ["Price"],
  market: ["24h", "7d"],
  fees: ["Fastest fee"],
  mempool: ["Mempool"],
  block: ["Block", "Block age"],
  difficulty: ["Difficulty"],
  hashrate: ["Hashrate dip"],
  whales: [],
  websocket: ["WebSocket"],
};

const formatAgo = (seconds: number) => {
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainder}s ago`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ago`;
};

const formatLastSeen = (timestamp: number | null) => {
  if (!timestamp) {
    return "--";
  }

  return formatAgo(Math.max(0, Math.floor((Date.now() - timestamp) / 1000)));
};

const formatCurrency = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  }).format(value);
};

const formatPercent = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const createMetricTiles = () =>
  metricTiles
    .map(
      (tile) => `
        <div class="debug-metric" data-debug-metric="${tile.label}">
          <span class="debug-metric__label">${tile.label}</span>
          <strong class="debug-metric__value ${
            tile.tone ? `debug-tone-${tile.tone}` : ""
          }">${tile.value}</strong>
        </div>
      `,
    )
    .join("");

const createBars = () =>
  contributionBars
    .map(
      (bar) => `
        <div class="debug-bar" data-debug-bar="${bar.label}">
          <div class="debug-bar__meta">
            <span>${bar.label} <em>${bar.weight}</em></span>
            <strong>${bar.value.toFixed(1)}</strong>
          </div>
          <div class="debug-bar__track">
            <span style="width: ${(bar.value / bar.max) * 100}%"></span>
          </div>
        </div>
      `,
    )
    .join("");

const createDials = () =>
  dialLabels
    .map(
      (dial) => `
        <div class="debug-dial" data-debug-dial="${dial.key}">
          <span>${dial.label}</span>
          <div class="debug-dial__track">
            <span style="width: 0%"></span>
          </div>
          <strong>0%</strong>
        </div>
      `,
    )
    .join("");

const createFeeds = () =>
  feedRows
    .map(
      (feed) => `
        <div class="debug-feed" data-feed="${feed.name}">
          <span class="debug-feed__dot debug-feed__dot--${feed.status}"></span>
          <span class="debug-feed__name">${feed.name}</span>
          <span class="debug-feed__status">${feed.status}</span>
          <span class="debug-feed__source">${feed.source}</span>
          <time class="debug-feed__timer" data-feed-timer="${feed.name}">0s ago</time>
        </div>
      `,
    )
    .join("");

const renderTemplate = () => `
  <section class="debug-panel" aria-label="Hashlake debug dashboard">
    <header class="debug-panel__header">
      <div>
        <strong>Hashlake - Debug</strong>
      </div>
      <div class="debug-panel__actions">
        <span class="debug-fps"><span data-debug-fps>--</span> fps</span>
        <button class="debug-close" type="button" aria-label="Close debug panel">x</button>
      </div>
    </header>

    <div class="debug-metrics">
      ${createMetricTiles()}
    </div>

    <div class="debug-section debug-storm">
      <div class="debug-section__heading">
        <span>StormIndex</span>
        <strong><span data-debug-storm-value>8.9</span> <em data-debug-storm-label>Serene</em></strong>
      </div>
      <input
        class="debug-storm__slider"
        data-debug-storm-slider
        type="range"
        min="0"
        max="100"
        value="8.9"
        step="0.1"
        aria-label="Manual stormIndex"
      />
      <div class="debug-bars">
        ${createBars()}
      </div>
    </div>

    <div class="debug-section">
      <div class="debug-section__heading">
        <span>Dials</span>
      </div>
      <div class="debug-dials">
        ${createDials()}
      </div>
    </div>

    <div class="debug-section">
      <div class="debug-section__heading">
        <span>Feeds</span>
      </div>
      <div class="debug-feeds">
        ${createFeeds()}
      </div>
    </div>

    <div class="debug-section debug-manual">
      <div class="debug-section__heading">
        <span>Manual Override</span>
        <strong data-debug-live-mode>Live</strong>
      </div>
      <div class="debug-manual__buttons">
        <button type="button" data-debug-action="crash">Crash</button>
        <button type="button" data-debug-action="rally">Rally</button>
        <button type="button" data-debug-action="whale">Whale</button>
        <button type="button" data-debug-action="block">Block</button>
        <button type="button" data-debug-action="gust">Gust</button>
        <button type="button" data-debug-action="stale">Stale Fog</button>
        <button type="button" data-debug-action="resume">Resume Live</button>
      </div>
    </div>

    <div class="debug-section debug-minimap-section">
      <div class="debug-section__heading">
        <span>Lake Map</span>
        <strong data-debug-nearest>--</strong>
      </div>
      <canvas
        class="debug-minimap"
        width="320"
        height="190"
        data-debug-minimap
        aria-label="Debug lake minimap"
      ></canvas>
    </div>
  </section>
`;

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const updateFeedRows = (wrapper: HTMLElement, snapshot: LiveBitcoinSnapshot) => {
  for (const feed of feedRows) {
    const row = wrapper.querySelector<HTMLElement>(`[data-feed="${feed.name}"]`);
    const dot = row?.querySelector<HTMLElement>(".debug-feed__dot");
    const status = row?.querySelector<HTMLElement>(".debug-feed__status");
    const source = row?.querySelector<HTMLElement>(".debug-feed__source");
    const timer = row?.querySelector<HTMLTimeElement>(".debug-feed__timer");
    const liveFeed = snapshot.feeds[feed.name];
    if (!row || !dot || !status || !source || !timer || !liveFeed) {
      continue;
    }

    const nextStatus = liveFeed.status;
    dot.className = `debug-feed__dot debug-feed__dot--${nextStatus}`;
    status.textContent = nextStatus;
    source.textContent = liveFeed.source;
    timer.textContent = formatLastSeen(liveFeed.lastSuccessAt);
  }
};

const drawMinimap = (
  canvas: HTMLCanvasElement,
  telemetry: SceneTelemetry,
  isStale: boolean,
) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const { minX, maxX, minZ, maxZ } = LAKE_MAP.mapBounds;
  const scale = Math.min((width - 22) / (maxX - minX), (height - 20) / (maxZ - minZ));
  const mapX = (x: number) => width / 2 + (x - (minX + maxX) / 2) * scale;
  const mapY = (z: number) => height / 2 + (z - (minZ + maxZ) / 2) * scale;

  const tracePolygon = (points: readonly { x: number; z: number }[]) => {
    points.forEach((point, index) => {
      const x = mapX(point.x);
      const y = mapY(point.z);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
  };

  const traceEllipse = (
    center: { x: number; z: number },
    radiusX: number,
    radiusZ: number,
    rotation: number,
  ) => {
    context.ellipse(
      mapX(center.x),
      mapY(center.z),
      radiusX * scale,
      radiusZ * scale,
      rotation,
      0,
      Math.PI * 2,
    );
  };

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(4, 14, 18, 0.74)";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(55, 92, 62, 0.42)";
  context.strokeStyle = "rgba(153, 220, 183, 0.24)";
  context.beginPath();
  context.rect(7, 7, width - 14, height - 14);
  context.fill();

  context.fillStyle = "rgba(36, 112, 133, 0.72)";
  context.strokeStyle = "rgba(126, 217, 218, 0.44)";
  context.lineWidth = 1.6;
  context.beginPath();
  tracePolygon(LAKE_MAP.outline);
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(220, 194, 126, 0.78)";
  context.strokeStyle = "rgba(255, 246, 206, 0.36)";
  context.beginPath();
  traceEllipse(
    LAKE_MAP.sandbar.center,
    LAKE_MAP.sandbar.radiusX,
    LAKE_MAP.sandbar.radiusZ,
    LAKE_MAP.sandbar.rotation,
  );
  context.fill();
  context.stroke();

  context.fillStyle = "rgba(111, 116, 113, 0.86)";
  context.strokeStyle = "rgba(238, 245, 238, 0.28)";
  context.beginPath();
  traceEllipse(
    LAKE_MAP.island.center,
    LAKE_MAP.island.radiusX,
    LAKE_MAP.island.radiusZ,
    LAKE_MAP.island.rotation,
  );
  context.fill();
  context.stroke();

  context.font = "10px Cascadia Mono, SFMono-Regular, Consolas, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  LAKE_MAP.destinations.forEach((destination) => {
    const x = mapX(destination.center.x);
    const y = mapY(destination.center.z);
    context.fillStyle =
      destination.kind === "shore"
        ? "rgba(145, 242, 191, 0.9)"
        : "rgba(255, 224, 145, 0.92)";
    context.beginPath();
    context.arc(x, y, 3.2, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(235, 246, 239, 0.82)";
    context.fillText(destination.label, x, y - 9);
  });

  const boatX = mapX(telemetry.position.x);
  const boatY = mapY(telemetry.position.z);
  const forwardX = Math.cos(telemetry.heading);
  const forwardY = Math.sin(telemetry.heading);
  const sideX = -forwardY;
  const sideY = forwardX;
  context.fillStyle = telemetry.mode === "Drive" ? "#91f2bf" : "#75dddd";
  context.strokeStyle = "rgba(2, 8, 10, 0.72)";
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(boatX + forwardX * 8, boatY + forwardY * 8);
  context.lineTo(boatX - forwardX * 6 + sideX * 4.5, boatY - forwardY * 6 + sideY * 4.5);
  context.lineTo(boatX - forwardX * 6 - sideX * 4.5, boatY - forwardY * 6 - sideY * 4.5);
  context.closePath();
  context.fill();
  context.stroke();

  if (isStale) {
    context.fillStyle = "rgba(208, 218, 205, 0.2)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(245, 241, 222, 0.72)";
    context.textAlign = "left";
    context.fillText("fog/stale", 10, height - 13);
  }
};

export const createDebugPanel = (
  container: HTMLElement,
  weatherStore: WeatherStore,
  eventBus: HashlakeEventBus,
  liveBitcoinStore: LiveBitcoinStore,
  getTelemetry: () => SceneTelemetry,
): DebugPanel => {
  const wrapper = document.createElement("div");
  wrapper.className = "debug-panel-shell";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.innerHTML = renderTemplate();
  container.append(wrapper);

  const fpsElement = wrapper.querySelector<HTMLSpanElement>("[data-debug-fps]");
  const stormValueElement = wrapper.querySelector<HTMLSpanElement>(
    "[data-debug-storm-value]",
  );
  const stormLabelElement = wrapper.querySelector<HTMLElement>("[data-debug-storm-label]");
  const stormSlider =
    wrapper.querySelector<HTMLInputElement>("[data-debug-storm-slider]");
  const liveModeElement = wrapper.querySelector<HTMLElement>("[data-debug-live-mode]");
  const closeButton = wrapper.querySelector<HTMLButtonElement>(".debug-close");
  const actionButtons = wrapper.querySelectorAll<HTMLButtonElement>("[data-debug-action]");
  const minimapCanvas = wrapper.querySelector<HTMLCanvasElement>("[data-debug-minimap]");
  const nearestLocationElement = wrapper.querySelector<HTMLElement>("[data-debug-nearest]");

  let fpsFrame = 0;
  let fpsFrames = 0;
  let fpsLastSample = window.performance.now();
  let timerId = 0;
  let currentWeatherDataMode: WeatherSnapshot["dataMode"] = "LIVE";
  let currentWeatherStale = false;
  const previousFeedSuccessAt = new Map<FeedName, number | null>();

  const setVisible = (visible: boolean) => {
    wrapper.classList.toggle("debug-panel-shell--visible", visible);
    wrapper.setAttribute("aria-hidden", String(!visible));
  };

  const renderWeather = (snapshot: WeatherSnapshot) => {
    currentWeatherDataMode = snapshot.dataMode;
    currentWeatherStale = snapshot.staleData;
    if (stormValueElement) {
      stormValueElement.textContent = snapshot.stormIndex.toFixed(1);
    }

    if (stormLabelElement) {
      stormLabelElement.textContent = snapshot.stage;
    }

    if (stormSlider) {
      stormSlider.value = snapshot.stormIndex.toFixed(1);
    }

    if (liveModeElement) {
      liveModeElement.textContent = snapshot.mode;
    }

    setMetric(
      "Data mode",
      snapshot.dataMode,
      snapshot.dataMode === "LIVE"
        ? "good"
        : snapshot.dataMode === "STALE"
          ? "bad"
          : "warn",
    );

    const stalenessMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Staleness"] .debug-metric__value',
    );
    const fireMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Fire / FW"] .debug-metric__value',
    );

    if (stalenessMetric) {
      stalenessMetric.textContent = snapshot.staleData ? "86%" : "0%";
      stalenessMetric.classList.toggle("debug-tone-warn", snapshot.staleData);
      stalenessMetric.classList.toggle("debug-tone-good", !snapshot.staleData);
    }

    if (fireMetric) {
      fireMetric.textContent = `${snapshot.dials.fireWeather.toFixed(2)} / ${snapshot.dials.fog.toFixed(2)}`;
    }

    dialLabels.forEach((dial) => {
      const row = wrapper.querySelector<HTMLElement>(`[data-debug-dial="${dial.key}"]`);
      const bar = row?.querySelector<HTMLElement>(".debug-dial__track span");
      const value = row?.querySelector<HTMLElement>("strong");
      const percent = Math.round(snapshot.dials[dial.key] * 100);
      if (bar) {
        bar.style.width = `${percent}%`;
      }
      if (value) {
        value.textContent = `${percent}%`;
      }
    });

    wrapper.dataset.weatherStage = snapshot.stage;
    wrapper.classList.toggle("debug-panel-shell--stale", snapshot.staleData);
  };

  const updateFeedTimers = () => {
    updateFeedRows(wrapper, liveBitcoinStore.getSnapshot());
  };

  const setMetric = (
    label: string,
    value: string,
    tone?: "good" | "bad" | "warn" | "muted",
  ) => {
    const element = wrapper.querySelector<HTMLElement>(
      `[data-debug-metric="${label}"] .debug-metric__value`,
    );
    if (!element) {
      return;
    }

    element.textContent = value;
    element.classList.toggle("debug-tone-good", tone === "good");
    element.classList.toggle("debug-tone-bad", tone === "bad");
    element.classList.toggle("debug-tone-warn", tone === "warn");
    element.classList.toggle("debug-tone-muted", tone === "muted");
  };

  const pulseMetricCard = (label: string) => {
    const element = wrapper.querySelector<HTMLElement>(`[data-debug-metric="${label}"]`);
    if (!element) {
      return;
    }

    element.classList.remove("debug-metric--fresh");
    void element.offsetWidth;
    element.classList.add("debug-metric--fresh");
  };

  const pulseFreshFeeds = (snapshot: LiveBitcoinSnapshot) => {
    feedRows.forEach((feed) => {
      const nextSuccessAt = snapshot.feeds[feed.name]?.lastSuccessAt ?? null;
      const hadPrevious = previousFeedSuccessAt.has(feed.name);
      const previousSuccessAt = previousFeedSuccessAt.get(feed.name) ?? null;
      previousFeedSuccessAt.set(feed.name, nextSuccessAt);

      if (!hadPrevious || !nextSuccessAt || nextSuccessAt === previousSuccessAt) {
        return;
      }

      const row = wrapper.querySelector<HTMLElement>(`[data-feed="${feed.name}"]`);
      if (row) {
        row.classList.remove("debug-feed--fresh");
        void row.offsetWidth;
        row.classList.add("debug-feed--fresh");
      }

      metricLabelsByFeed[feed.name].forEach(pulseMetricCard);
    });
  };

  const renderLiveData = (snapshot: LiveBitcoinSnapshot) => {
    const { metrics } = snapshot;
    pulseFreshFeeds(snapshot);
    setMetric("Price", formatCurrency(metrics.priceUsd));
    setMetric(
      "24h",
      formatPercent(metrics.priceChange24h),
      metrics.priceChange24h === null ? "muted" : metrics.priceChange24h >= 0 ? "good" : "bad",
    );
    setMetric(
      "7d",
      formatPercent(metrics.priceChange7d),
      metrics.priceChange7d === null ? "muted" : metrics.priceChange7d >= 0 ? "good" : "bad",
    );
    setMetric("Fastest fee", metrics.fastestFee === null ? "--" : `${metrics.fastestFee} sat/vB`);
    setMetric(
      "Mempool",
      metrics.mempoolCount === null
        ? "--"
        : `${new Intl.NumberFormat("en-US").format(metrics.mempoolCount)} tx`,
    );
    setMetric("Block", metrics.blockHeight === null ? "--" : `#${metrics.blockHeight}`);
    setMetric(
      "Block age",
      metrics.blockTimestamp === null
        ? "--"
        : formatAgo(Math.max(0, Math.floor(Date.now() / 1000 - metrics.blockTimestamp))),
    );
    setMetric("Difficulty", formatPercent(metrics.difficultyChange));
    setMetric("Hashrate dip", formatPercent(metrics.hashrateChange), "muted");
    setMetric(
      "WebSocket",
      snapshot.feeds.websocket.status,
      snapshot.feeds.websocket.status === "ok"
        ? "good"
        : snapshot.feeds.websocket.status === "reconnecting"
          ? "warn"
          : "bad",
    );
    setMetric(
      "Polling",
      snapshot.pollingMode,
      snapshot.pollingMode === "active"
        ? "good"
        : snapshot.pollingMode === "slowed"
          ? "warn"
          : "bad",
    );
    const displayedDataMode =
      currentWeatherDataMode === "MANUAL" ? "MANUAL" : snapshot.dataMode;
    setMetric(
      "Data mode",
      displayedDataMode,
      displayedDataMode === "LIVE"
        ? "good"
        : displayedDataMode === "STALE"
          ? "bad"
          : "warn",
    );
    setMetric(
      "Staleness",
      `${Math.round(snapshot.staleness * 100)}%`,
      snapshot.staleness > 0.65 ? "bad" : snapshot.staleness > 0.25 ? "warn" : "good",
    );

    const bars: Array<[string, number]> = [
      ["price trend", snapshot.contributions.priceTrend],
      ["network", snapshot.contributions.network],
      ["fees", snapshot.contributions.fees],
      ["congestion", snapshot.contributions.congestion],
      ["freshness", snapshot.contributions.freshness],
    ];

    bars.forEach(([label, value]) => {
      const row = wrapper.querySelector<HTMLElement>(`[data-debug-bar="${label}"]`);
      const bar = row?.querySelector<HTMLElement>(".debug-bar__track span");
      const strong = row?.querySelector<HTMLElement>(".debug-bar__meta strong");
      if (bar) {
        bar.style.width = `${Math.round((value / 10) * 100)}%`;
      }
      if (strong) {
        strong.textContent = value.toFixed(1);
      }
    });

    updateFeedRows(wrapper, snapshot);
  };

  const updateTelemetry = () => {
    const telemetry = getTelemetry();
    const modeMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Mode"] .debug-metric__value',
    );
    const speedMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Boat speed"] .debug-metric__value',
    );
    const positionMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Boat pos"] .debug-metric__value',
    );
    const cameraMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Camera"] .debug-metric__value',
    );
    const headingMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Heading"] .debug-metric__value',
    );
    const moveMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Move vec"] .debug-metric__value',
    );
    const steerMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Steer"] .debug-metric__value',
    );

    if (modeMetric) {
      modeMetric.textContent = telemetry.mode;
      modeMetric.classList.toggle("debug-tone-good", telemetry.mode === "Drive");
      modeMetric.classList.toggle("debug-tone-muted", telemetry.mode === "Frame");
    }

    if (speedMetric) {
      speedMetric.textContent = `${telemetry.speed.toFixed(1)} u/s`;
    }

    if (positionMetric) {
      positionMetric.textContent = `${telemetry.position.x.toFixed(0)}, ${telemetry.position.z.toFixed(0)}`;
    }

    if (cameraMetric) {
      cameraMetric.textContent = telemetry.savedTableau
        ? telemetry.cameraPreset
        : `${telemetry.cameraPreset}*`;
    }

    if (headingMetric) {
      const physicsHeading = ((telemetry.heading * 180) / Math.PI + 360) % 360;
      const visualHeading = ((telemetry.visualHeading * 180) / Math.PI + 360) % 360;
      headingMetric.textContent = `${physicsHeading.toFixed(0)} / ${visualHeading.toFixed(0)}`;
    }

    if (moveMetric) {
      moveMetric.textContent = `${telemetry.movementVector.x.toFixed(1)}, ${telemetry.movementVector.z.toFixed(1)}`;
    }

    if (steerMetric) {
      steerMetric.textContent = telemetry.steerInput.toFixed(2);
    }

    setMetric("Nearest", telemetry.nearestLocation);

    if (nearestLocationElement) {
      nearestLocationElement.textContent = telemetry.nearestLocation;
    }

    if (minimapCanvas) {
      drawMinimap(minimapCanvas, telemetry, currentWeatherStale);
    }
  };

  const updateFps = (time: number) => {
    fpsFrames += 1;
    updateTelemetry();

    if (time - fpsLastSample >= 500) {
      const fps = Math.round((fpsFrames * 1000) / (time - fpsLastSample));
      if (fpsElement) {
        fpsElement.textContent = String(fps);
      }

      fpsFrames = 0;
      fpsLastSample = time;
    }

    fpsFrame = window.requestAnimationFrame(updateFps);
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "d" || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    setVisible(!wrapper.classList.contains("debug-panel-shell--visible"));
  };

  stormSlider?.addEventListener("input", () => {
    weatherStore.setStormIndex(Number(stormSlider.value), "Manual");
  });

  closeButton?.addEventListener("click", () => setVisible(false));

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.debugAction;
      if (action === "crash") {
        weatherStore.triggerCrash();
      } else if (action === "rally") {
        weatherStore.triggerRally();
      } else if (action === "whale") {
        eventBus.emit({
          type: "whale",
          btcAmount: 14.7,
          intensity: 1,
          message: "Whale splash: 14.7 BTC",
        });
        weatherStore.setStormIndex(54, "Manual Whale");
      } else if (action === "block") {
        const latestBlock = liveBitcoinStore.getSnapshot().metrics.blockHeight;
        const simulatedBlock = latestBlock === null ? 902421 : latestBlock + 1;
        eventBus.emit({
          type: "newBlock",
          blockHeight: simulatedBlock,
          intensity: 0.85,
          message: `New block found - #${simulatedBlock}`,
        });
        weatherStore.setStormIndex(18, "Manual Block");
      } else if (action === "gust") {
        weatherStore.triggerGust();
      } else if (action === "stale") {
        weatherStore.triggerStaleFog();
      } else {
        weatherStore.resumeLive();
        const liveSnapshot = liveBitcoinStore.getSnapshot();
        const dataMode =
          liveSnapshot.dataMode === "STALE"
            ? "STALE"
            : liveSnapshot.dataMode === "CACHED"
              ? "CACHED"
              : "LIVE";
        weatherStore.setLiveStormIndex(
          liveSnapshot.stormIndex,
          dataMode,
          liveSnapshot.dataMode === "STALE",
        );
      }
    });
  });

  const unsubscribe = weatherStore.subscribe(renderWeather);
  const unsubscribeLive = liveBitcoinStore.subscribe(renderLiveData);
  window.addEventListener("keydown", handleKeydown);
  updateFeedTimers();
  updateTelemetry();
  timerId = window.setInterval(updateFeedTimers, 1000);
  fpsFrame = window.requestAnimationFrame(updateFps);

  return {
    element: wrapper,
    destroy: () => {
      window.removeEventListener("keydown", handleKeydown);
      window.clearInterval(timerId);
      window.cancelAnimationFrame(fpsFrame);
      unsubscribe();
      unsubscribeLive();
      wrapper.remove();
    },
    isVisible: () => wrapper.classList.contains("debug-panel-shell--visible"),
    setVisible,
    toggle: () => setVisible(!wrapper.classList.contains("debug-panel-shell--visible")),
  };
};
