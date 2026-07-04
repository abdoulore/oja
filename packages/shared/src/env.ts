import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Always load the repo-root .env no matter which package is the entrypoint.
const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../../..");
config({ path: resolve(REPO_ROOT, ".env") });

export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.error(`Missing required env var ${name} (set it in .env)`);
    process.exit(1);
  }
  return v;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : fallback;
  if (Number.isNaN(n)) {
    console.error(`Env var ${name} must be an integer, got '${raw}'`);
    process.exit(1);
  }
  return n;
}
