// Tap-versus-drag classification for one pointer, kept free of the DOM so it can be tested.
// On iPads a finger wobbles a few pixels during a tap, so touch gets a larger allowance than a mouse.
// A press only counts as a tap when it stays inside that allowance for its whole life (moving away and
// back is a drag) and is released quickly. A long press does nothing, so a student who hesitates
// never turns a piece by accident. A cancelled press (e.g. a second finger, a system gesture) does nothing.

export const GESTURE = Object.freeze({
  tapSlop: Object.freeze({ mouse: 6, pen: 8, touch: 12 }), // CSS px a tap may wander
  tapMaxMs: 450
});

export function createGesture({ pointerType = 'mouse', x, y, time }, settings = GESTURE) {
  const slop = settings.tapSlop[pointerType] ?? settings.tapSlop.touch;
  let maxDistance = 0, dragging = false, finished = false;
  return {
    get dragging() { return dragging; },
    // Returns true when this move turns (or has turned) the press into a drag.
    move(nx, ny) {
      if (finished) return dragging;
      maxDistance = Math.max(maxDistance, Math.hypot(nx - x, ny - y));
      if (maxDistance > slop) dragging = true;
      return dragging;
    },
    // 'drag' | 'tap' | 'none'
    end(endTime) {
      if (finished) return 'none';
      finished = true;
      if (dragging) return 'drag';
      return endTime - time <= settings.tapMaxMs ? 'tap' : 'none';
    },
    cancel() { finished = true; return 'none'; }
  };
}
