// Separate national waste-management evidence from local reporting intensity.
((root) => {
  function management(record) {
    const m = record?.management;
    if (!m) return null;
    const finite = (v) => typeof v === "number" && Number.isFinite(v);
    const safe = ["sanitary", "controlled", "compost", "recycled", "incinerated", "digestion"].reduce((sum, key) => sum + (finite(m[key]) ? m[key] : 0), 0);
    const derivedCollection = !finite(m.uncollected) && finite(m.collection);
    let uncollected = finite(m.uncollected) ? m.uncollected : derivedCollection ? Math.max(0, 1 - m.collection) : null;
    const openDump = finite(m.openDump) ? m.openDump : null;
    // Complete documented managed pathways permit a near-zero management
    // indicator. Missing data alone never does. Partial data is a lower bound.
    const completeManaged = safe >= 0.98;
    if (uncollected === null && openDump === null && !completeManaged) return null;
    // Inverse collection coverage can refer to another reporting year or overlap
    // disposal categories. Do not add it to reported dumping and double-count.
    let share = derivedCollection && openDump !== null ? Math.max(uncollected || 0, openDump) : (uncollected || 0) + (openDump || 0);
    if (share < 1e-6) share = 0;
    share = Math.min(1, Math.max(0, share));
    if (!completeManaged && share === 0 && (uncollected === null || openDump === null)) return null;
    return {
      share, t: Math.log1p(share * 100) / Math.log(101),
      lowerBound: !completeManaged && (derivedCollection || uncollected === null || openDump === null),
      completeManaged, uncollected, openDump,
    };
  }
  function reportingLevel(metric) {
    const t = Math.max(0, Math.min(1, (Math.log10(Math.max(10, metric)) - 1) / 1.6));
    return t < 0.25 ? "Low" : t < 0.5 ? "Moderate" : t < 0.8 ? "High" : "Very High";
  }
  const api = { management, reportingLevel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlanetWaste = api;
})(typeof window !== "undefined" ? window : globalThis);
