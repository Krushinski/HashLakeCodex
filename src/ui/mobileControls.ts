type MobileControls = {
  destroy: () => void;
};

export const createMobileControls = (
  container: HTMLElement,
  actions: {
    toggleDrive: () => void;
    toggleDebug: () => void;
    toggleLegend: () => void;
  },
): MobileControls => {
  const controls = document.createElement("div");
  controls.className = "mobile-mode-controls";
  controls.innerHTML = `
    <button type="button" data-mobile-control="drive">Drive</button>
    <button type="button" data-mobile-control="debug">Debug</button>
    <button type="button" data-mobile-control="legend">Legend</button>
  `;
  container.append(controls);

  const handleClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-mobile-control]",
    );
    if (!button) {
      return;
    }

    if (button.dataset.mobileControl === "drive") {
      actions.toggleDrive();
    } else if (button.dataset.mobileControl === "debug") {
      actions.toggleDebug();
    } else {
      actions.toggleLegend();
    }
  };

  controls.addEventListener("click", handleClick);

  return {
    destroy: () => {
      controls.removeEventListener("click", handleClick);
      controls.remove();
    },
  };
};
