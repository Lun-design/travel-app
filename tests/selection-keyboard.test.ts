import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectionKeyboardProps } from '../lib/selection-keyboard';
afterEach(() => vi.unstubAllGlobals());
function event(key = ' ', tagName = 'DIV', repeat = false) {
  const target = { tagName };
  return { key, target, currentTarget: target, repeat, defaultPrevented: false, preventDefault: vi.fn() };
}
describe('web checkbox/radio space activation', () => {
  it('adds no DOM handlers during native/server rendering', () => {
    vi.stubGlobal('document', undefined); expect(selectionKeyboardProps(vi.fn())).toEqual({});
  });
  it.each([' ', 'Spacebar'])('activates once for %s and prevents page scrolling', key => {
    vi.stubGlobal('document', {}); const activate = vi.fn(), e = event(key);
    selectionKeyboardProps(activate).onKeyDown!(e as unknown as React.KeyboardEvent<HTMLElement>);
    expect(activate).toHaveBeenCalledOnce(); expect(e.preventDefault).toHaveBeenCalledOnce();
  });
  it('leaves Enter and other keys to RNWeb, avoiding duplicate activation', () => {
    vi.stubGlobal('document', {}); const activate = vi.fn();
    for (const key of ['Enter', 'Tab', 'a']) {
      const e = event(key); selectionKeyboardProps(activate).onKeyDown!(e as unknown as React.KeyboardEvent<HTMLElement>);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(activate).not.toHaveBeenCalled();
  });
  it('does not reactivate a held key or a disabled control', () => {
    vi.stubGlobal('document', {}); const activate = vi.fn();
    for (const [repeat, disabled] of [[true, false], [false, true]]) {
      const e = event(' ', 'DIV', repeat); selectionKeyboardProps(activate, disabled).onKeyDown!(e as unknown as React.KeyboardEvent<HTMLElement>);
      expect(e.preventDefault).toHaveBeenCalled();
    }
    expect(activate).not.toHaveBeenCalled();
  });
  it('does not intercept native controls or an event bubbled from a child', () => {
    vi.stubGlobal('document', {}); const activate = vi.fn();
    for (const tag of ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A']) {
      const e = event(' ', tag); selectionKeyboardProps(activate).onKeyDown!(e as unknown as React.KeyboardEvent<HTMLElement>);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    const bubbled = event(); bubbled.target = { tagName: 'SPAN' }; selectionKeyboardProps(activate).onKeyDown!(bubbled as unknown as React.KeyboardEvent<HTMLElement>);
    expect(activate).not.toHaveBeenCalled();
  });
});
