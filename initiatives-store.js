// Local-only persistence. This is not authentication or a shared chat service.
((root) => {
  const KEY = "planet-sweeper.initiatives.v1";
  const text = (value, max) => String(value || "").trim().slice(0, max);
  function createStore(storage, identity) {
    function load() {
      const raw = storage.getItem(KEY);
      if (!raw) return [];
      const records = JSON.parse(raw);
      if (!Array.isArray(records) || records.some((r) => !r.id || !r.location || !Number.isFinite(r.location.lat) || !Number.isFinite(r.location.lng) || !Array.isArray(r.members) || !Array.isArray(r.messages) || !Array.isArray(r.images))) {
        throw new Error("Saved initiative data could not be read. Your browser storage has not been changed.");
      }
      return records;
    }
    function save(records) {
      try { storage.setItem(KEY, JSON.stringify(records)); }
      catch { throw new Error("Could not save locally. Browser storage may be full or disabled. Try fewer photos."); }
    }
    function mutate(id, change) {
      const records = load();
      const report = records.find((r) => r.id === id);
      if (!report) throw new Error("This initiative is no longer available.");
      change(report);
      save(records);
      return report;
    }
    function name(value) {
      const clean = text(value, 60);
      if (!clean) throw new Error("Please enter your display name.");
      return clean;
    }
    return {
      load,
      create(data) {
        const records = load();
        if (records.length >= 100) throw new Error("This local prototype supports up to 100 initiatives.");
        const title = text(data.title, 100), description = text(data.description, 2000);
        const { lat, lng } = data.location || {};
        if (!title || !description) throw new Error("Please add a title and description.");
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Choose a valid map location.");
        const needed = Number(data.needed);
        if (!Number.isInteger(needed) || needed < 1 || needed > 100) throw new Error("Choose between 1 and 100 volunteers.");
        const images = data.images || [];
        if (images.length > 3 || images.some((image) => typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,") || image.length > 350000)) throw new Error("Choose up to three resized JPEG photos.");
        const report = {
          id: identity.uuid(), createdAt: new Date().toISOString(),
          authorId: identity.id, author: name(data.name), role: text(data.role, 60),
          title, description, needed, images,
          location: { lat, lng, label: text(data.location.label, 250) },
          members: [], messages: [],
        };
        records.push(report);
        save(records);
        return report;
      },
      join(id, displayName) {
        const clean = name(displayName);
        return mutate(id, (report) => {
          if (report.members.some((m) => m.id === identity.id)) return;
          if (report.members.length >= report.needed) throw new Error("All volunteer places are filled.");
          report.members.push({ id: identity.id, name: clean });
        });
      },
      leave(id) { return mutate(id, (report) => { report.members = report.members.filter((m) => m.id !== identity.id); }); },
      message(id, displayName, body) {
        const clean = text(body, 1000);
        if (!clean) throw new Error("Write a message first.");
        const author = name(displayName);
        return mutate(id, (report) => {
          if (report.authorId !== identity.id && !report.members.some((m) => m.id === identity.id)) throw new Error("Sign up before entering the group chat.");
          if (report.messages.length >= 300) throw new Error("This local demo's chat is full (300 messages).");
          report.messages.push({ id: identity.uuid(), authorId: identity.id, author, body: clean, createdAt: new Date().toISOString() });
        });
      },
    };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { createStore, KEY };
  else root.PlanetInitiatives = { createStore, KEY };
})(typeof window !== "undefined" ? window : globalThis);
