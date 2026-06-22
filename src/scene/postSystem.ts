import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";

export type PostSystem = {
  element: HTMLDivElement;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  update: (weather: WeatherSnapshot, elapsed: number) => void;
  resize: () => void;
  dispose: () => void;
};

export const createPostSystem = (
  container: HTMLElement,
  renderer: THREE.WebGLRenderer,
): PostSystem => {
  const overlay = document.createElement("div");
  overlay.className = "hashlake-grade-overlay";
  container.append(overlay);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  let enabled = true;

  return {
    element: overlay,
    get enabled() {
      return enabled;
    },
    setEnabled: (nextEnabled) => {
      enabled = nextEnabled;
      overlay.classList.toggle("hashlake-grade-overlay--disabled", !enabled);
    },
    update: (weather, elapsed) => {
      const palette = getWeatherPalette(weather.stormIndex);
      const dark = weather.dials.skyDark;
      const calm = Math.max(0, 1 - weather.stormIndex / 24);
      const flash =
        weather.dials.lightning > 0.08 && Math.sin(elapsed * 8.5) > 0.88
          ? weather.dials.lightning
          : 0;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(1.12 + calm * 0.1, 0.66, dark);
      overlay.style.setProperty("--grade-vignette", String(enabled ? 0.16 + palette.vignette * 0.56 : 0));
      overlay.style.setProperty("--grade-desat", String(weather.staleData ? 0.26 : 0));
      overlay.style.setProperty("--grade-flash", String(enabled ? flash * 0.22 : 0));
      overlay.style.setProperty("--grade-warmth", String(enabled ? palette.gradeWarmth * (1 - dark * 0.55) : 0));
    },
    resize: () => undefined,
    dispose: () => overlay.remove(),
  };
};
