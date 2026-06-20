import "./styles.css";
import { createHashlakeScene, webGLCanRun } from "./scene/createScene";
import { createWeatherStore } from "./state/weatherEngine";
import { createDebugPanel } from "./ui/debugPanel";
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
    const weatherStore = createWeatherStore();

    const scene = createHashlakeScene({
      container: appElement,
      onFirstFrame: hideFallback,
      onRecoverableError: (message) => setFallback(message, true),
      weatherStore,
    });

    const debugPanel = createDebugPanel(appElement, weatherStore);
    const legendPanel = createLegendPanel(appElement);
    createEventToasts(appElement, weatherStore);
    createMobileControls(appElement, {
      toggleDebug: debugPanel.toggle,
      toggleLegend: legendPanel.toggle,
    });
    scene.start();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown renderer error";
    setFallback(`The WebGL scene could not start: ${detail}`, true);
  }
};

boot();
