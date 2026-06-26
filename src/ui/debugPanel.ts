import { BUILD_INFO } from "../buildInfo";
import type { HashlakeEventBus } from "../state/eventBus";
import type {
  FeedName,
  FeedSource,
  FeedStatus,
  LiveBitcoinSnapshot,
  LiveBitcoinStore,
} from "../state/liveBitcoinStore";
import {
  WHALE_HUGE_BTC,
  WHALE_LARGE_BTC,
  WHALE_MEDIUM_BTC,
  WHALE_MIN_BTC,
} from "../state/liveBitcoinStore";
import type { WeatherDials, WeatherSnapshot, WeatherStore } from "../state/weatherEngine";
import { LAKE_MAP, LAKE_OUTLINE } from "../scene/lakeMap";
import type { ScenicAssetStatuses } from "../scene/scenicAssets";
import type { ScenicExperimentalStats } from "../scene/realismSpike";
import type { WebGpuScenicStats } from "../scene/webgpuScenicBackdrop";
import type {
  NativeTreeTypeCounts,
  TreeAlphaAssetStatuses,
} from "../scene/forestSystem";

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
  group:
    | "global"
    | "bitcoin"
    | "network"
    | "weather"
    | "boat";
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
  cameraHeading: number;
  movementVector: {
    x: number;
    z: number;
  };
  steerInput: number;
  throttleInput: number;
  brakeInput: number;
  boostActive: boolean;
  inputSource: "desktop" | "mobile" | "none";
  worldRotationLocked: boolean;
  headingWarning: boolean;
  cameraWarning: boolean;
  cameraPreset: string;
  nearestLocation: string;
  savedTableau: boolean;
  fps: number;
  frameTimeMs: number;
  qualityPreset: "Performance" | "Balanced" | "Scenic";
  pixelRatio: number;
  renderScale: number;
  scenicExperimental: ScenicExperimentalStats;
  webGpuScenic: WebGpuScenicStats;
  activeWakeBlocks: number;
  activeEffectBlocks: number;
  activeRings: number;
  activeSplashes: number;
  lastSplashDistanceToBoat: number | null;
  lastBoatImpulseStrength: number;
  treeInstances: number;
  nativeTreeInstances: number;
  instancedTreeInstances: number;
  individualTreeInstances: number;
  treeTypeCounts: NativeTreeTypeCounts;
  rejectedTreeCandidates: number;
  treeAlphaInstances: number;
  treeAlphaAssets: TreeAlphaAssetStatuses;
  forestBandInstances: number;
  forestBandMethod: string;
  reedInstances: number;
  rockInstances: number;
  mountainVertices: number;
  postEnabled: boolean;
  reflectionEnabled: boolean;
  scenicAssets: ScenicAssetStatuses;
};

