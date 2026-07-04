// Boots the whole market: indexer -> facilitator -> provider -> buyers ->
// pricing agent, with prefixed logs. Ctrl-C stops everything.
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const procs = [];
const COLORS = { indexer: 36, facilitator: 35, provider: 33, buyers: 32, pricing: 95 };

// spawn("npx", ...) is EINVAL on Windows (cmd shim); invoke the tsx CLI with
// the current Node executable instead, which behaves the same on every OS.
const TSX = resolve(ROOT, "node_modules/tsx/dist/cli.mjs");

function run(name, args, delayMs = 0) {
  setTimeout(() => {
    const p = spawn(process.execPath, [TSX, ...args], { cwd: ROOT, env: process.env });
    const c = COLORS[name] ?? 37;
    const tag = `\x1b[${c}m[${name}]\x1b[0m `;
    p.stdout.on("data", d => process.stdout.write(d.toString().replace(/^/gm, tag)));
    p.stderr.on("data", d => process.stderr.write(d.toString().replace(/^/gm, tag)));
    p.on("exit", code => console.log(`${tag}exited (${code})`));
    procs.push(p);
  }, delayMs);
}

run("indexer", ["packages/indexer/src/index.ts"], 0);
run("facilitator", ["packages/facilitator/src/index.ts"], 1200);
run("provider", ["packages/provider/src/index.ts"], 2400);
run("buyers", ["packages/agents/src/buyers.ts"], 4500);
run("pricing", ["packages/agents/src/pricing-agent.ts"], 6000);

process.on("SIGINT", () => {
  for (const p of procs) p.kill("SIGINT");
  process.exit(0);
});
console.log("Booting Ọjà… dashboard: cd packages/dashboard && npm run dev");
