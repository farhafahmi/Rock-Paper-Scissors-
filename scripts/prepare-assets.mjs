import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import https from 'node:https';

const root = resolve(import.meta.dirname, '..');
const wasmOut = resolve(root, 'public/wasm');
const modelOut = resolve(root, 'public/models/gesture_recognizer.task');
mkdirSync(wasmOut, { recursive: true });
mkdirSync(dirname(modelOut), { recursive: true });

const require = createRequire(import.meta.url);
const entryPoint = require.resolve('@mediapipe/tasks-vision');
let packageRoot = dirname(entryPoint);
while (packageRoot !== dirname(packageRoot) && !existsSync(join(packageRoot, 'wasm'))) {
  packageRoot = dirname(packageRoot);
}
const wasmSource = resolve(packageRoot, 'wasm');
if (!existsSync(wasmSource)) {
  throw new Error(`Could not locate the MediaPipe WASM directory from ${entryPoint}.`);
}
const required = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
];

for (const file of required) {
  const source = resolve(wasmSource, file);
  if (!existsSync(source)) throw new Error(`MediaPipe asset missing from package: ${source}`);
  copyFileSync(source, resolve(wasmOut, file));
}

if (!existsSync(modelOut)) {
  const url = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
  await new Promise((resolvePromise, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'vision-rps-build' } }, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Could not download MediaPipe gesture model (HTTP ${response.statusCode}).`));
        response.resume();
        return;
      }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        writeFileSync(modelOut, Buffer.concat(chunks));
        resolvePromise();
      });
    });
    request.setTimeout(120000, () => request.destroy(new Error('Timed out downloading MediaPipe gesture model.')));
    request.on('error', reject);
  });
}

const modelSize = readFileSync(modelOut).byteLength;
console.log(`MediaPipe browser assets ready. Model: ${(modelSize / 1024 / 1024).toFixed(1)} MB`);
