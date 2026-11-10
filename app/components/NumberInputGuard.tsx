'use client';

import { useEffect } from 'react';

/**
 * Stops the mouse wheel from changing <input type="number"> values.
 *
 * Browsers treat a wheel tick over a FOCUSED number input as a step up/down.
 * On a long form that is a trap: you click an amount, scroll the page to read
 * the next field, and the amount you just typed has silently changed — a stock
 * count, a price or a delivery fee quietly wrong with nothing on screen saying
 * so.
 *
 * Blurring on wheel is deliberate rather than calling preventDefault(): the
 * browser only steps the value while the field has focus, so dropping focus
 * stops the change AND lets the page keep scrolling normally underneath. A
 * preventDefault() here would freeze the scroll whenever the pointer happened
 * to be over a number field.
 *
 * Typing, the arrow keys and the spinner arrows are untouched — only the wheel.
 */
export default function NumberInputGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement &&
        el.type === 'number' &&
        (el === e.target || el.contains(e.target as Node))
      ) {
        el.blur();
      }
    };
    // Capture phase, so the field has lost focus before the default action
    // for this same tick is applied.
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return null;
}
