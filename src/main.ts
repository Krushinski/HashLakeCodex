import "./styles.css";
import { createHashlakeScene, webGLCanRun } from "./scene/createScene";

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

    const scene = createHashlakeScene({
      container: appElement,
      onFirstFrame: hideFallback,
      onRecoverableError: (message) => setFallback(message, true),
    });

    scene.start();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown renderer error";
    setFallback(`The WebGL scene could not start: ${detail}`, true);
  }
};

boot();
