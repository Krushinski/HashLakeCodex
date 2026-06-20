import type { HashlakeEventBus } from "./eventBus";

export type StormStageName =
  | "Serene"
  | "Slightly Uneasy"
  | "Volatile"
  | "Storm"
  | "Apocalyptic";

export type WeatherDials = {
  chop: number;
  wind: number;
  rain: number;
  lightning: number;
  skyDark: number;
  fog: number;
  fireWeather: number;
  boatInstability: number;
  cameraShake: number;
  ambientActivity: number;
};

export type WeatherSnapshot = {
  stormIndex: number;
  stage: StormStageName;
  mode: string;
  dataMode: "LIVE" | "MANUAL" | "CACHED" | "STALE";
  staleData: boolean;
  easternTimeDarkness: number;
  stormDarkness: number;
  dials: WeatherDials;
};

export type WeatherEventName =
  | "crash"
  | "rally"
  | "gust"
  | "stale"
  | "storm-front"
  | "network-calm";

export type WeatherEvent = {
  name: WeatherEventName;
  message: string;
};

type WeatherListener = (snapshot: WeatherSnapshot, event?: WeatherEvent) => void;

export type WeatherStore = {
  getSnapshot: () => WeatherSnapshot;
  setStormIndex: (value: number, mode: string) => void;
  setLiveStormIndex: (
    value: number,
    dataMode: "LIVE" | "CACHED" | "STALE",
    staleData: boolean,
  ) => void;
  triggerCrash: () => void;
  triggerRally: () => void;
  triggerGust: () => void;
  triggerStaleFog: () => void;
  resumeLive: () => void;
  subscribe: (listener: WeatherListener) => () => void;
};

const DEFAULT_STORM_INDEX = 8.9;
const GUST_DURATION_MS = 8000;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const clampStormIndex = (value: number) => Math.max(0, Math.min(100, value));

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

export const getStormStage = (stormIndex: number): StormStageName => {
  if (stormIndex < 20) {
    return "Serene";
  }

  if (stormIndex < 40) {
    return "Slightly Uneasy";
  }

  if (stormIndex < 60) {
    return "Volatile";
  }

  if (stormIndex < 80) {
    return "Storm";
  }

  return "Apocalyptic";
};

export const getEasternTimeDarkness = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    minute: "numeric",
    timeZone: "America/New_York",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const time = hour + minute / 60;

  if (time < 5 || time >= 21) {
    return 0.78;
  }

  if (time < 7) {
    return 0.78 - smoothstep(5, 7, time) * 0.55;
  }

  if (time < 17) {
    return 0.18;
  }

  if (time < 20) {
    return 0.18 + smoothstep(17, 20, time) * 0.45;
  }

  return 0.63 + smoothstep(20, 21, time) * 0.15;
};

export const getStormDarkness = (stormIndex: number) => {
  if (stormIndex < 30) {
    return 0;
  }

  if (stormIndex < 45) {
    return smoothstep(30, 45, stormIndex) * 0.28;
  }

  if (stormIndex < 60) {
    return 0.28 + smoothstep(45, 60, stormIndex) * 0.32;
  }

  if (stormIndex < 80) {
    return 0.6 + smoothstep(60, 80, stormIndex) * 0.22;
  }

  return 0.82 + smoothstep(80, 100, stormIndex) * 0.18;
};

export const calculateWeatherSnapshot = (
  stormIndexInput: number,
  options: {
    staleData?: boolean;
    gustFactor?: number;
    mode?: string;
    dataMode?: "LIVE" | "MANUAL" | "CACHED" | "STALE";
    now?: Date;
  } = {},
): WeatherSnapshot => {
  const stormIndex = clampStormIndex(stormIndexInput);
  const normalized = stormIndex / 100;
  const gust = clamp01(options.gustFactor ?? 0);
  const easternTimeDarkness = getEasternTimeDarkness(options.now);
  const stormDarkness = getStormDarkness(stormIndex);
  const finalSkyDarkness = Math.max(easternTimeDarkness, stormDarkness);
  const staleFog = options.staleData ? 0.78 : 0;

  const dials: WeatherDials = {
    chop: clamp01(smoothstep(8, 70, stormIndex) * 0.92 + gust * 0.35),
    wind: clamp01(smoothstep(18, 76, stormIndex) * 0.88 + gust * 0.46),
    rain: clamp01(smoothstep(48, 78, stormIndex) * 0.9),
    lightning: clamp01(smoothstep(58, 92, stormIndex)),
    skyDark: finalSkyDarkness,
    fog: clamp01(Math.max(staleFog, smoothstep(38, 82, stormIndex) * 0.35)),
    fireWeather: clamp01(smoothstep(78, 100, stormIndex)),
    boatInstability: clamp01(smoothstep(16, 88, stormIndex) * 0.9 + gust * 0.32),
    cameraShake: clamp01(smoothstep(42, 100, stormIndex) * 0.82 + gust * 0.38),
    ambientActivity: clamp01(0.12 + normalized * 0.72 + gust * 0.3),
  };

  return {
    stormIndex,
    stage: getStormStage(stormIndex),
    mode: options.mode ?? "Live",
    dataMode: options.dataMode ?? "LIVE",
    staleData: Boolean(options.staleData),
    easternTimeDarkness,
    stormDarkness,
    dials,
  };
};

