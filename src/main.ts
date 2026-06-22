import "./styles.css";
import { createHashlakeScene, webGLCanRun } from "./scene/createScene";
import { createEventBus } from "./state/eventBus";
import { createLiveBitcoinStore } from "./state/liveBitcoinStore";
import { createWeatherStore } from "./state/weatherEngine";
import { createDebugPanel } from "./ui/debugPanel";
import { createBitcoinPill } from "./ui/bitcoinPill";
import { createEventToasts } from "./ui/eventToast";
import { createLegendPanel } from "./ui/legendPanel";
import { createMobileControls } from "./ui/mobileControls";

const appElement = document.querySelector<HTMLDivElement>("#app");
const fallbackElement = document.querySelector<HTMLDivElement>("#fallback");
const fallbackDetailElement =
  document.querySelector<HTMLSpanElement>("#fallback-detail");

const setFallback = (message: string, isError = false) => {
  if (!fallbackElement || !fallbackDetailElement) {
    return;
  }

  fallbackElement.classList.toggle("fallback-scene--error", isError);
  fallbackElement.classList.remove("fallback-scene--hidden");
  fallbackDetailElement.textContent = message;
};

const hideFallback = () => {
  fallbackElement?.classList.add("fallback-scene--hidden");
};

const boot = () => {
  if (!appElement) {
    setFallback("The app container is missing, so the fallback lake is showing.", true);
    return;
  }

  if (!webGLCanRun()) {
    setFallback(
      "WebGL is unavailable in this browser or GPU session. The fallback lake is still visible.",
      true,
    );
    return;
  }

  try {
    setFallback("Launching the realtime lake renderer...");
    const eventBus = createEventBus();
    const weatherStore = createWeatherStore(eventBus);
    const liveBitcoinStore = createLiveBitcoinStore(eventBus);

    const scene = createHashlakeScene({
      container: appElement,
      onFirstFrame: hideFallback,
      onRecoverableError: (message) => setFallback(message, true),
      weatherStore,
      eventBus,
    });
    liveBitcoinStore.subscribe((snapshot) => {
      const dataMode =
        snapshot.dataMode === "STALE"
          ? "STALE"
          : snapshot.dataMode === "CACHED"
            ? "CACHED"
            : "LIVE";
      weatherStore.setLiveStormIndex(
        snapshot.stormIndex,
        dataMode,
        snapshot.dataMode === "STALE",
      );
    });

    const debugPanel = createDebugPanel(
      appElement,
      weatherStore,
      eventBus,
      liveBitcoinStore,
      scene.getTelemetry,
      scene.setQualityPreset,
    );
    const legendPanel = createLegendPanel(appElement);
    createBitcoinPill(appElement, liveBitcoinStore);
    createEventToasts(appElement, weatherStore, eventBus);
    createMobileControls(appElement, {
      toggleDrive: scene.toggleDriveMode,
      toggleDebug: debugPanel.toggle,
      toggleLegend: legendPanel.toggle,
    });
    liveBitcoinStore.start();
    scene.start();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown renderer error";
    setFallback(`The WebGL scene could not start: ${detail}`, true);
  }
};

boot();
