const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const physics = require("../broomie-physics.js");
const placement = require("../broomie-placement.js");

function element() {
  const classes = new Set();
  return {
    hidden: false, children: [], events: {},
    style: { setProperty(key, value) { this[key] = value; } },
    classList: { add: (key) => classes.add(key), remove: (key) => classes.delete(key), contains: (key) => classes.has(key) },
    append(...children) { this.children.push(...children); },
    setAttribute() {}, decode: () => Promise.resolve(), closest: () => null,
    addEventListener(type, fn) { this.events[type] = fn; },
    getBoundingClientRect: () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
  };
}

test("the real cursor controller follows, animates, avoids tooltips, and restores native input", async () => {
  const body = element(), map = element(), window = element();
  const reduced = { matches: false, addEventListener(type, fn) { this.change = fn; } };
  const fine = { matches: true };
  const document = { hidden: false, body, events: {}, createElement: element, getElementById: () => null, addEventListener(type, fn) { this.events[type] = fn; } };
  const tip = element();
  tip.getBoundingClientRect = () => ({ left: 660, right: 960, top: 370, bottom: 450, width: 300, height: 80 });
  map.querySelectorAll = () => [tip];
  let now = 0, nextFrame = 0, styleReads = 0; const frames = new Map();
  const context = {
    window, document, BroomiePhysics: physics, BroomiePlacement: placement,
    matchMedia: (query) => query.includes("reduced-motion") ? reduced : fine,
    getComputedStyle: () => { styleReads++; return { opacity: "1", visibility: "visible" }; },
    innerWidth: 1280, innerHeight: 800, performance: { now: () => now },
    requestAnimationFrame: (fn) => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../broomie-cursor.js"), "utf8"), context);
  const cursor = window.BroomieCursor.create(map);
  await new Promise(setImmediate); // complete the mocked sprite decode promises
  const root = body.children[0], rig = root.children[0];
  const move = (x, y, pointerType = "mouse", target = map) => map.events.pointermove({ clientX: x, clientY: y, pointerType, target });
  cursor.setActive(true); move(640, 400);
  assert.equal(root.hidden, false);
  assert.equal(map.classList.contains("broomie-picking"), true);
  assert.equal(root.style.transform, "translate3d(640px, 400px, 0)");
  assert.ok(parseFloat(root.style["--broomie-left"]) < 0);
  now = 16; move(700, 410);
  const beforeFrameReads = styleReads;
  const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn(now));
  assert.equal(styleReads, beforeFrameReads, "limb animation should not force layout reads");
  assert.notEqual(rig.children.find((node) => node.className.includes("leftArm")).style.transform, "rotate(0.00deg)");
  const control = { closest: () => ({}) }; move(720, 410, "mouse", control);
  assert.equal(root.hidden, true); assert.equal(frames.size, 0);
  assert.equal(map.classList.contains("broomie-picking"), false);
  reduced.matches = true; reduced.change(); move(640, 400);
  assert.equal(root.hidden, false); assert.equal(frames.size, 0);
  assert.equal(rig.style.transform, "rotate(0.00deg)");
  move(640, 400, "touch"); assert.equal(root.hidden, true);
  reduced.matches = false; move(640, 400); document.hidden = true; document.events.visibilitychange();
  assert.equal(root.hidden, true); assert.equal(frames.size, 0);
  document.hidden = false; move(640, 400); cursor.setActive(false);
  assert.equal(root.hidden, true); assert.equal(map.classList.contains("broomie-picking"), false);
  assert.equal(frames.size, 0);
});
