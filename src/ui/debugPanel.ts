import type { HashlakeEventBus } from "../state/eventBus";
import type { WeatherDials, WeatherSnapshot, WeatherStore } from "../state/weatherEngine";

type FeedStatus = "ok" | "stale" | "error" | "offline";

type FeedRow = {
  name: string;
  status: FeedStatus;
  lastSeenOffsetSeconds: number;
  source: "live" | "cached" | "sim";
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
  cameraPreset: string;
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
  { label: "Staleness", value: "0%", tone: "good" },
  { label: "Fire / FW", value: "0.00 / 0.00" },
  { label: "Mode", value: "Frame", tone: "muted" },
  { label: "Boat speed", value: "0.0" },
  { label: "Boat pos", value: "0, 0" },
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
  { name: "price", status: "ok", lastSeenOffsetSeconds: 0, source: "live" },
  { name: "mempool", status: "ok", lastSeenOffsetSeconds: 1, source: "live" },
  { name: "fees", status: "stale", lastSeenOffsetSeconds: 64, source: "cached" },
  { name: "whales", status: "ok", lastSeenOffsetSeconds: 2, source: "sim" },
  { name: "market", status: "stale", lastSeenOffsetSeconds: 86, source: "cached" },
  { name: "difficulty", status: "ok", lastSeenOffsetSeconds: 86, source: "cached" },
  { name: "hashrate", status: "error", lastSeenOffsetSeconds: 120, source: "cached" },
  { name: "websocket", status: "offline", lastSeenOffsetSeconds: 12, source: "sim" },
];

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
  </section>
`;

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const updateFeedRows = (wrapper: HTMLElement, staleData: boolean) => {
  for (const feed of feedRows) {
    const row = wrapper.querySelector<HTMLElement>(`[data-feed="${feed.name}"]`);
    const dot = row?.querySelector<HTMLElement>(".debug-feed__dot");
    const status = row?.querySelector<HTMLElement>(".debug-feed__status");
    if (!row || !dot || !status) {
      continue;
    }

    const nextStatus: FeedStatus =
      staleData && ["price", "mempool", "fees", "market"].includes(feed.name)
        ? "stale"
        : feed.status;
    dot.className = `debug-feed__dot debug-feed__dot--${nextStatus}`;
    status.textContent = nextStatus;
  }
};

export const createDebugPanel = (
  container: HTMLElement,
  weatherStore: WeatherStore,
  eventBus: HashlakeEventBus,
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

  const feedStartedAt = window.performance.now();
  let fpsFrame = 0;
  let fpsFrames = 0;
  let fpsLastSample = window.performance.now();
  let timerId = 0;

  const setVisible = (visible: boolean) => {
    wrapper.classList.toggle("debug-panel-shell--visible", visible);
    wrapper.setAttribute("aria-hidden", String(!visible));
  };

  const renderWeather = (snapshot: WeatherSnapshot) => {
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

    updateFeedRows(wrapper, snapshot.staleData);
    wrapper.dataset.weatherStage = snapshot.stage;
    wrapper.classList.toggle("debug-panel-shell--stale", snapshot.staleData);
  };

  const updateFeedTimers = () => {
    const elapsedSeconds = Math.floor((window.performance.now() - feedStartedAt) / 1000);

    for (const feed of feedRows) {
      const timer = wrapper.querySelector<HTMLTimeElement>(
        `[data-feed-timer="${feed.name}"]`,
      );
      if (timer) {
        timer.textContent = formatAgo(feed.lastSeenOffsetSeconds + elapsedSeconds);
      }
    }
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
        eventBus.emit({
          type: "newBlock",
          intensity: 0.85,
          message: "New block found.",
        });
        weatherStore.setStormIndex(18, "Manual Block");
      } else if (action === "gust") {
        weatherStore.triggerGust();
      } else if (action === "stale") {
        weatherStore.triggerStaleFog();
      } else {
        weatherStore.resumeLive();
      }
    });
  });

  const unsubscribe = weatherStore.subscribe(renderWeather);
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
      wrapper.remove();
    },
    isVisible: () => wrapper.classList.contains("debug-panel-shell--visible"),
    setVisible,
    toggle: () => setVisible(!wrapper.classList.contains("debug-panel-shell--visible")),
  };
};
