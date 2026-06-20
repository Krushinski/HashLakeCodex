import type { FeedStatus, LiveBitcoinSnapshot, LiveBitcoinStore } from "../state/liveBitcoinStore";

type BitcoinPill = {
  destroy: () => void;
};

const formatCurrency = (value: number | null) => {
  if (value === null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  }).format(value);
};

const statusTone = (snapshot: LiveBitcoinSnapshot): FeedStatus => {
  const statuses = [
    snapshot.feeds.price.status,
    snapshot.feeds.fees.status,
    snapshot.feeds.block.status,
  ];

  if (statuses.some((status) => status === "error" || status === "offline")) {
    return "error";
  }

  if (snapshot.dataMode === "STALE" || statuses.some((status) => status === "stale")) {
    return "stale";
  }

  return "ok";
};

export const createBitcoinPill = (
  container: HTMLElement,
  liveBitcoinStore: LiveBitcoinStore,
): BitcoinPill => {
  const pill = document.createElement("div");
  pill.className = "bitcoin-pill";
  pill.setAttribute("aria-live", "polite");
  pill.innerHTML = `
    <span class="bitcoin-pill__dot" data-bitcoin-pill-dot></span>
    <span data-bitcoin-pill-price>BTC --</span>
    <span class="bitcoin-pill__sep">•</span>
    <span data-bitcoin-pill-fee>-- sat/vB</span>
    <span class="bitcoin-pill__sep">•</span>
    <span data-bitcoin-pill-block>Block --</span>
    <span class="bitcoin-pill__sep">•</span>
    <strong data-bitcoin-pill-status>OFFLINE</strong>
  `;
  container.append(pill);

  const priceElement = pill.querySelector<HTMLElement>("[data-bitcoin-pill-price]");
  const feeElement = pill.querySelector<HTMLElement>("[data-bitcoin-pill-fee]");
  const blockElement = pill.querySelector<HTMLElement>("[data-bitcoin-pill-block]");
  const statusElement = pill.querySelector<HTMLElement>("[data-bitcoin-pill-status]");
  const dotElement = pill.querySelector<HTMLElement>("[data-bitcoin-pill-dot]");
  let previousPriceKey = "";
  let previousFeeKey = "";
  let previousBlockKey = "";
  let previousHeartbeatKey = "";
  let lastHeartbeatPulseAt = 0;

  const pulse = (element: HTMLElement | null, className: string) => {
    if (!element) {
      return;
    }

    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  };

  const render = (snapshot: LiveBitcoinSnapshot) => {
    const { metrics } = snapshot;
    const tone = statusTone(snapshot);
    const priceKey = String(snapshot.feeds.price.lastSuccessAt ?? 0);
    const feeKey = String(snapshot.feeds.fees.lastSuccessAt ?? 0);
    const blockKey = String(snapshot.feeds.block.lastSuccessAt ?? 0);
    const heartbeatKey = String(snapshot.marketWebSocket.lastHeartbeatAt ?? 0);
    const heartbeatFresh =
      snapshot.marketWebSocket.status === "ok" &&
      snapshot.marketWebSocket.lastHeartbeatAt !== null &&
      Date.now() - snapshot.marketWebSocket.lastHeartbeatAt < 9000;

    if (priceElement) {
      priceElement.textContent = `BTC ${formatCurrency(metrics.priceUsd)}`;
    }

    if (feeElement) {
      feeElement.textContent =
        metrics.fastestFee === null ? "-- sat/vB" : `${metrics.fastestFee} sat/vB`;
    }

    if (blockElement) {
      blockElement.textContent =
        metrics.blockHeight === null ? "Block --" : `Block ${metrics.blockHeight}`;
    }

    if (statusElement) {
      statusElement.textContent =
        tone === "ok" ? "LIVE" : tone === "stale" ? "CACHED" : "OFFLINE";
    }

    if (dotElement) {
      dotElement.className = `bitcoin-pill__dot bitcoin-pill__dot--${tone}`;
    }

    pill.classList.toggle("bitcoin-pill--stale", tone === "stale");
    pill.classList.toggle("bitcoin-pill--bad", tone === "error");
    pill.classList.toggle("bitcoin-pill--live", tone === "ok" && heartbeatFresh);
    pill.title =
      snapshot.marketWebSocket.lastHeartbeatAt === null
        ? "Market heartbeat waiting"
        : `Market heartbeat ${
            Math.max(0, Math.floor((Date.now() - snapshot.marketWebSocket.lastHeartbeatAt) / 1000))
          }s ago`;

    if (previousPriceKey && priceKey !== previousPriceKey && tone === "ok") {
      pulse(pill, "bitcoin-pill--fresh");
      pulse(priceElement, "bitcoin-pill__value--price-fresh");
    }

    if (previousFeeKey && feeKey !== previousFeeKey && tone === "ok") {
      pulse(feeElement, "bitcoin-pill__value--fresh");
    }

    if (previousBlockKey && blockKey !== previousBlockKey && tone === "ok") {
      pulse(blockElement, "bitcoin-pill__value--block-fresh");
    }

    if (
      previousHeartbeatKey &&
      heartbeatKey !== previousHeartbeatKey &&
      tone === "ok" &&
      Date.now() - lastHeartbeatPulseAt > 4500
    ) {
      lastHeartbeatPulseAt = Date.now();
      pulse(pill, "bitcoin-pill--heartbeat");
    }

    previousPriceKey = priceKey;
    previousFeeKey = feeKey;
    previousBlockKey = blockKey;
    previousHeartbeatKey = heartbeatKey;
  };

  const unsubscribe = liveBitcoinStore.subscribe(render);

  return {
    destroy: () => {
      unsubscribe();
      pill.remove();
    },
  };
};