export const createWeatherStore = (eventBus?: HashlakeEventBus): WeatherStore => {
  let stormIndex = DEFAULT_STORM_INDEX;
  let mode = "Live";
  let dataMode: "LIVE" | "MANUAL" | "CACHED" | "STALE" = "LIVE";
  let staleData = false;
  let gustUntil = 0;
  let manualOverride = false;
  let lastLiveIndex = DEFAULT_STORM_INDEX;
  let lastLiveMode = "Live";
  let lastLiveDataMode: "LIVE" | "CACHED" | "STALE" = "LIVE";
  let lastLiveStaleData = false;
  const listeners = new Set<WeatherListener>();

  const getGustFactor = () => {
    const remaining = gustUntil - window.performance.now();
    if (remaining <= 0) {
      return 0;
    }

    return clamp01(remaining / GUST_DURATION_MS);
  };

  const getSnapshot = () =>
    calculateWeatherSnapshot(stormIndex, {
      gustFactor: getGustFactor(),
      mode,
      dataMode,
      staleData,
    });

  const emit = (event?: WeatherEvent) => {
    const snapshot = getSnapshot();
    listeners.forEach((listener) => listener(snapshot, event));
  };

  const setStormIndex = (value: number, nextMode: string) => {
    const previousStage = getStormStage(stormIndex);
    stormIndex = clampStormIndex(value);
    mode = nextMode;
    dataMode = "MANUAL";
    manualOverride = true;
    staleData = false;
    const nextStage = getStormStage(stormIndex);
    const event =
      previousStage !== nextStage && stormIndex >= 40
        ? { name: "storm-front" as const, message: "Storm front forming" }
        : undefined;
    emit(event);
  };

  return {
    getSnapshot,
    setStormIndex,
    setLiveStormIndex: (value, nextDataMode, nextStaleData) => {
      lastLiveIndex = clampStormIndex(value);
      lastLiveDataMode = nextDataMode;
      lastLiveMode = nextDataMode === "LIVE" ? "Live" : nextDataMode;
      lastLiveStaleData = nextStaleData;

      if (manualOverride) {
        return;
      }

      const previousStage = getStormStage(stormIndex);
      stormIndex = lastLiveIndex;
      mode = lastLiveMode;
      dataMode = lastLiveDataMode;
      staleData = lastLiveStaleData;
      const nextStage = getStormStage(stormIndex);
      emit(
        previousStage !== nextStage && stormIndex >= 40
          ? { name: "storm-front", message: "Storm front forming" }
          : undefined,
      );
    },
    triggerCrash: () => {
      staleData = false;
      setStormIndex(86, "Manual Crash");
      eventBus?.emit({ type: "crash" });
      emit({ name: "crash", message: "Crash event" });
    },
    triggerRally: () => {
      staleData = false;
      setStormIndex(7, "Manual Rally");
      eventBus?.emit({ type: "rally", intensity: 0.72 });
      emit({ name: "rally", message: "Rally event" });
      emit({ name: "network-calm", message: "Network calm" });
    },
    triggerGust: () => {
      gustUntil = window.performance.now() + GUST_DURATION_MS;
      mode = "Manual Gust";
      dataMode = "MANUAL";
      manualOverride = true;
      stormIndex = Math.max(stormIndex, 63);
      eventBus?.emit({ type: "gust" });
      emit({ name: "gust", message: "Gust event" });
    },
    triggerStaleFog: () => {
      staleData = true;
      mode = "Manual Stale";
      dataMode = "MANUAL";
      manualOverride = true;
      stormIndex = Math.min(stormIndex, 32);
      eventBus?.emit({ type: "stale" });
      emit({ name: "stale", message: "Stale feed - fog rolling in" });
    },
    resumeLive: () => {
      manualOverride = false;
      staleData = false;
      gustUntil = 0;
      stormIndex = lastLiveIndex;
      staleData = lastLiveStaleData;
      mode = lastLiveMode;
      dataMode = lastLiveDataMode;
      emit({ name: "network-calm", message: "Network calm" });
    },
    subscribe: (listener: WeatherListener) => {
      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
  };
};
