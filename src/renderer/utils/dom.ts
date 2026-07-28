/**
 * True when the event target is somewhere the user is typing, so a global
 * shortcut must keep its hands off: swallowing Ctrl+V or Delete there breaks
 * plain text editing.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  // `isContentEditable` covers inheritance from an editable ancestor, but jsdom
  // never implements it — fall back to the attribute so this stays testable.
  if (el.isContentEditable === true) return true;
  return !!el.closest?.('[contenteditable=""], [contenteditable="true"]');
}
