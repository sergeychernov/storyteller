import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = resolve(process.cwd(), "packages/web-ui/brand");
const webRoot = resolve(root, "exports/web");
const pngRoot = resolve(root, "exports/png");
const svgRoot = resolve(root, "exports/svg");

await Promise.all([mkdir(webRoot, { recursive: true }), mkdir(pngRoot, { recursive: true })]);

const faviconSource = await readFile(resolve(webRoot, "favicon.svg"));
const neutralSource = await readFile(resolve(root, "master/neutral-icon-safe-area.svg"));

const faviconBuffers = new Map();
for (const size of [16, 32, 48]) {
  const output = await sharp(faviconSource).resize(size, size).png().toBuffer();
  faviconBuffers.set(size, output);
  if (size !== 48) await writeFile(resolve(webRoot, `favicon-${size}x${size}.png`), output);
}

await writeFile(resolve(webRoot, "favicon.ico"), encodeIco(faviconBuffers));

const touchBackground = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="#f3f1eb" />
    <g transform="translate(-29.9 -92.8) scale(2.15)" fill="#22221d">
      <path d="M416 76H184C113 76 76 115 76 177C76 232 111 265 180 282L215 291L236 216L185 207C160 201 149 191 149 174C149 154 165 144 193 144H382L416 76Z" transform="translate(-10 36)" />
      <path d="M258 302L331 319C354 325 365 335 365 351C365 371 350 382 323 382H92L126 450H334C402 450 438 411 438 348C438 291 403 260 338 244L279 226L258 302Z" />
    </g>
  </svg>
`);
await sharp(touchBackground).resize(180, 180).png().toFile(resolve(webRoot, "apple-touch-icon.png"));

for (const size of [192, 512, 1024]) {
  await sharp(neutralSource).resize(size, size).png().toFile(resolve(pngRoot, `make-it-a-story-icon-${size}.png`));
}

await sharp(resolve(svgRoot, "make-it-a-story-mark-dark.svg"))
  .resize(1024, 1024)
  .png()
  .toFile(resolve(pngRoot, "make-it-a-story-mark-1024.png"));

for (const slug of ["make-it-a-story", "make-clip-a-story", "make-travel-a-story"]) {
  await sharp(resolve(svgRoot, `${slug}-lockup.svg`))
    .resize({ width: 1600 })
    .png()
    .toFile(resolve(pngRoot, `${slug}-lockup-1600.png`));
}

function encodeIco(images) {
  const entries = [...images.entries()];
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(([size, image], index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  return Buffer.concat([header, ...entries.map(([, image]) => image)]);
}
