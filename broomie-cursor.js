// Artwork-based map cursor. The pointer hotspot stays exact; only Broomie's
// limbs wobble. Hidden over controls, on touch, when unfocused, and on cancel.
(() => {
  function create(mapElement) {
    const root = document.createElement("div");
    root.id = "broomie-cursor"; root.hidden = true; root.setAttribute("aria-hidden", "true");
    const rig = document.createElement("div"); rig.className = "broomie-rig";
    const parts = {};
    const files = { body: "body", leftArm: "left-arm", rightArm: "right-arm", leftLeg: "left-leg", rightLeg: "right-leg" };
    // Limbs behind the globe conceal the tiny overlap at their original joints.
    for (const joint of ["leftLeg", "rightLeg", "leftArm", "rightArm", "body"]) {
      const image = document.createElement("img");
      image.src = `assets/broomie/${files[joint]}.png`; image.alt = ""; image.draggable = false;
      image.className = `broomie-part broomie-${joint}`;
      parts[joint] = image; rig.append(image);
    }
    root.append(rig); document.body.append(root);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(any-pointer: fine)");
    let active = false, ready = false, frame = 0, previousFrame = 0, lastMove = 0, pointer = null;
    let motion = { vx: 0, vy: 0 }, physics = BroomiePhysics.create();
    let placementSample = null, placementReadAt = -Infinity, lastOffsetX = null, lastOffsetY = null;
    let preferredLeft = true;
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

    function placeOppositeTooltip() {
      if (!pointer || root.hidden) return;
      const now = performance.now();
      // Avoid forced style/layout reads for every limb-animation frame. Sticky
      // tooltips move with the pointer, so reuse their relative rectangle briefly.
      if (now - placementReadAt >= 80 || !placementSample) {
        const tips = [...mapElement.querySelectorAll(".leaflet-tooltip")].map((element) => {
          const style = getComputedStyle(element), r = element.getBoundingClientRect();
          return style.visibility !== "hidden" && Number(style.opacity) !== 0 && r.width > 0 && r.height > 0
            ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
        }).filter(Boolean);
        tips.sort((a, b) => Math.hypot((a.left + a.right) / 2 - pointer.x, (a.top + a.bottom) / 2 - pointer.y) - Math.hypot((b.left + b.right) / 2 - pointer.x, (b.top + b.bottom) / 2 - pointer.y));
        placementSample = { x: pointer.x, y: pointer.y, tooltip: tips[0] || null };
        if (tips[0]) preferredLeft = (tips[0].left + tips[0].right) / 2 >= pointer.x;
        placementReadAt = now;
      }
      const dx = pointer.x - placementSample.x, dy = pointer.y - placementSample.y;
      const cached = placementSample.tooltip;
      const tooltip = cached ? { left: cached.left + dx, right: cached.right + dx, top: cached.top + dy, bottom: cached.bottom + dy } : null;
      const position = BroomiePlacement.choose(pointer, { width: innerWidth, height: innerHeight }, tooltip, [], preferredLeft);
      if (position.offsetX !== lastOffsetX) root.style.setProperty("--broomie-left", `${position.offsetX}px`);
      if (position.offsetY !== lastOffsetY) root.style.setProperty("--broomie-top", `${position.offsetY}px`);
      lastOffsetX = position.offsetX; lastOffsetY = position.offsetY;
    }

    function hide() {
      root.hidden = true;
      mapElement.classList.remove("broomie-picking");
      cancelAnimationFrame(frame); frame = 0; previousFrame = 0;
      placementSample = null; placementReadAt = -Infinity;
    }
    function draw() {
      rig.style.transform = `rotate(${physics.body.angle.toFixed(2)}deg)`;
      for (const joint of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) parts[joint].style.transform = `rotate(${physics[joint].angle.toFixed(2)}deg)`;
    }
    function animate(now) {
      frame = 0;
      if (!active || root.hidden || document.hidden) return;
      const dt = previousFrame ? Math.min(0.05, (now - previousFrame) / 1000) : 1 / 60;
      previousFrame = now;
      if (now - lastMove > 70) {
        const decay = Math.exp(-dt * 7);
        motion.vx *= decay; motion.vy *= decay;
      }
      BroomiePhysics.step(physics, motion, dt, reduced.matches);
      draw();
      const unsettled = Math.abs(motion.vx) + Math.abs(motion.vy) > 0.3 || Object.values(physics).some((node) => Math.abs(node.angle) + Math.abs(node.velocity) > 0.03);
      if (unsettled) frame = requestAnimationFrame(animate);
      else previousFrame = 0;
    }
    function show(event) {
      if (!active || !ready || !finePointer.matches || event.pointerType === "touch" || document.hidden) { hide(); return; }
      if (event.target.closest?.(".leaflet-control")) { hide(); return; }
      const now = performance.now();
      const dt = pointer ? Math.max(0.008, Math.min(0.1, (now - lastMove) / 1000)) : 1 / 60;
      const blend = 1 - Math.exp(-dt / 0.065);
      motion.vx = pointer ? motion.vx + (clamp((event.clientX - pointer.x) / dt, -1200, 1200) - motion.vx) * blend : 0;
      motion.vy = pointer ? motion.vy + (clamp((event.clientY - pointer.y) / dt, -1200, 1200) - motion.vy) * blend : 0;
      pointer = { x: event.clientX, y: event.clientY }; lastMove = now;
      // The reticle is the exact click point. Only the sprite moves to avoid
      // the region tooltip; selection coordinates never change.
      root.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      root.hidden = false; mapElement.classList.add("broomie-picking");
      placeOppositeTooltip();
      if (reduced.matches) { BroomiePhysics.step(physics, motion, 0, true); draw(); }
      else if (!frame) frame = requestAnimationFrame(animate);
    }
    const onLeave = () => { pointer = null; motion = { vx: 0, vy: 0 }; hide(); };
    mapElement.addEventListener("pointermove", show);
    // Leaflet updates sticky tooltips during mousemove after pointermove. Check
    // again after its handlers, including in reduced-motion mode with no loop.
    mapElement.addEventListener("mousemove", placeOppositeTooltip);
    mapElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", () => { if (document.hidden) onLeave(); });
    reduced.addEventListener("change", () => {
      if (reduced.matches) { cancelAnimationFrame(frame); frame = 0; BroomiePhysics.step(physics, motion, 0, true); draw(); }
    });
    Promise.all(Object.values(parts).map((image) => image.decode())).then(() => { ready = true; }).catch(() => {
      // Native crosshair remains usable if an asset cannot be decoded.
      ready = false; hide();
    });
    return {
      setActive(value) {
        active = !!value;
        if (!active) {
          pointer = null; motion = { vx: 0, vy: 0 }; physics = BroomiePhysics.create(); hide(); draw();
        }
      },
    };
  }
  window.BroomieCursor = { create };
})();
