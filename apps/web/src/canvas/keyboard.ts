export function canvasKeyboardBlocked(target: EventTarget | null): boolean {
  return Boolean(
    (target instanceof Element &&
      target.closest('dialog, [role="dialog"], [role="alertdialog"], [role="menu"]')) ||
      document.querySelector("dialog[open]"),
  );
}
