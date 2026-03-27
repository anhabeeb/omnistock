export function blurActiveElement() {
  if (typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

export const SAFE_MUI_MENU_PROPS = {
  autoFocus: false,
  disableAutoFocusItem: true,
} as const;

export const SAFE_MUI_SELECT_PROPS = {
  onClose: blurActiveElement,
  MenuProps: SAFE_MUI_MENU_PROPS,
} as const;