const metricTiles: MetricTile[] = [
  { group: "global", label: "Phase", value: BUILD_INFO.phase, tone: "good" },
  { group: "global", label: "Build hash", value: BUILD_INFO.commit, tone: "muted" },
  {
    group: "global",
    label: "Built",
    value: BUILD_INFO.builtAt.replace("T", " ").slice(0, 16) + "Z",
    tone: "muted",
  },
  { group: "global", label: "Data mode", value: "LIVE", tone: "good" },
  { group: "global", label: "Polling", value: "active", tone: "good" },
  { group: "global", label: "Staleness", value: "0%", tone: "good" },
  { group: "global", label: "Three.js", value: "--", tone: "muted" },
  { group: "global", label: "Renderer", value: "WebGLRenderer", tone: "muted" },
  { group: "global", label: "WebGL2", value: "--", tone: "muted" },
  { group: "global", label: "WebGPU", value: "--", tone: "muted" },
  { group: "global", label: "Perf Governor", value: "Balanced", tone: "muted" },
  { group: "global", label: "Frame ms", value: "--" },
  { group: "global", label: "Pixel ratio", value: "1.00" },
  { group: "global", label: "Render scale", value: "1.00" },
  { group: "global", label: "Legacy spike", value: "off", tone: "muted" },
  { group: "global", label: "Legacy verts", value: "0", tone: "muted" },
  { group: "global", label: "Legacy forest", value: "0", tone: "muted" },
  { group: "global", label: "Legacy fog", value: "0", tone: "muted" },
  { group: "global", label: "Scenic Mode", value: "OFF", tone: "muted" },
  { group: "global", label: "WebGPU scenic", value: "off", tone: "muted" },
  { group: "global", label: "WebGPU active", value: "no", tone: "muted" },
  { group: "global", label: "WebGPU probe", value: "idle", tone: "muted" },
  { group: "global", label: "Fallback", value: "active", tone: "good" },
  { group: "global", label: "Scenic requested", value: "no", tone: "muted" },
  { group: "global", label: "Scenic active", value: "no", tone: "muted" },
  { group: "global", label: "Scenic terrain", value: "no", tone: "muted" },
  { group: "global", label: "Scenic forest", value: "no", tone: "muted" },
  { group: "global", label: "Scenic fog", value: "no", tone: "muted" },
  { group: "global", label: "Scenic visual gate", value: "ok", tone: "muted" },
  { group: "global", label: "P73 terrain", value: "0", tone: "muted" },
  { group: "global", label: "P73 forest", value: "0", tone: "muted" },
  { group: "global", label: "P73 fog", value: "off", tone: "muted" },
  { group: "weather", label: "Fire / FW", value: "0.00 / 0.00" },
  { group: "weather", label: "Wake blocks", value: "0" },
  { group: "weather", label: "Splash blocks", value: "0" },
  { group: "weather", label: "Rings", value: "0" },
  { group: "weather", label: "Splashes", value: "0" },
  { group: "weather", label: "Splash dist", value: "--" },
  { group: "weather", label: "Boat impulse", value: "0.00" },
  { group: "weather", label: "Trees", value: "0" },
  { group: "weather", label: "Native trees", value: "0" },
  { group: "weather", label: "Instanced trees", value: "0" },
  { group: "weather", label: "Individual trees", value: "0", tone: "muted" },
  { group: "weather", label: "Tree types", value: "T0 S0 M0 L0 B0 F0 Y0", tone: "muted" },
  { group: "weather", label: "Tree rejects", value: "0", tone: "muted" },
  { group: "weather", label: "Tree alpha", value: "fallback", tone: "muted" },
  { group: "weather", label: "Tree samples", value: "0" },
  { group: "weather", label: "Forest band", value: "0" },
  { group: "weather", label: "Band method", value: "instanced", tone: "muted" },
  { group: "weather", label: "Reeds", value: "0" },
  { group: "weather", label: "Rocks", value: "0" },
  { group: "weather", label: "Mount verts", value: "0" },
  { group: "weather", label: "Post", value: "on", tone: "good" },
  { group: "weather", label: "Shader reflect", value: "off", tone: "muted" },
  { group: "weather", label: "Mountain asset", value: "fallback", tone: "muted" },
  { group: "weather", label: "Mountain alpha", value: "fallback", tone: "muted" },
  { group: "weather", label: "Treeline asset", value: "fallback", tone: "muted" },
  { group: "weather", label: "Shoreline asset", value: "fallback", tone: "muted" },
  { group: "weather", label: "Debug UI", value: "hidden", tone: "muted" },
  { group: "weather", label: "DOM cadence", value: "hidden idle", tone: "muted" },
  { group: "bitcoin", label: "Price", value: "$62,989" },
  { group: "bitcoin", label: "24h", value: "+0.48%", tone: "good" },
  { group: "bitcoin", label: "7d", value: "-1.27%", tone: "bad" },
  { group: "bitcoin", label: "Market WS", value: "offline", tone: "muted" },
  { group: "bitcoin", label: "Tick age", value: "--" },
  { group: "bitcoin", label: "Heartbeat", value: "--" },
  { group: "bitcoin", label: "Price shown", value: "--" },
  { group: "bitcoin", label: "Whale status", value: "no recent whale", tone: "muted" },
  { group: "bitcoin", label: "Whale poll", value: "--" },
  { group: "bitcoin", label: "Last whale", value: "--" },
  { group: "bitcoin", label: "Recent whales", value: "0" },
  { group: "bitcoin", label: "Whale threshold", value: ">=3 BTC" },
  { group: "bitcoin", label: "Last txid", value: "--" },
  { group: "bitcoin", label: "Splash source", value: "none", tone: "muted" },
  { group: "network", label: "Fastest fee", value: "3 sat/vB" },
  { group: "network", label: "Mempool", value: "113,080 tx" },
  { group: "network", label: "Block", value: "#954,434" },
  { group: "network", label: "Block age", value: "12.2 min" },
  { group: "network", label: "Difficulty", value: "+4.40%" },
  { group: "network", label: "Hashrate dip", value: "-2.65%" },
  { group: "network", label: "WebSocket", value: "live", tone: "good" },
  { group: "boat", label: "Mode", value: "Frame", tone: "muted" },
  { group: "boat", label: "Boat speed", value: "0.0" },
  { group: "boat", label: "Boat pos", value: "0, 0" },
  { group: "boat", label: "Heading", value: "0 / 0" },
  { group: "boat", label: "Camera hdg", value: "0" },
  { group: "boat", label: "Move vec", value: "0, 0" },
  { group: "boat", label: "Steer", value: "0.00" },
  { group: "boat", label: "Throttle", value: "0.00" },
  { group: "boat", label: "Brake", value: "0.00" },
  { group: "boat", label: "Boost", value: "off" },
  { group: "boat", label: "Input", value: "none" },
  { group: "boat", label: "World lock", value: "locked", tone: "good" },
  { group: "boat", label: "Nearest", value: "Dock" },
  { group: "boat", label: "Camera", value: "Cinematic" },
];

