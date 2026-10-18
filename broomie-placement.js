// Keep Broomie opposite a nearby Leaflet tooltip, with room for swinging limbs.
// Pure placement logic can be tested independently of the browser and artwork.
((root) => {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function intersection(a, b) {
    return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  }
  function choose(pointer, viewport, tooltip = null, obstacles = [], preferredLeft = true) {
    const width = 112, height = 94, gap = 8, margin = 16;
    const oppositeLeft = tooltip ? (tooltip.left + tooltip.right) / 2 >= pointer.x : preferredLeft;
    const side = oppositeLeft ? -1 : 1;
    const candidates = [
      // A stable, close side position is preferred over diagonal hopping.
      [pointer.x - width - gap, pointer.y - height / 2],
      [pointer.x + gap, pointer.y - height / 2],
      [pointer.x - width - gap, pointer.y + gap],
      [pointer.x + gap, pointer.y + gap],
      [pointer.x - width - gap, pointer.y - height - gap],
      [pointer.x + gap, pointer.y - height - gap],
      [pointer.x - width / 2, pointer.y - height - gap],
      [pointer.x - width / 2, pointer.y + gap],
    ];
    if (tooltip) {
      const x = oppositeLeft ? pointer.x - width - gap : pointer.x + gap;
      candidates.push([x, tooltip.top - height - gap], [x, tooltip.bottom + gap]);
    }
    let best = null;
    for (const [desiredX, desiredY] of candidates) {
      const x = clamp(desiredX, margin, Math.max(margin, viewport.width - width - margin));
      const y = clamp(desiredY, margin, Math.max(margin, viewport.height - height - margin));
      const rect = { left: x, top: y, right: x + width, bottom: y + height };
      const swingRect = { left: x - 8, top: y - 8, right: x + width + 8, bottom: y + height + 8 };
      const wrongSide = side < 0 ? Math.max(0, rect.right - pointer.x) : Math.max(0, pointer.x - rect.left);
      let score = wrongSide * 3 + Math.abs(x - desiredX) + Math.abs(y - desiredY);
      // Avoid switching between up/down positions due to tiny tooltip changes.
      score += Math.abs((y + height / 2) - pointer.y) * 0.15;
      if (tooltip) score += intersection(swingRect, tooltip) * 100;
      obstacles.forEach((obstacle) => { score += intersection(swingRect, obstacle) * 4; });
      if (!best || score < best.score) best = { ...rect, score, offsetX: x - pointer.x, offsetY: y - pointer.y };
    }
    return best;
  }
  const api = { choose };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BroomiePlacement = api;
})(typeof window !== "undefined" ? window : globalThis);
