import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Maximum simultaneous Tectonic compilations allowed on the server. */
const MAX_CONCURRENT_COMPILATIONS = 2;
/** Compilation timeout in milliseconds (2 minutes). */
const COMPILE_TIMEOUT_MS = 120_000;
/** Maximum size of in-memory compiled PDF cache. */
const MAX_CACHE_ENTRIES = 50;

/** LRU Cache for compiled PDFs by content hash. */
const compilationCache = new Map<string, { pdf: Buffer; timestamp: number }>();

function getFromCache(hash: string): Buffer | null {
  const entry = compilationCache.get(hash);
  if (!entry) return null;
  entry.timestamp = Date.now();
  return entry.pdf;
}

function addToCache(hash: string, pdf: Buffer) {
  if (compilationCache.size >= MAX_CACHE_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, value] of compilationCache.entries()) {
      if (value.timestamp < oldestTime) {
        oldestTime = value.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) compilationCache.delete(oldestKey);
  }
  compilationCache.set(hash, { pdf, timestamp: Date.now() });
}

/** Simple semaphore queue to limit concurrent compilations. */
class Semaphore {
  private current = 0;
  private queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const next = this.queue.shift();
      next?.();
    }
  }
}

const compileSemaphore = new Semaphore(MAX_CONCURRENT_COMPILATIONS);

/** Sanitized environment for running Tectonic. Never leaks database URLs or secrets. */
export function sanitizedLatexEnv(): NodeJS.ProcessEnv {
  const allowed = [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TECTONIC_CACHE_DIR",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ];
  const env: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
  };
  for (const key of allowed) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Parses LaTeX/Tectonic compiler error messages and line diagnostics.
 */
export function parseDiagnostics(stderr: string): string[] {
  const lines = stderr.split("\n");
  const diagnostics: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Tectonic / TeX error patterns
    if (line.startsWith("! ") || line.startsWith("error:") || /^l\.\d+\s+/.test(line)) {
      diagnostics.push(line);
      // Capture context line if present right below
      if (i + 1 < lines.length && lines[i + 1].trim().length > 0 && !lines[i + 1].startsWith("! ")) {
        diagnostics.push(lines[i + 1].trim());
        i++;
      }
    }
  }

  return diagnostics.length > 0 ? diagnostics : [stderr.trim() || "Compilation failed with unknown error."];
}

export type CompileResult =
  | { ok: true; pdf: Buffer; cached?: boolean }
  | { ok: false; error: string; diagnostics: string[]; unavailable?: boolean };

/**
 * Checks if the Tectonic compiler is available on the PATH.
 */
export async function isTectonicAvailable(): Promise<boolean> {
  try {
    await execFileAsync("tectonic", ["--version"], { timeout: 5000, env: sanitizedLatexEnv() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compiles LaTeX source text into a PDF Buffer using Tectonic.
 */
export async function compileLatex(source: string, { signal }: { signal?: AbortSignal } = {}): Promise<CompileResult> {
  const contentHash = createHash("sha256").update(source).digest("hex");
  const cachedPdf = getFromCache(contentHash);
  if (cachedPdf) {
    return { ok: true, pdf: cachedPdf, cached: true };
  }

  // Acquire concurrency token
  const release = await compileSemaphore.acquire();
  let tempDir = "";

  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "dossier-latex-"));
    const texPath = path.join(tempDir, "document.tex");
    const pdfPath = path.join(tempDir, "document.pdf");

    await writeFile(texPath, source, "utf8");

    try {
      await execFileAsync("tectonic", ["--untrusted", "--outdir", tempDir, texPath], {
        timeout: COMPILE_TIMEOUT_MS,
        env: sanitizedLatexEnv(),
        signal,
        maxBuffer: 10 * 1024 * 1024,
      });

      const pdf = await readFile(pdfPath);
      addToCache(contentHash, pdf);
      return { ok: true, pdf };
    } catch (err: unknown) {
      const execErr = err as { code?: string | number; stderr?: string; stdout?: string; message?: string };
      if (execErr.code === "ENOENT") {
        return {
          ok: false,
          unavailable: true,
          error: "Tectonic LaTeX engine is not installed or not in PATH.",
          diagnostics: ["Tectonic binary 'tectonic' was not found on the system."],
        };
      }

      const stderr = execErr.stderr?.toString() || execErr.stdout?.toString() || execErr.message || "Unknown error";
      const diagnostics = parseDiagnostics(stderr);
      return {
        ok: false,
        error: diagnostics[0] ?? "Compilation failed.",
        diagnostics,
      };
    }
  } finally {
    release();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
