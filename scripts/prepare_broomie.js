// Prepare the user's own Broomie artwork: remove the connected white background,
// then separate the existing limbs for spring animation. No redrawing or upload.
// PNG RGBA8 codec uses only Node built-ins. Run: node scripts/prepare_broomie.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const directory = path.join(__dirname, "../assets/broomie");
const input = fs.readFileSync(path.join(directory, "original.png"));
const width = input.readUInt32BE(16), height = input.readUInt32BE(20);
if (input[24] !== 8 || input[25] !== 6 || input[28] !== 0) throw new Error("Expected non-interlaced RGBA8 PNG");
const chunks = [];
for (let offset = 8; offset < input.length;) {
  const length = input.readUInt32BE(offset);
  if (input.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(input.subarray(offset + 8, offset + 8 + length));
  offset += length + 12;
}
const raw = zlib.inflateSync(Buffer.concat(chunks));
const pixels = Buffer.alloc(width * height * 4), stride = width * 4;
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  for (let x = 0; x < stride; x++) {
    const i = y * stride + x, a = x >= 4 ? pixels[i - 4] : 0, b = y ? pixels[i - stride] : 0, c = y && x >= 4 ? pixels[i - stride - 4] : 0;
    const value = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : NaN;
    if (!Number.isFinite(value)) throw new Error("Unsupported PNG row filter");
    pixels[i] = (raw[y * (stride + 1) + 1 + x] + value) & 255;
  }
}

// Flood-fill only background-connected near-white pixels. Enclosed eye shines
// stay white; soft edge colours are unmatted rather than leaving a white halo.
const background = new Uint8Array(width * height), queue = new Int32Array(width * height);
let head = 0, tail = 0;
function enqueue(index) {
  if (index < 0 || index >= background.length || background[index]) return;
  const i = index * 4;
  if (pixels[i + 3] > 0 && Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 220) return;
  background[index] = 1; queue[tail++] = index;
}
for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
while (head < tail) {
  const i = queue[head++], x = i % width;
  if (x > 0) enqueue(i - 1);
  if (x < width - 1) enqueue(i + 1);
  enqueue(i - width); enqueue(i + width);
}
background.forEach((isBackground, index) => {
  if (!isBackground) return;
  const i = index * 4, min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
  const alpha = min >= 250 ? 0 : Math.min(1, (255 - min) / 35);
  for (let c = 0; c < 3; c++) pixels[i + c] = alpha ? Math.max(0, Math.min(255, Math.round((pixels[i + c] - (1 - alpha) * 255) / alpha))) : 0;
  pixels[i + 3] = Math.round(pixels[i + 3] * alpha);
});

const masks = {
  "left-arm": [[226, 505], [241, 552], [215, 589], [289, 690], [290, 901], [25, 901], [25, 605], [131, 567], [172, 541]],
  "right-arm": [[792, 432], [812, 427], [831, 396], [825, 300], [835, 52], [1125, 52], [1125, 420], [970, 424], [902, 525], [858, 629], [800, 629]],
  "left-leg": [[442, 706], [487, 706], [487, 813], [442, 813]],
  "right-leg": [[520, 706], [565, 706], [565, 813], [520, 813]],
};
function inside(x, y, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
const parts = Object.fromEntries(["body", ...Object.keys(masks)].map((name) => [name, Buffer.alloc(pixels.length)]));
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4;
  if (!pixels[i + 3]) continue;
  const limb = Object.keys(masks).find((name) => inside(x, y, masks[name]));
  pixels.copy(parts[limb || "body"], i, i, i + 4);
}

const table = Array.from({ length: 256 }, (_, i) => {
  let crc = i; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type), output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length); name.copy(output, 4); data.copy(output, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  output.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return output;
}
function writePNG(filename, rgba, w, h) {
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  fs.writeFileSync(path.join(directory, filename), Buffer.concat([input.subarray(0, 8), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
}
// Premultiplied bilinear resizing avoids black fringes on translucent edges.
function resize(source, w, h) {
  const output = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = (x + 0.5) * width / w - 0.5, sy = (y + 0.5) * height / h - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let alpha = 0; const colour = [0, 0, 0];
    for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const i = (Math.min(height - 1, Math.max(0, y0 + dy)) * width + Math.min(width - 1, Math.max(0, x0 + dx))) * 4;
      const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy), a = source[i + 3] / 255;
      alpha += weight * a;
      for (let c = 0; c < 3; c++) colour[c] += source[i + c] * weight * a;
    }
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) output[i + c] = alpha ? Math.round(colour[c] / alpha) : 0;
    output[i + 3] = Math.round(alpha * 255);
  }
  return output;
}
const outWidth = 320, outHeight = Math.round(height * outWidth / width);
for (const [name, rgba] of Object.entries(parts)) writePNG(`${name}.png`, resize(rgba, outWidth, outHeight), outWidth, outHeight);
writePNG("broomie.png", resize(pixels, outWidth, outHeight), outWidth, outHeight);
console.log(`Prepared Broomie's body and 4 original limb layers at ${outWidth}×${outHeight}`);
