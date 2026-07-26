import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const WORKER_ROOT = '.vercel/output/static/_worker.js';
const MAX_COMPRESSED_BYTES = Math.floor(2.8 * 1024 * 1024);
const EXCLUDED_FILES = new Set(['nop-build-log.json']);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );

  return files.flat();
}

const workerFiles = (await listFiles(WORKER_ROOT)).filter(
  (path) => !EXCLUDED_FILES.has(path.split('/').at(-1)),
);
const compressedBytes = (
  await Promise.all(workerFiles.map(async (path) => gzipSync(await readFile(path)).byteLength))
).reduce((total, size) => total + size, 0);
const compressedMiB = compressedBytes / 1024 / 1024;
const budgetMiB = MAX_COMPRESSED_BYTES / 1024 / 1024;

if (compressedBytes > MAX_COMPRESSED_BYTES) {
  console.error(
    `ERR: Cloudflare Worker gzip estimate ${compressedMiB.toFixed(3)} MiB exceeds ${budgetMiB.toFixed(1)} MiB budget.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `OK: Cloudflare Worker gzip estimate ${compressedMiB.toFixed(3)} MiB is within ${budgetMiB.toFixed(1)} MiB budget.`,
  );
}
