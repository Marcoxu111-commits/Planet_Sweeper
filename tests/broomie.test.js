const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const physics = require("../broomie-physics.js");
const placement = require("../broomie-placement.js");

test("Broomie's separate limbs respond to pointer motion", () => {
  const state = physics.create();
  for (let i = 0; i < 20; i++) physics.step(state, { vx: 800, vy: 200 }, 1 / 60);
  assert.ok(Math.abs(state.leftArm.angle) > 1);
  assert.ok(Math.abs(state.rightArm.angle) > 1);
  assert.notEqual(state.leftArm.angle, state.rightArm.angle);
  assert.ok(state.leftLeg.angle * state.rightLeg.angle < 0);
});
test("angular springs stay finite and bounded during fast pointer changes", () => {
  const state = physics.create();
  for (let i = 0; i < 1000; i++) {
    physics.step(state, { vx: i % 2 ? 100000 : -100000, vy: 30000 }, i % 5 ? 1 / 60 : 4);
    for (const node of Object.values(state)) {
      assert.ok(Number.isFinite(node.angle) && Number.isFinite(node.velocity));
      assert.ok(Math.abs(node.angle) <= 50);
    }
  }
});
test("limbs settle after movement and reduced motion immediately disables wobble", () => {
  const state = physics.create();
  for (let i = 0; i < 30; i++) physics.step(state, { vx: 1200, vy: 0 }, 1 / 60);
  for (let i = 0; i < 600; i++) physics.step(state, { vx: 0, vy: 0 }, 1 / 60);
  for (const node of Object.values(state)) assert.ok(Math.abs(node.angle) < 0.01);
  physics.step(state, { vx: 1600, vy: 1000 }, 1 / 60, true);
  for (const node of Object.values(state)) assert.deepEqual(node, { angle: 0, velocity: 0 });
});
test("limbs stay floppy while the body remains steady", () => {
  const state = physics.create(); let peak = 0;
  for (let i = 0; i < 45; i++) {
    physics.step(state, { vx: 1000, vy: 200 }, 1 / 60);
    peak = Math.max(peak, Math.abs(state.leftArm.angle), Math.abs(state.rightLeg.angle));
  }
  assert.ok(peak > 30);
  assert.ok(peak <= 50);
  assert.ok(Math.abs(state.body.angle) < 5);
});
test("Broomie stays opposite right- and left-hand region tooltips", () => {
  const p = { x: 640, y: 400 }, viewport = { width: 1280, height: 800 };
  const right = { left: 660, top: 370, right: 960, bottom: 450 };
  const left = { left: 320, top: 370, right: 620, bottom: 450 };
  assert.ok(placement.choose(p, viewport, right).right < p.x);
  assert.ok(placement.choose(p, viewport, left).left > p.x);
});
test("the default position is close and level with the pointer, without side-flipping when a tooltip closes", () => {
  const p = { x: 640, y: 400 }, viewport = { width: 1280, height: 800 };
  const position = placement.choose(p, viewport);
  assert.equal(p.x - position.right, 8);
  assert.equal((position.top + position.bottom) / 2, p.y);
  assert.ok(placement.choose(p, viewport, null, [], false).left > p.x);
});
test("placement avoids the tooltip and stays on-screen near viewport edges", () => {
  const viewport = { width: 1280, height: 800 };
  for (const p of [{ x: 1260, y: 400 }, { x: 20, y: 400 }, { x: 640, y: 15 }, { x: 640, y: 785 }]) {
    const tooltip = p.x > 1000
      ? { left: 1010, right: 1240, top: 360, bottom: 450 }
      : { left: p.x + 15, right: p.x + 240, top: p.y - 30, bottom: p.y + 30 };
    const rect = placement.choose(p, viewport, tooltip);
    assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height);
    const overlap = rect.left < tooltip.right && rect.right > tooltip.left && rect.top < tooltip.bottom && rect.bottom > tooltip.top;
    assert.equal(overlap, false);
  }
});
test("artwork layers are real transparent PNGs aligned to a common scene", () => {
  for (const name of ["broomie", "body", "left-arm", "right-arm", "left-leg", "right-leg"]) {
    const image = fs.readFileSync(path.join(__dirname, `../assets/broomie/${name}.png`));
    assert.equal(image.readUInt32BE(16), 320);
    assert.equal(image.readUInt32BE(20), 268);
    assert.equal(image[25], 6); // RGBA, not a flattened white square
    const chunks = [];
    for (let i = 8; i < image.length;) {
      const length = image.readUInt32BE(i);
      if (image.toString("ascii", i + 4, i + 8) === "IDAT") chunks.push(image.subarray(i + 8, i + 8 + length));
      i += length + 12;
    }
    const rows = zlib.inflateSync(Buffer.concat(chunks));
    assert.equal(rows[4], 0); // top-left pixel alpha is transparent
    assert.ok(rows.some((byte) => byte > 0));
  }
});
