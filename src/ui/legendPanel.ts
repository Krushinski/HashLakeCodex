type LegendPanel = {
  destroy: () => void;
  isVisible: () => boolean;
  setVisible: (visible: boolean) => void;
  toggle: () => void;
};

const stormStages = [
  ["0-20", "Serene", "Calm water, bright sky, gentle movement."],
  ["20-40", "Slightly Uneasy", "Slight chop, more clouds, muted light."],
  ["40-60", "Volatile", "Darker sky, visible waves, stronger wind."],
  ["60-80", "Storm", "Rain, rough water, lightning, strong boat motion."],
  ["80-100", "Apocalyptic", "Black/red sky, violent water, fire rain, heavy camera tension."],
];

const triggers = [
  "price trend",
  "network health",
  "fees",
  "mempool congestion",
  "data freshness",
];

const visualEffects = [
  "water chop",
  "wind",
  "rain",
  "lightning",
  "sky darkness",
  "fog",
  "market whale ripples",
  "fire weather",
  "boat instability",
  "camera shake",
];

const driveControls = [
  ["D", "Debug"],
  ["L", "Legend"],
  ["X", "Toggle Drive Mode"],
  ["F", "Fullscreen"],
  ["R", "Reset camera"],
  ["C", "Cycle fixed chase preset"],
  ["Arrow keys", "Drive boat"],
  ["Touch/drag", "Hold upward to throttle, angle left/right to steer"],
  ["Shift", "Boost"],
  ["Space", "Anchor/stabilize"],
  ["Enter", "Save tableau"],
  ["Esc", "Exit/cancel"],
];

const bitcoinSignals = [
  "Price trend shapes weather pressure.",
  "Fees and mempool add network stress.",
  "Whales create local ripples only.",
  "New blocks create a teal signal pulse.",
];

const debugManual = [
  "Crash and Gust affect weather.",
  "Whale buttons test local splash scale.",
  "Resume Live returns to feed-driven state.",
  "300 BTC should not darken the sky.",
];

const dataFog = [
  "Fog means stale or uncertain data.",
  "Fog is separate from apocalypse.",
  "No-key public feeds only.",
  "Drive camera remains hard locked.",
];

const renderLegend = () => `
  <section class="legend-panel" aria-label="Hashlake legend">
    <header class="legend-panel__header">
      <div>
        <strong>Hashlake Legend</strong>
        <span>Bitcoin weather map</span>
      </div>
      <button class="legend-close" type="button" aria-label="Close legend">x</button>
    </header>

    <div class="legend-section legend-tile">
      <h2>stormIndex stages</h2>
      <div class="legend-stage-grid">
        ${stormStages
          .map(
            ([range, name, description]) => `
              <article class="legend-stage">
                <span>${range}</span>
                <strong>${name}</strong>
                <p>${description}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    </div>

    <div class="legend-tile-grid">
      <div class="legend-section legend-tile">
        <h2>Bitcoin Signals</h2>
        <ul>
          ${bitcoinSignals.map((signal) => `<li>${signal}</li>`).join("")}
        </ul>
      </div>

      <div class="legend-section legend-tile">
        <h2>Weather Inputs</h2>
        <ul>
          ${triggers.map((trigger) => `<li>${trigger}</li>`).join("")}
        </ul>
      </div>

      <div class="legend-section legend-tile">
        <h2>Visual Effects</h2>
        <ul>
          ${visualEffects.map((effect) => `<li>${effect}</li>`).join("")}
        </ul>
      </div>

      <div class="legend-section legend-tile">
        <h2>Debug / Manual</h2>
        <ul>
          ${debugManual.map((note) => `<li>${note}</li>`).join("")}
        </ul>
      </div>

      <div class="legend-section legend-tile">
        <h2>Data / Fog Meaning</h2>
        <ul>
          ${dataFog.map((note) => `<li>${note}</li>`).join("")}
        </ul>
      </div>
    </div>

    <div class="legend-section legend-tile">
      <h2>controls</h2>
      <div class="legend-controls">
        ${driveControls
          .map(
            ([key, description]) => `
              <div class="legend-control">
                <kbd>${key}</kbd>
                <span>${description}</span>
              </div>
            `,
          )
          .join("")}
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

export const createLegendPanel = (container: HTMLElement): LegendPanel => {
  const wrapper = document.createElement("div");
  wrapper.className = "legend-panel-shell";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.innerHTML = renderLegend();
  container.append(wrapper);

  const setVisible = (visible: boolean) => {
    wrapper.classList.toggle("legend-panel-shell--visible", visible);
    wrapper.setAttribute("aria-hidden", String(!visible));
  };

  const handleKeydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (key === "l" && !isEditableTarget(event.target)) {
      event.preventDefault();
      setVisible(!wrapper.classList.contains("legend-panel-shell--visible"));
    }

    if (key === "escape") {
      setVisible(false);
    }
  };

  wrapper.querySelector<HTMLButtonElement>(".legend-close")?.addEventListener("click", () => {
    setVisible(false);
  });
  window.addEventListener("keydown", handleKeydown);

  return {
    destroy: () => {
      window.removeEventListener("keydown", handleKeydown);
      wrapper.remove();
    },
    isVisible: () => wrapper.classList.contains("legend-panel-shell--visible"),
    setVisible,
    toggle: () => setVisible(!wrapper.classList.contains("legend-panel-shell--visible")),
  };
};
