import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const destination = resolve(root, "apps/web/public/mediapipe");
const wasmDestination = resolve(destination, "wasm");
const version = "0.10.35";
const cdn = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`;

const assets = [
  ["wasm/vision_wasm_internal.js", `${cdn}/vision_wasm_internal.js`],
  ["wasm/vision_wasm_internal.wasm", `${cdn}/vision_wasm_internal.wasm`],
  ["wasm/vision_wasm_nosimd_internal.js", `${cdn}/vision_wasm_nosimd_internal.js`],
  ["wasm/vision_wasm_nosimd_internal.wasm", `${cdn}/vision_wasm_nosimd_internal.wasm`],
  [
    "face_landmarker.task",
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
  ]
] as const;

await mkdir(wasmDestination, { recursive: true });

for (const [relative, url] of assets) {
  const target = resolve(destination, relative);
  process.stdout.write(`fetching ${relative} … `);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`${relative}: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(target, bytes);
  console.log(`${(bytes.byteLength / 1024).toFixed(0)} KiB`);
}

console.log(`\nLocal camera-lab assets ready in ${destination}`);
console.log("The camera lab prefers these files and falls back to the public CDN.");
