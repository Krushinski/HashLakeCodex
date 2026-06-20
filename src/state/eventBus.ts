export type HashlakeEventType =
  | "whale"
  | "newBlock"
  | "gust"
  | "crash"
  | "rally"
  | "stale";

export type HashlakeEvent = {
  type: HashlakeEventType;
  message?: string;
  btcAmount?: number;
  intensity?: number;
  createdAt: number;
};

type HashlakeEventInput = Omit<HashlakeEvent, "createdAt">;
type HashlakeEventListener = (event: HashlakeEvent) => void;

export type HashlakeEventBus = {
  emit: (event: HashlakeEventInput) => void;
  subscribe: (listener: HashlakeEventListener) => () => void;
};

export const createEventBus = (): HashlakeEventBus => {
  const listeners = new Set<HashlakeEventListener>();

  return {
    emit: (event) => {
      const nextEvent = {
        ...event,
        createdAt: window.performance.now(),
      };
      listeners.forEach((listener) => listener(nextEvent));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
