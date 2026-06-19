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

type DialValue = {
  label: string;
  value: number;
};

const metricTiles: MetricTile[] = [
  { label: "Price", value: "$62,989" },
  { label: "24h", value: "+0.48%", tone: "good" },
  { label: "7d", value: "-1.27%", tone: "bad" },
  { label: "Fastest fee", value: "3 sat/vB" },
  { label: "Mempool", value: "113,080 tx" },
  { label: "Block", value: "#954,434" },
  { label: "Block age", value: "12.2 min" },
  { label: "Difficulty Δ", value: "+4.40%" },
  { label: "Hashrate dip", value: "-2.65%" },
  { label: "WebSocket", value: "live", tone: "good" },
  { label: "Staleness", value: "0%" },
  { label: "Fire / FW", value: "0.00 / 0.00" },
];

const contributionBars: BarValue[] = [
  { label: "price trend", weight: "×0.35", value: 1.6, max: 10 },
  { label: "network", weight: "×0.25", value: 0.3, max: 10 },
  { label: "fees", weight: "×0.2", value: 0.7, max: 10 },
  { label: "congestion", weight: "×0.1", value: 7.1, max: 10 },
  { label: "freshness", weight: "×0.1", value: 0, max: 10 },
];

const weatherDials: DialValue[] = [
  { label: "chop", value: 9 },
  { label: "wind", value: 0 },
  { label: "rain", value: 0 },
  { label: "lightning", value: 0 },
  { label: "sky dark", value: 0 },
  { label: "fog", value: 0 },
  { label: "activity", value: 0 },
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

const getStormLabel = (value: number) => {
  if (value < 20) {
    return "Serene";
  }

  if (value < 40) {
    return "Slightly Uneasy";
  }

  if (value < 60) {
    return "Volatile";
  }

  if (value < 80) {
    return "Storm";
  }

  return "Apocalyptic";
};

const createMetricTiles = () =>
  metricTiles
    .map(
      (tile) => `
        <div class="debug-metric">
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
  weatherDials
    .map(
      (dial) => `
        <div class="debug-dial">
          <span>${dial.label}</span>
          <div class="debug-dial__track">
            <span style="width: ${dial.value}%"></span>
          </div>
          <strong>${dial.value}%</strong>
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
        <strong>Hashlake — Debug</strong>
      </div>
      <div class="debug-panel__actions">
        <span class="debug-fps"><span data-debug-fps>--</span> fps</span>
        <button class="debug-close" type="button" aria-label="Close debug panel">×</button>
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

export const createDebugPanel = (container: HTMLElement): DebugPanel => {
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

  const setStorm = (value: number, mode: string) => {
    const clampedValue = Math.max(0, Math.min(100, value));
    const label = getStormLabel(clampedValue);

    if (stormValueElement) {
      stormValueElement.textContent = clampedValue.toFixed(1);
    }

    if (stormLabelElement) {
      stormLabelElement.textContent = label;
    }

    if (stormSlider) {
      stormSlider.value = clampedValue.toFixed(1);
    }

    if (liveModeElement) {
      liveModeElement.textContent = mode;
    }
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

  const updateFps = (time: number) => {
    fpsFrames += 1;

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
    setStorm(Number(stormSlider.value), "Manual");
  });

  closeButton?.addEventListener("click", () => setVisible(false));

  actionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.debugAction;
      if (action === "crash") {
        setStorm(86, "Manual Crash");
      } else if (action === "rally") {
        setStorm(7, "Manual Rally");
      } else if (action === "whale") {
        setStorm(54, "Manual Whale");
      } else if (action === "block") {
        setStorm(18, "Manual Block");
      } else if (action === "gust") {
        setStorm(63, "Manual Gust");
      } else {
        setStorm(8.9, "Live");
      }
    });
  });

  window.addEventListener("keydown", handleKeydown);
  updateFeedTimers();
  timerId = window.setInterval(updateFeedTimers, 1000);
  fpsFrame = window.requestAnimationFrame(updateFps);

  return {
    element: wrapper,
    destroy: () => {
      window.removeEventListener("keydown", handleKeydown);
      window.clearInterval(timerId);
      window.cancelAnimationFrame(fpsFrame);
      wrapper.remove();
    },
    isVisible: () => wrapper.classList.contains("debug-panel-shell--visible"),
    setVisible,
    toggle: () => setVisible(!wrapper.classList.contains("debug-panel-shell--visible")),
  };
};
