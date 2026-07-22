import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REDACTED_VALUE = "[REDACTED]";
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
]);

interface MutableRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeHeaders(value: unknown): void {
  if (!Array.isArray(value)) return;

  for (const header of value) {
    if (
      isRecord(header) &&
      typeof header.name === "string" &&
      SENSITIVE_HEADER_NAMES.has(header.name.toLowerCase())
    ) {
      header.value = REDACTED_VALUE;
    }
  }
}

function sanitizeCookies(value: unknown): void {
  if (!Array.isArray(value)) return;

  for (const cookie of value) {
    if (isRecord(cookie) && "value" in cookie) {
      cookie.value = REDACTED_VALUE;
    }
  }
}

function sanitizeNetworkRecord(value: unknown): void {
  if (!isRecord(value) || !isRecord(value.snapshot)) return;

  const { request, response } = value.snapshot;
  if (isRecord(request)) {
    sanitizeHeaders(request.headers);
    sanitizeCookies(request.cookies);
  }
  if (isRecord(response)) {
    sanitizeHeaders(response.headers);
    sanitizeCookies(response.cookies);
  }
}

export function sanitizeTraceNetwork(source: string): string {
  const hasFinalNewline = source.endsWith("\n");
  const lines = source.split(/\r?\n/);
  if (hasFinalNewline) lines.pop();

  const sanitizedLines = lines.map((line, index) => {
    if (line.trim() === "") return line;

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error: unknown) {
      throw new Error(`Invalid trace network JSON at line ${index + 1}`, {
        cause: error,
      });
    }
    sanitizeNetworkRecord(record);
    return JSON.stringify(record);
  });

  return sanitizedLines.join("\n") + (hasFinalNewline ? "\n" : "");
}

async function collectFiles(
  directory: string,
  predicate: (name: string) => boolean,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, predicate)));
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

async function sanitizeTraceArchive(archivePath: string): Promise<void> {
  const absoluteArchivePath = resolve(archivePath);
  const workDirectory = await mkdtemp(
    join(dirname(absoluteArchivePath), ".trace-sanitize-"),
  );
  const extractionDirectory = join(workDirectory, "contents");
  const replacementArchivePath = join(workDirectory, "trace.zip");

  try {
    await mkdir(extractionDirectory);
    await execFileAsync("unzip", [
      "-q",
      absoluteArchivePath,
      "-d",
      extractionDirectory,
    ]);
    const networkFiles = await collectFiles(extractionDirectory, (name) =>
      name.endsWith(".network"),
    );
    if (networkFiles.length === 0) {
      throw new Error(`Trace archive has no network data: ${archivePath}`);
    }
    for (const networkFile of networkFiles) {
      const source = await readFile(networkFile, "utf8");
      await writeFile(networkFile, sanitizeTraceNetwork(source), "utf8");
    }
    await execFileAsync("zip", ["-q", "-r", replacementArchivePath, "."], {
      cwd: extractionDirectory,
    });
    await copyFile(replacementArchivePath, absoluteArchivePath);
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}

export async function sanitizePlaywrightTraces(root: string): Promise<number> {
  const archives = await collectFiles(resolve(root), (name) => name === "trace.zip");
  for (const archive of archives) await sanitizeTraceArchive(archive);
  return archives.length;
}

async function main(): Promise<void> {
  const root = process.argv[2] ?? "test-results";
  const count = await sanitizePlaywrightTraces(root);
  console.info(`OK: Sanitized ${count} Playwright trace archive(s)`);
}

const invokedPath = process.argv[1];
if (invokedPath && pathToFileURL(resolve(invokedPath)).href === import.meta.url) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`ERR: Failed to sanitize Playwright traces: ${message}`);
    process.exitCode = 1;
  });
}
