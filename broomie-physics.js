// Small damped angular springs for the original artwork's cut-out limbs.
// Degrees and px/second; bounded substeps keep fast mouse movement stable.
((root) => {
  const joints = ["body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function create() { return Object.fromEntries(joints.map((joint) => [joint, { angle: 0, velocity: 0 }])); }
  function step(state, motion, seconds, reduced = false) {
    if (reduced) {
      joints.forEach((joint) => { state[joint].angle = state[joint].velocity = 0; });
      return state;
    }
    const vx = clamp(Number.isFinite(motion.vx) ? motion.vx : 0, -1200, 1200);
    const vy = clamp(Number.isFinite(motion.vy) ? motion.vy : 0, -1200, 1200);
    const targets = {
      body: clamp(-vx * 0.003, -4, 4),
      leftArm: clamp(vx * 0.038 + vy * 0.016, -36, 36),
      rightArm: clamp(vx * 0.033 - vy * 0.018, -34, 34),
      leftLeg: clamp(vx * 0.042 - vy * 0.014, -40, 40),
      rightLeg: clamp(-vx * 0.038 - vy * 0.014, -38, 38),
    };
    let remaining = clamp(Number.isFinite(seconds) ? seconds : 0, 0, 0.05);
    while (remaining > 1e-8) {
      const dt = Math.min(1 / 120, remaining);
      for (const joint of joints) {
        // The heavier bag lags behind; the broom/legs kick and overshoot more.
        const node = state[joint];
        const stiffness = joint === "body" ? 38 : joint === "leftArm" ? 30 : joint === "rightArm" ? 40 : 55;
        const damping = joint === "body" ? 12 : joint === "leftArm" ? 5 : 5.6;
        node.velocity = clamp(node.velocity + ((targets[joint] - node.angle) * stiffness - node.velocity * damping) * dt, -220, 220);
        node.angle = clamp(node.angle + node.velocity * dt, -50, 50);
      }
      remaining -= dt;
    }
    return state;
  }
  const api = { create, step };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BroomiePhysics = api;
})(typeof window !== "undefined" ? window : globalThis);
