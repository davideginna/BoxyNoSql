import { describe, it, expect } from 'vitest';
import { isTypingTarget } from '../utils/dom';

const el = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host.firstElementChild as HTMLElement;
};

describe('isTypingTarget', () => {
  it('is true for the fields a global shortcut must not steal keys from', () => {
    expect(isTypingTarget(el('<input />'))).toBe(true);
    expect(isTypingTarget(el('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(el('<select></select>'))).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    const div = el('<div contenteditable="true"></div>');
    document.body.appendChild(div);
    expect(isTypingTarget(div)).toBe(true);
    div.remove();
  });

  it('is false for ordinary elements and for a missing target', () => {
    expect(isTypingTarget(el('<div></div>'))).toBe(false);
    expect(isTypingTarget(el('<button></button>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('does not throw on a non-element target such as window', () => {
    expect(isTypingTarget(window)).toBe(false);
    expect(isTypingTarget(document)).toBe(false);
  });
});
