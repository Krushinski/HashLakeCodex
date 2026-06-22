import type { HashlakeEvent, HashlakeEventBus } from "../state/eventBus";
import type { WeatherStore } from "../state/weatherEngine";

type EventToasts = {
  destroy: () => void;
};

export const createEventToasts = (
  container: HTMLElement,
  weatherStore: WeatherStore,
  eventBus: HashlakeEventBus,
): EventToasts => {
  const wrapper = document.createElement("div");
  wrapper.className = "event-toasts";
  wrapper.setAttribute("aria-live", "polite");
  wrapper.setAttribute("aria-label", "Hashlake events");
  container.append(wrapper);
  const activeToasts: HTMLDivElement[] = [];

  const pushToast = (
    message: string,
    tone: "signal" | "buy" | "sell" | "neutral" | "stale" = "neutral",
  ) => {
    while (activeToasts.length >= 4) {
      activeToasts.shift()?.remove();
    }

    const toast = document.createElement("div");
    toast.className = `event-toast event-toast--${tone}`;
    toast.innerHTML = `
      <span class="event-toast__dot"></span>
      <span>${message}</span>
    `;
    wrapper.append(toast);
    activeToasts.push(toast);

    window.setTimeout(() => {
      toast.classList.add("event-toast--leaving");
    }, 3600);

    window.setTimeout(() => {
      toast.remove();
      const index = activeToasts.indexOf(toast);
      if (index >= 0) {
        activeToasts.splice(index, 1);
      }
    }, 4500);
  };

  const formatBtc = (amount: number | undefined) =>
    `${(amount ?? 0).toLocaleString("en-US", {
      maximumFractionDigits: (amount ?? 0) >= 100 ? 0 : 1,
    })} BTC`;

  const pushEventToast = (event: HashlakeEvent) => {
    if (event.type === "newBlock") {
      pushToast(`New block found - #${event.blockHeight ?? "pending"}`, "signal");
      return;
    }

    if (event.type === "largeTrade" || event.type === "whale") {
      const amount = formatBtc(event.btcAmount);
      if (event.side === "buy") {
        pushToast(`Large buy - ${amount}`, "buy");
      } else if (event.side === "sell") {
        pushToast(
          (event.btcAmount ?? 0) >= 300 ? `Whale sell - ${amount}` : `Large sell - ${amount}`,
          "sell",
        );
      } else {
        pushToast(`Whale splash - ${amount}`, "signal");
      }
      return;
    }

    if (event.type === "stale") {
      if (event.message) {
        pushToast("Stale data - fog rolling in", "stale");
      }
      return;
    }

    if (event.message) {
      pushToast(event.message, "neutral");
    }
  };

  const unsubscribe = weatherStore.subscribe((_, event) => {
    if (event) {
      const tone = event.name === "stale" ? "stale" : event.name === "network-calm" ? "signal" : "neutral";
      const message = event.name === "network-calm" ? "Live signal restored" : event.message;
      pushToast(message, tone);
    }
  });
  const unsubscribeEvents = eventBus.subscribe((event) => {
    pushEventToast(event);
  });

  return {
    destroy: () => {
      unsubscribe();
      unsubscribeEvents();
      wrapper.remove();
    },
  };
};
