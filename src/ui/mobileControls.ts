type MobileControls = {
  destroy: () => void;
};

export const createMobileControls = (
  container: HTMLElement,
  actions: {
    toggleDrive: () => void;
    toggleDebug: () => void;
    toggleLegend: () => void;
    setDriveCommand: (
      command: "forward" | "left" | "right" | "anchor",
      active: boolean,
    ) => void;
    isDriveMode: () => boolean;
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

  const drivePad = document.createElement("div");
  drivePad.className = "mobile-drive-pad";
  drivePad.setAttribute("aria-label", "Mobile drive controls");
  drivePad.innerHTML = `
    <button class="mobile-drive-pad__button mobile-drive-pad__button--forward" type="button" data-mobile-drive="forward">Forward</button>
    <button class="mobile-drive-pad__button mobile-drive-pad__button--left" type="button" data-mobile-drive="left">Left</button>
    <button class="mobile-drive-pad__button mobile-drive-pad__button--right" type="button" data-mobile-drive="right">Right</button>
    <button class="mobile-drive-pad__button mobile-drive-pad__button--anchor" type="button" data-mobile-drive="anchor">Anchor</button>
  `;
  container.append(drivePad);

  const syncDrivePad = () => {
    drivePad.classList.toggle("mobile-drive-pad--visible", actions.isDriveMode());
  };

  const handleClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-mobile-control]",
    );
    if (!button) {
      return;
    }

    if (button.dataset.mobileControl === "drive") {
      actions.toggleDrive();
      syncDrivePad();
    } else if (button.dataset.mobileControl === "debug") {
      actions.toggleDebug();
    } else {
      actions.toggleLegend();
    }
  };

  const handleDrivePointer = (event: PointerEvent, active: boolean) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-mobile-drive]",
    );
    if (!button) {
      return;
    }

    event.preventDefault();
    const command = button.dataset.mobileDrive;
    if (
      command === "forward" ||
      command === "left" ||
      command === "right" ||
      command === "anchor"
    ) {
      actions.setDriveCommand(command, active);
    }

    if (active) {
      button.setPointerCapture(event.pointerId);
    } else if (button.hasPointerCapture(event.pointerId)) {
      button.releasePointerCapture(event.pointerId);
    }
  };

  const handleDrivePointerDown = (event: PointerEvent) => handleDrivePointer(event, true);
  const handleDrivePointerUp = (event: PointerEvent) => handleDrivePointer(event, false);

  controls.addEventListener("click", handleClick);
  drivePad.addEventListener("pointerdown", handleDrivePointerDown);
  drivePad.addEventListener("pointerup", handleDrivePointerUp);
  drivePad.addEventListener("pointercancel", handleDrivePointerUp);
  drivePad.addEventListener("pointerleave", handleDrivePointerUp);
  const syncTimer = window.setInterval(syncDrivePad, 250);
  syncDrivePad();

  return {
    destroy: () => {
      window.clearInterval(syncTimer);
      controls.removeEventListener("click", handleClick);
      drivePad.removeEventListener("pointerdown", handleDrivePointerDown);
      drivePad.removeEventListener("pointerup", handleDrivePointerUp);
      drivePad.removeEventListener("pointercancel", handleDrivePointerUp);
      drivePad.removeEventListener("pointerleave", handleDrivePointerUp);
      controls.remove();
      drivePad.remove();
    },
  };
};
