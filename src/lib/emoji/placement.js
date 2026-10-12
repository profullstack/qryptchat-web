/**
 * Where to put a popover (the emoji picker) next to its anchor so it stays on
 * screen: try the preferred side, then the opposite one, then right and left.
 * Coordinates are viewport pixels, ready for position: fixed.
 *
 * anchor and bounds are { top, right, bottom, left }; size is { width, height }.
 * align 'start' lines the popover up with the anchor's left (or top) edge,
 * 'end' with its right (or bottom) edge; either way it is then nudged back
 * inside bounds. When no side has room for the full height, it goes on the
 * taller of above/below and maxHeight says how much it may use.
 */
const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

export function placePopover({ anchor, size, bounds, prefer = 'bottom', align = 'start', gap = 8 }) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  const room = {
    top: anchor.top - gap - bounds.top,
    bottom: bounds.bottom - anchor.bottom - gap,
    left: anchor.left - gap - bounds.left,
    right: bounds.right - anchor.right - gap,
  };
  const fits = (side) =>
    side === 'top' || side === 'bottom'
      ? room[side] >= size.height && bounds.right - bounds.left >= size.width
      : room[side] >= size.width && bounds.bottom - bounds.top >= size.height;

  const horizontal = (width) =>
    clamp(align === 'end' ? anchor.right - width : anchor.left, bounds.left, bounds.right - width);
  const vertical = (height) =>
    clamp(align === 'end' ? anchor.bottom - height : anchor.top, bounds.top, bounds.bottom - height);

  const order = [prefer, OPPOSITE[prefer], 'right', 'left'].filter((s, i, a) => a.indexOf(s) === i);
  const side = order.find(fits);

  if (side === 'top') return { side, top: anchor.top - gap - size.height, left: horizontal(size.width), maxHeight: null };
  if (side === 'bottom') return { side, top: anchor.bottom + gap, left: horizontal(size.width), maxHeight: null };
  if (side === 'right') return { side, top: vertical(size.height), left: anchor.right + gap, maxHeight: null };
  if (side === 'left') return { side, top: vertical(size.height), left: anchor.left - gap - size.width, maxHeight: null };

  // Nothing fits whole (a short window): use the taller of above and below.
  const up = room.top > room.bottom;
  const maxHeight = Math.max(0, up ? room.top : room.bottom);
  const height = Math.min(size.height, maxHeight);
  return {
    side: up ? 'top' : 'bottom',
    top: up ? anchor.top - gap - height : anchor.bottom + gap,
    left: horizontal(size.width),
    maxHeight,
  };
}
