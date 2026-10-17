const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createStore, KEY } = require("../initiatives-store.js");

function fixture() {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  let count = 0;
  const owner = createStore(storage, { id: "owner", uuid: () => `id-${++count}` });
  const volunteer = createStore(storage, { id: "volunteer", uuid: () => `id-${++count}` });
  const outsider = createStore(storage, { id: "outsider", uuid: () => `id-${++count}` });
  const report = () => owner.create({ title: "Creek cleanup", description: "Bottles and litter along the trail", name: "Alex", role: "Resident", needed: 1, images: [], location: { lat: 43.7, lng: -79.4, label: "Toronto" } });
  return { owner, volunteer, outsider, storage, report };
}

test("reports persist across store instances with coordinates and volunteer target", () => {
  const f = fixture(), report = f.report();
  assert.equal(f.volunteer.load()[0].id, report.id);
  assert.equal(report.needed, 1);
  assert.equal(report.location.lat, 43.7);
});
test("sign-up is idempotent and does not overfill the initiative", () => {
  const f = fixture(), { id } = f.report();
  f.volunteer.join(id, "Taylor");
  f.volunteer.join(id, "Taylor");
  assert.equal(f.owner.load()[0].members.length, 1);
  assert.throws(() => f.outsider.join(id, "Sam"), /filled/);
});
test("leaving frees a place for another volunteer", () => {
  const f = fixture(), { id } = f.report();
  f.volunteer.join(id, "Taylor"); f.volunteer.leave(id);
  f.outsider.join(id, "Sam");
  assert.equal(f.owner.load()[0].members[0].name, "Sam");
});
test("only the organizer and signed-up local profiles may post chat messages", () => {
  const f = fixture(), { id } = f.report();
  assert.throws(() => f.outsider.message(id, "Sam", "Hello"), /Sign up/);
  f.owner.message(id, "Alex", "Meet at the trail entrance");
  f.volunteer.join(id, "Taylor"); f.volunteer.message(id, "Taylor", "I'll bring bags");
  assert.equal(f.owner.load()[0].messages.length, 2);
  f.volunteer.leave(id);
  assert.throws(() => f.volunteer.message(id, "Taylor", "Hello"), /Sign up/);
});
test("invalid reports, photo payloads, and empty names are rejected", () => {
  const f = fixture();
  const data = { title: "Test", description: "Litter", name: "Alex", needed: 5, location: { lat: 200, lng: 0 } };
  assert.throws(() => f.owner.create(data), /location/);
  data.location.lat = 43;
  data.needed = 0; assert.throws(() => f.owner.create(data), /1 and 100/);
  data.needed = 5; data.images = ["javascript:alert(1)"];
  assert.throws(() => f.owner.create(data), /JPEG/);
  const { id } = f.report();
  assert.throws(() => f.volunteer.join(id, "  "), /display name/);
  assert.throws(() => f.owner.message(id, "Alex", "  "), /message/);
});
test("quota errors surface without changing stored reports", () => {
  const f = fixture(); f.report();
  f.storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => f.report(), /Could not save/);
  assert.equal(f.owner.load().length, 1);
});
test("malformed persisted data is not overwritten", () => {
  const f = fixture(); f.storage.setItem(KEY, "not json");
  assert.throws(() => f.owner.load());
  assert.equal(f.storage.getItem(KEY), "not json");
});
