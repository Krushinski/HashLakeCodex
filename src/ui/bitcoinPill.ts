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
  let previousFreshKey = "";

  const render = (snapshot: LiveBitcoinSnapshot) => {
    const { metrics } = snapshot;
    const tone = statusTone(snapshot);
    const freshKey = [
      snapshot.feeds.price.lastSuccessAt ?? 0,
      snapshot.feeds.fees.lastSuccessAt ?? 0,
      snapshot.feeds.block.lastSuccessAt ?? 0,
    ].join(":");

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

    if (previousFreshKey && freshKey !== previousFreshKey && tone === "ok") {
      pill.classList.remove("bitcoin-pill--fresh");
      void pill.offsetWidth;
      pill.classList.add("bitcoin-pill--fresh");
    }
    previousFreshKey = freshKey;
  };

  const unsubscribe = liveBitcoinStore.subscribe(render);

  return {
    destroy: () => {
      unsubscribe();
      pill.remove();
    },
  };
};
