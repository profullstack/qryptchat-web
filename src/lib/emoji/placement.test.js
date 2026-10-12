import { describe, it, expect } from 'vitest';
import { placePopover } from './placement.js';

const bounds = { top: 64, left: 8, right: 1272, bottom: 792 }; // below a 64px navbar
const size = { width: 352, height: 380 };
const at = (top, left, h = 44, w = 44) => ({ top, left, bottom: top + h, right: left + w });

describe('placePopover', () => {
  it('opens below when preferred and there is room', () => {
    const p = placePopover({ anchor: at(277, 81), size, bounds, prefer: 'bottom' });
    expect(p).toMatchObject({ side: 'bottom', top: 277 + 44 + 8, left: 81, maxHeight: null });
  });

  it('flips below when above would run under the navbar (the settings bug)', () => {
    const p = placePopover({ anchor: at(277, 81), size, bounds, prefer: 'top' });
    expect(p.side).toBe('bottom');
    expect(p.top).toBeGreaterThanOrEqual(bounds.top);
  });

  it('flips above near the bottom of the window (the composer)', () => {
    const p = placePopover({ anchor: at(700, 300, 60, 600), size, bounds, prefer: 'bottom' });
    expect(p).toMatchObject({ side: 'top', top: 700 - 8 - 380 });
  });

  it('goes to the side when neither above nor below has room', () => {
    const p = placePopover({ anchor: at(300, 100, 300, 200), size, bounds, prefer: 'bottom' });
    expect(p.side).toBe('right');
    expect(p.left).toBe(100 + 200 + 8);
    expect(p.top).toBeGreaterThanOrEqual(bounds.top);
    expect(p.top + size.height).toBeLessThanOrEqual(bounds.bottom);
  });

  it('uses the left side when the anchor hugs the right edge', () => {
    const p = placePopover({ anchor: at(300, 1000, 300, 260), size, bounds, prefer: 'bottom' });
    expect(p.side).toBe('left');
    expect(p.left).toBe(1000 - 8 - 352);
  });

  it('end-aligns and clamps horizontally inside the window', () => {
    const p = placePopover({ anchor: at(100, 1200, 30, 60), size, bounds, prefer: 'bottom', align: 'end' });
    expect(p.left + size.width).toBeLessThanOrEqual(bounds.right);
    const q = placePopover({ anchor: at(100, 0, 30, 60), size, bounds, prefer: 'bottom', align: 'end' });
    expect(q.left).toBe(bounds.left);
  });

  it('shrinks into the taller space when nothing fits whole', () => {
    const short = { top: 0, left: 0, right: 360, bottom: 500 };
    const p = placePopover({ anchor: at(150, 4, 44, 352), size, bounds: short, prefer: 'top' });
    expect(p.side).toBe('bottom');
    expect(p.maxHeight).toBe(500 - 194 - 8);
    expect(p.top).toBe(194 + 8);
  });
});