const metricGroups: Array<{ key: MetricTile["group"]; title: string }> = [
  { key: "global", title: "Data Mode / Global" },
  { key: "bitcoin", title: "Bitcoin / Market" },
  { key: "network", title: "Network / Mempool" },
  { key: "weather", title: "Weather Engine" },
  { key: "boat", title: "Boat / Drive" },
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
  { name: "whales", status: "ok", source: "live" },
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
  whales: [
    "Whale status",
    "Last whale",
    "Recent whales",
    "Splash source",
  ],
  websocket: ["WebSocket"],
};

const getAssetTone = (status: SceneTelemetry["scenicAssets"]["mountain"]): MetricTile["tone"] => {
  if (status === "loaded") {
    return "good";
  }
  if (status === "error") {
    return "warn";
  }
  return "muted";
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

const formatHeading = (radians: number) =>
  (((radians * 180) / Math.PI + 360) % 360).toFixed(0);

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

const formatBtcAmount = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })} BTC`;
};

const formatPercent = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
};

const getFeedDisplayName = (name: FeedName) =>
  name === "whales" ? "Mempool Whale Watch" : name;

const getWhaleWatchTone = (status: LiveBitcoinSnapshot["whaleWatch"]["status"]) => {
  if (status === "error" || status === "backoff") {
    return "bad";
  }

  if (status === "ok" || status === "manual test") {
    return "good";
  }

  return "muted";
};

const formatTxid = (txid: string | null) =>
  txid ? `${txid.slice(0, 6)}...${txid.slice(-6)}` : "--";

const formatTreeTypeCounts = (counts: NativeTreeTypeCounts) =>
  [
    `T${counts.tallNarrowPine}`,
    `S${counts.shortPine}`,
    `M${counts.mediumConifer}`,
    `L${counts.layeredConifer}`,
    `B${counts.broadEvergreenCluster}`,
    `C${counts.canopyMound}`,
    `G${counts.backgroundCanopyMass}`,
    `W${counts.wideDarkConiferCluster}`,
    `I${counts.irregularCanopyMound}`,
    `U${counts.understoryShrubMass}`,
    `K${counts.brokenSilhouettePine}`,
    `V${counts.forestWallCanopy}`,
    `P${counts.fullSpruceCluster}`,
    `F${counts.distantSilhouetteTree}`,
    `Y${counts.youngPine}`,
  ].join(" ");

const createMetricCards = (group: MetricTile["group"]) =>
  metricTiles
    .filter((tile) => tile.group === group)
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

const createMetricSections = () =>
  metricGroups
    .map(
      (group) => `
        <div class="debug-metric-section debug-metric-section--${group.key}">
          <div class="debug-section__heading">
            <span>${group.title}</span>
          </div>
          <div class="debug-metrics">
            ${createMetricCards(group.key)}
          </div>
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
          <span class="debug-feed__name">${getFeedDisplayName(feed.name)}</span>
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
        <span class="debug-panel__build">${BUILD_INFO.phase} / ${BUILD_INFO.commit}</span>
      </div>
      <div class="debug-panel__actions">
        <span class="debug-fps"><span data-debug-fps>--</span> fps</span>
        <button class="debug-close" type="button" aria-label="Close debug panel">x</button>
      </div>
    </header>

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

    ${createMetricSections()}

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
        <span>Manual Event Tests</span>
        <strong data-debug-live-mode>Live</strong>
      </div>
      <div class="debug-manual__buttons">
        <button type="button" data-debug-action="crash">Crash</button>
        <button type="button" data-debug-action="rally">Rally</button>
        <button type="button" data-debug-action="whale">Whale 14.7</button>
        <button type="button" data-debug-action="whale-3">3 BTC</button>
        <button type="button" data-debug-action="whale-10">10 BTC</button>
        <button type="button" data-debug-action="whale-50">50 BTC</button>
        <button type="button" data-debug-action="whale-300">300 BTC</button>
        <button type="button" data-debug-action="whale-1000">1000 BTC</button>
        <button type="button" data-debug-action="whale-1750">1750 BTC</button>
        <button type="button" data-debug-action="block">Block</button>
        <button type="button" data-debug-action="perf-stress">Perf Stress</button>
        <button type="button" data-debug-action="toast-block">Toast Block</button>
        <button type="button" data-debug-action="toast-stale">Toast Stale</button>
        <button type="button" data-debug-action="scenic-toggle">Toggle Scenic</button>
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

    const isWhaleWatch = feed.name === "whales";
    const nextStatus = isWhaleWatch
      ? snapshot.whaleWatch.status === "error" || snapshot.whaleWatch.status === "backoff"
        ? "error"
        : "ok"
      : liveFeed.status;
    dot.className = `debug-feed__dot debug-feed__dot--${nextStatus}`;
    if (isWhaleWatch) {
      status.textContent = snapshot.whaleWatch.status;
      source.textContent =
        snapshot.whaleWatch.source === "manual"
          ? "manual test"
          : snapshot.whaleWatch.lastPollAt
            ? "mempool.space"
            : "pending";
      timer.textContent = formatLastSeen(snapshot.whaleWatch.lastPollAt);
    } else {
      status.textContent = nextStatus;
      source.textContent = liveFeed.source;
      timer.textContent = formatLastSeen(liveFeed.lastSuccessAt);
    }
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
  tracePolygon(LAKE_OUTLINE);
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
  const minimapCanvas = wrapper.querySelector<HTMLCanvasElement>("[data-debug-minimap]");
  const nearestLocationElement = wrapper.querySelector<HTMLElement>("[data-debug-nearest]");

  let timerId = 0;
  let telemetryTimerId = 0;
  let currentWeatherDataMode: WeatherSnapshot["dataMode"] = "LIVE";
  let currentWeatherStale = false;
  const previousFeedSuccessAt = new Map<FeedName, number | null>();

  const setVisible = (visible: boolean) => {
    wrapper.classList.toggle("debug-panel-shell--visible", visible);
    wrapper.setAttribute("aria-hidden", String(!visible));
    if (visible) {
      renderWeather(weatherStore.getSnapshot());
      renderLiveData(liveBitcoinStore.getSnapshot());
      updateFeedRows(wrapper, liveBitcoinStore.getSnapshot());
      updateTelemetry();
    }
  };

  const renderWeather = (snapshot: WeatherSnapshot) => {
    currentWeatherDataMode = snapshot.dataMode;
    currentWeatherStale = snapshot.staleData;
    if (!wrapper.classList.contains("debug-panel-shell--visible")) {
      return;
    }
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
    if (!wrapper.classList.contains("debug-panel-shell--visible")) {
      return;
    }
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
      const nextSuccessAt =
        feed.name === "whales"
          ? snapshot.whaleWatch.lastDetectedAt
          : feed.name === "market"
          ? snapshot.marketWebSocket.lastPriceDisplayAt
          : (snapshot.feeds[feed.name]?.lastSuccessAt ?? null);
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
    if (!wrapper.classList.contains("debug-panel-shell--visible")) {
      return;
    }

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
      "Market WS",
      snapshot.marketWebSocket.status,
      snapshot.marketWebSocket.status === "ok"
        ? "good"
        : snapshot.marketWebSocket.status === "reconnecting"
          ? "warn"
          : "bad",
    );
    setMetric("Tick age", formatLastSeen(snapshot.marketWebSocket.lastTickAt));
    setMetric("Heartbeat", formatLastSeen(snapshot.marketWebSocket.lastHeartbeatAt));
    setMetric("Price shown", formatLastSeen(snapshot.marketWebSocket.lastPriceDisplayAt));
    setMetric(
      "Whale status",
      snapshot.whaleWatch.status,
      getWhaleWatchTone(snapshot.whaleWatch.status),
    );
    setMetric("Whale poll", formatLastSeen(snapshot.whaleWatch.lastPollAt));
    setMetric("Last whale", formatBtcAmount(snapshot.whaleWatch.btcAmount));
    setMetric("Recent whales", new Intl.NumberFormat("en-US").format(snapshot.whaleWatch.recentQualifyingCount));
    setMetric("Whale threshold", `>=${snapshot.whaleWatch.thresholdBtc} BTC`);
    setMetric("Last txid", formatTxid(snapshot.whaleWatch.txid), "muted");
    setMetric(
      "Splash source",
      snapshot.whaleWatch.lastSplashSource,
      snapshot.whaleWatch.lastSplashSource === "live"
        ? "good"
        : snapshot.whaleWatch.lastSplashSource === "manual"
          ? "warn"
          : "muted",
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
    const cameraHeadingMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Camera hdg"] .debug-metric__value',
    );
    const moveMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Move vec"] .debug-metric__value',
    );
    const steerMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Steer"] .debug-metric__value',
    );
    const throttleMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Throttle"] .debug-metric__value',
    );
    const brakeMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Brake"] .debug-metric__value',
    );
    const inputMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="Input"] .debug-metric__value',
    );
    const worldLockMetric = wrapper.querySelector<HTMLElement>(
      '[data-debug-metric="World lock"] .debug-metric__value',
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
      headingMetric.textContent = `${formatHeading(telemetry.heading)} / ${formatHeading(
        telemetry.visualHeading,
      )}`;
      headingMetric.classList.toggle("debug-tone-bad", telemetry.headingWarning);
    }

    if (cameraHeadingMetric) {
      cameraHeadingMetric.textContent = formatHeading(telemetry.cameraHeading);
      cameraHeadingMetric.classList.toggle("debug-tone-bad", telemetry.cameraWarning);
    }

    if (moveMetric) {
      moveMetric.textContent = `${telemetry.movementVector.x.toFixed(1)}, ${telemetry.movementVector.z.toFixed(1)}`;
    }

    if (steerMetric) {
      steerMetric.textContent = telemetry.steerInput.toFixed(2);
    }

    if (throttleMetric) {
      throttleMetric.textContent = telemetry.throttleInput.toFixed(2);
    }

    if (brakeMetric) {
      brakeMetric.textContent = telemetry.brakeInput.toFixed(2);
    }

    if (inputMetric) {
      inputMetric.textContent = telemetry.inputSource;
    }

    if (worldLockMetric) {
      worldLockMetric.textContent = telemetry.worldRotationLocked ? "locked" : "rotating";
      worldLockMetric.classList.toggle("debug-tone-good", telemetry.worldRotationLocked);
      worldLockMetric.classList.toggle("debug-tone-bad", !telemetry.worldRotationLocked);
    }

    setMetric("Three.js", `r${telemetry.scenicExperimental.threeRevision}`, "muted");
    setMetric("Renderer", telemetry.scenicExperimental.rendererPath, "muted");
    setMetric("WebGL2", telemetry.scenicExperimental.webgl2 ? "supported" : "no", telemetry.scenicExperimental.webgl2 ? "good" : "warn");
    setMetric("WebGPU", telemetry.scenicExperimental.webgpu ? "available" : "deferred", telemetry.scenicExperimental.webgpu ? "good" : "muted");
    setMetric(
      "Perf Governor",
      telemetry.qualityPreset,
      telemetry.qualityPreset === "Performance" ? "warn" : telemetry.qualityPreset === "Scenic" ? "good" : "muted",
    );
    setMetric("Frame ms", `${telemetry.frameTimeMs.toFixed(1)} ms`);
    setMetric("Pixel ratio", telemetry.pixelRatio.toFixed(2));
    setMetric("Render scale", telemetry.renderScale.toFixed(2));
    setMetric(
      "Legacy spike",
      `${telemetry.scenicExperimental.active ? "on" : "off"} - ${telemetry.scenicExperimental.reason}`,
      telemetry.scenicExperimental.active ? "good" : telemetry.scenicExperimental.requested ? "warn" : "muted",
    );
    setMetric(
      "Legacy verts",
      String(telemetry.scenicExperimental.mountainVertices),
      telemetry.scenicExperimental.active ? "good" : "muted",
    );
    setMetric(
      "Legacy forest",
      String(telemetry.scenicExperimental.forestInstances),
      telemetry.scenicExperimental.active ? "good" : "muted",
    );
    setMetric(
      "Legacy fog",
      `${telemetry.scenicExperimental.fogLayers} layers`,
      telemetry.scenicExperimental.active ? "good" : "muted",
    );
    setMetric(
      "Scenic Mode",
      telemetry.webGpuScenic.scenicMode,
      telemetry.webGpuScenic.scenicMode === "ON"
        ? "good"
        : telemetry.webGpuScenic.scenicMode === "ERROR"
          ? "bad"
          : telemetry.webGpuScenic.scenicMode === "FALLBACK"
            ? "warn"
            : "muted",
    );
    setMetric(
      "WebGPU scenic",
      `${telemetry.webGpuScenic.active ? "on" : "off"} - ${telemetry.webGpuScenic.reason}`,
      telemetry.webGpuScenic.active ? "good" : telemetry.webGpuScenic.requested ? "warn" : "muted",
    );
    setMetric(
      "WebGPU active",
      telemetry.webGpuScenic.webgpuActive ? "yes" : "no",
      telemetry.webGpuScenic.webgpuActive ? "good" : "muted",
    );
    setMetric(
      "WebGPU probe",
      telemetry.webGpuScenic.webgpuProbeStatus,
      telemetry.webGpuScenic.webgpuProbeStatus === "initialized"
        ? "good"
        : telemetry.webGpuScenic.webgpuProbeStatus === "failed"
          ? "bad"
          : telemetry.webGpuScenic.webgpuProbeStatus === "probing"
            ? "warn"
            : "muted",
    );
    setMetric(
      "Fallback",
      telemetry.webGpuScenic.fallbackActive ? "active" : "experimental gated",
      telemetry.webGpuScenic.fallbackActive ? "good" : "warn",
    );
    setMetric(
      "Scenic requested",
      telemetry.webGpuScenic.requested ? "yes" : "no",
      telemetry.webGpuScenic.requested ? "good" : "muted",
    );
    setMetric(
      "Scenic active",
      telemetry.webGpuScenic.active ? "yes" : "no",
      telemetry.webGpuScenic.active ? "good" : "muted",
    );
    setMetric(
      "Scenic terrain",
      telemetry.webGpuScenic.terrainVisible ? "yes" : "no",
      telemetry.webGpuScenic.terrainVisible ? "good" : "muted",
    );
    setMetric(
      "Scenic forest",
      telemetry.webGpuScenic.forestVisible ? "yes" : "no",
      telemetry.webGpuScenic.forestVisible ? "good" : "muted",
    );
    setMetric(
      "Scenic fog",
      telemetry.webGpuScenic.fogVisible ? "yes" : "no",
      telemetry.webGpuScenic.fogVisible ? "good" : "muted",
    );
    setMetric(
      "Scenic visual gate",
      telemetry.webGpuScenic.visualRegressionDisabled ? "terrain/fog panes disabled" : "ok",
      telemetry.webGpuScenic.visualRegressionDisabled ? "warn" : "good",
    );
    setMetric(
      "P73 terrain",
      String(telemetry.webGpuScenic.terrainVertices),
      telemetry.webGpuScenic.active ? "good" : "muted",
    );
    setMetric(
      "P73 forest",
      String(telemetry.webGpuScenic.forestInstances),
      telemetry.webGpuScenic.active ? "good" : "muted",
    );
    setMetric(
      "P73 fog",
      telemetry.webGpuScenic.fogMode,
      telemetry.webGpuScenic.active ? "good" : "muted",
    );
    setMetric("Wake blocks", String(telemetry.activeWakeBlocks));
    setMetric("Splash blocks", String(telemetry.activeEffectBlocks));
    setMetric("Rings", String(telemetry.activeRings));
    setMetric("Splashes", String(telemetry.activeSplashes));
    setMetric(
      "Splash dist",
      telemetry.lastSplashDistanceToBoat === null
        ? "--"
        : `${telemetry.lastSplashDistanceToBoat.toFixed(0)}u`,
    );
    setMetric("Boat impulse", telemetry.lastBoatImpulseStrength.toFixed(2));
    setMetric("Trees", String(telemetry.treeInstances));
    setMetric("Native trees", String(telemetry.nativeTreeInstances));
    setMetric("Instanced trees", String(telemetry.instancedTreeInstances), "good");
    setMetric(
      "Individual trees",
      String(telemetry.individualTreeInstances),
      telemetry.individualTreeInstances > 0 ? "warn" : "muted",
    );
    setMetric("Tree types", formatTreeTypeCounts(telemetry.treeTypeCounts), "muted");
    setMetric(
      "Tree rejects",
      String(telemetry.rejectedTreeCandidates),
      telemetry.rejectedTreeCandidates > 0 ? "warn" : "good",
    );
    const treeAlphaLoaded = Object.values(telemetry.treeAlphaAssets).filter((status) => status === "loaded").length;
    const treeAlphaErrors = Object.values(telemetry.treeAlphaAssets).filter((status) => status === "error").length;
    setMetric(
      "Tree alpha",
      treeAlphaErrors > 0 ? `${treeAlphaLoaded}/3 loaded, ${treeAlphaErrors} error` : `${treeAlphaLoaded}/3 loaded`,
      treeAlphaLoaded === 3 ? "good" : treeAlphaErrors > 0 ? "warn" : "muted",
    );
    setMetric("Tree samples", String(telemetry.treeAlphaInstances));
    setMetric("Forest band", String(telemetry.forestBandInstances));
    setMetric("Band method", telemetry.forestBandMethod, "muted");
    setMetric("Reeds", String(telemetry.reedInstances));
    setMetric("Rocks", String(telemetry.rockInstances));
    setMetric("Mount verts", String(telemetry.mountainVertices));
    setMetric("Post", telemetry.postEnabled ? "on" : "off", telemetry.postEnabled ? "good" : "muted");
    setMetric(
      "Shader reflect",
      telemetry.reflectionEnabled ? "on" : "off",
      telemetry.reflectionEnabled ? "good" : "muted",
    );
    setMetric("Mountain asset", telemetry.scenicAssets.mountain, getAssetTone(telemetry.scenicAssets.mountain));
    setMetric(
      "Mountain alpha",
      telemetry.scenicAssets.mountainAlpha,
      getAssetTone(telemetry.scenicAssets.mountainAlpha),
    );
    setMetric("Treeline asset", telemetry.scenicAssets.treeline, getAssetTone(telemetry.scenicAssets.treeline));
    setMetric("Shoreline asset", telemetry.scenicAssets.shoreline, getAssetTone(telemetry.scenicAssets.shoreline));
    setMetric("Debug UI", "visible", "good");
    setMetric("DOM cadence", "250ms visible / hidden idle", "muted");
    setMetric("Boost", telemetry.boostActive ? "on" : "off", telemetry.boostActive ? "good" : "muted");
    setMetric("Nearest", telemetry.nearestLocation);

    if (nearestLocationElement) {
      nearestLocationElement.textContent = telemetry.nearestLocation;
    }

    if (minimapCanvas) {
      drawMinimap(minimapCanvas, telemetry, currentWeatherStale);
    }
  };

  const updateDebugTelemetry = () => {
    const panelVisible = wrapper.classList.contains("debug-panel-shell--visible");
    if (panelVisible) {
      updateTelemetry();
      if (fpsElement && panelVisible) {
        fpsElement.textContent = String(Math.round(getTelemetry().fps));
      }
    }
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

  const handleDebugAction = (action: string | undefined) => {
    const emitManualWhale = (btcAmount: number) => {
      liveBitcoinStore.recordManualWhale(btcAmount);
    };

    if (action === "crash") {
      weatherStore.triggerCrash();
    } else if (action === "rally") {
      weatherStore.triggerRally();
    } else if (action === "whale") {
      emitManualWhale(14.7);
    } else if (action === "whale-3") {
      emitManualWhale(WHALE_MIN_BTC);
    } else if (action === "whale-10") {
      emitManualWhale(WHALE_MEDIUM_BTC);
    } else if (action === "whale-50") {
      emitManualWhale(WHALE_LARGE_BTC);
    } else if (action === "whale-300") {
      emitManualWhale(WHALE_HUGE_BTC);
    } else if (action === "whale-1000") {
      emitManualWhale(1000);
    } else if (action === "whale-1750") {
      emitManualWhale(1750);
    } else if (action === "block") {
      const latestBlock = liveBitcoinStore.getSnapshot().metrics.blockHeight;
      const simulatedBlock = latestBlock === null ? 902421 : latestBlock + 1;
      eventBus.emit({
        type: "newBlock",
        blockHeight: simulatedBlock,
        intensity: 0.85,
        message: `New block found - #${simulatedBlock}`,
      });
    } else if (action === "perf-stress") {
      const latestBlock = liveBitcoinStore.getSnapshot().metrics.blockHeight;
      const simulatedBlock = latestBlock === null ? 902421 : latestBlock + 1;
      const stressTrades = [
        { btcAmount: WHALE_MIN_BTC, intensity: 0.42 },
        { btcAmount: WHALE_MEDIUM_BTC, intensity: 0.7 },
        { btcAmount: WHALE_LARGE_BTC, intensity: 1.2 },
        { btcAmount: WHALE_HUGE_BTC, intensity: 2.4 },
      ];
      stressTrades.forEach((trade) => {
        eventBus.emit({
          type: "whale",
          btcAmount: trade.btcAmount,
          source: "manual",
          intensity: trade.intensity,
          message: `Perf stress - ${trade.btcAmount} BTC`,
        });
      });
      eventBus.emit({
        type: "newBlock",
        blockHeight: simulatedBlock,
        intensity: 0.85,
        message: `New block found - #${simulatedBlock}`,
      });
    } else if (action === "toast-block") {
      const latestBlock = liveBitcoinStore.getSnapshot().metrics.blockHeight;
      eventBus.emit({
        type: "newBlock",
        blockHeight: latestBlock === null ? 954506 : latestBlock + 1,
        intensity: 0,
      });
    } else if (action === "toast-stale") {
      eventBus.emit({
        type: "stale",
        message: "Stale data - fog rolling in",
      });
    } else if (action === "scenic-toggle") {
      window.dispatchEvent(new CustomEvent("hashlake:toggle-webgpu-scenic"));
    } else if (action === "gust") {
      weatherStore.triggerGust();
    } else if (action === "stale") {
      weatherStore.triggerStaleFog();
    } else if (action === "resume") {
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
  };

  const handleDebugClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-debug-action]",
    );
    if (!button || !wrapper.contains(button)) {
      return;
    }

    handleDebugAction(button.dataset.debugAction);
  };

  wrapper.addEventListener("click", handleDebugClick);

  const unsubscribe = weatherStore.subscribe(renderWeather);
  const unsubscribeLive = liveBitcoinStore.subscribe(renderLiveData);
  window.addEventListener("keydown", handleKeydown);
  updateFeedTimers();
  timerId = window.setInterval(updateFeedTimers, 1000);
  telemetryTimerId = window.setInterval(updateDebugTelemetry, 250);

  return {
    element: wrapper,
    destroy: () => {
      window.removeEventListener("keydown", handleKeydown);
      wrapper.removeEventListener("click", handleDebugClick);
      window.clearInterval(timerId);
      window.clearInterval(telemetryTimerId);
      unsubscribe();
      unsubscribeLive();
      wrapper.remove();
    },
    isVisible: () => wrapper.classList.contains("debug-panel-shell--visible"),
    setVisible,
    toggle: () => setVisible(!wrapper.classList.contains("debug-panel-shell--visible")),
  };
};
