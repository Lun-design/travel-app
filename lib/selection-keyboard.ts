import type { KeyboardEvent } from 'react';

/** RNWeb's PressResponder handles Enter for checkbox/radio divs, but not Space.
 * Do not intercept native buttons or add a second Enter/click activation path.
 * Native/SSR have no document and receive no extra event props.
 */
export function selectionKeyboardProps(activate: () => void, disabled = false): { onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void } {
  if (typeof document === 'undefined') return {};
  return { onKeyDown(event) {
    if ((event.key !== ' ' && event.key !== 'Spacebar') || event.defaultPrevented || event.target !== event.currentTarget) return;
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A'].includes(event.currentTarget.tagName.toUpperCase())) return;
    event.preventDefault();
    if (!disabled && !event.repeat) activate();
  } };
}
