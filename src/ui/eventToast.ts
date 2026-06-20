import type { WeatherStore } from "../state/weatherEngine";

type EventToasts = {
  destroy: () => void;
};

export const createEventToasts = (
  container: HTMLElement,
  weatherStore: WeatherStore,
): EventToasts => {
  const wrapper = document.createElement("div");
  wrapper.className = "event-toasts";
  wrapper.setAttribute("aria-live", "polite");
  wrapper.setAttribute("aria-label", "Hashlake events");
  container.append(wrapper);

  const pushToast = (message: string) => {
    const toast = document.createElement("div");
    toast.className = "event-toast";
    toast.textContent = message;
    wrapper.append(toast);

    window.setTimeout(() => {
      toast.classList.add("event-toast--leaving");
    }, 3600);

    window.setTimeout(() => {
      toast.remove();
    }, 4500);
  };

  const unsubscribe = weatherStore.subscribe((_, event) => {
    if (event) {
      pushToast(event.message);
    }
  });

  return {
    destroy: () => {
      unsubscribe();
      wrapper.remove();
    },
  };
};
