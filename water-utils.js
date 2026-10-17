// Geometry helpers shared by water rendering and tests. No external dependency.
((root) => {
  function polygons(geometry) {
    return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  }
  function bounds(geometry) {
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    polygons(geometry).forEach((polygon) => polygon.forEach((ring) => ring.forEach(([lng, lat]) => {
      box[0] = Math.min(box[0], lng); box[1] = Math.min(box[1], lat);
      box[2] = Math.max(box[2], lng); box[3] = Math.max(box[3], lat);
    })));
    return box;
  }
  function areaKm2(geometry) {
    const rad = Math.PI / 180;
    function ringArea(ring) {
      let sum = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        sum += (b[0] - a[0]) * rad * (2 + Math.sin(a[1] * rad) + Math.sin(b[1] * rad));
      }
      return Math.abs(sum * 6371.0088 ** 2 / 2);
    }
    return polygons(geometry).reduce((sum, polygon) => sum + ringArea(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0), 0);
  }
  function regionName(seed, index) {
    const [lng, lat] = seed;
    let coast = "North American coast";
    if (lat > 64) coast = "Arctic coast";
    else if (lat > 50 && lng > -96 && lng < -75) coast = "Hudson Bay coast";
    else if (lng < -128 && lat > 50) coast = "Northern Pacific coast";
    else if (lng < -115) coast = "Pacific coast";
    else if (lat < 32 && lng > -98 && lng < -80) coast = "Gulf of Mexico coast";
    else if (lat < 25 && lng > -90) coast = "Caribbean coast";
    else if (lng > -85) coast = "Atlantic coast";
    return `${coast} — Region ${index + 1}`;
  }
  const api = { polygons, bounds, areaKm2, regionName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlanetWater = api;
})(typeof window !== "undefined" ? window : globalThis);
