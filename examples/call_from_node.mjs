// Minimal example of calling the builders from Node (no dependencies).
// Usage: node examples/call_from_node.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = path.join(ROOT, ".venv", "bin", "python");

// Run one builder with --json. Resolves to { code, result }; progress events are passed to onProgress.
export function runBuilder(script, args, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [path.join(ROOT, script), "--json", ...args], { cwd: ROOT });
    let out = "", errBuf = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => {
      errBuf += d;
      let i;
      while ((i = errBuf.indexOf("\n")) >= 0) {           // stderr: NDJSON events mixed with plain log lines
        const line = errBuf.slice(0, i); errBuf = errBuf.slice(i + 1);
        try { const ev = JSON.parse(line); if (ev.event) onProgress(ev); } catch { /* plain log line */ }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try { resolve({ code, result: JSON.parse(out) }); }
      catch (e) { reject(new Error(`no JSON on stdout (exit ${code})`)); }
    });
  });
}

const progress = (ev) => {
  if (ev.event === "progress" && ev.done % (ev.total / 4 | 0 || 1) === 0) console.log(`  ${ev.done}/${ev.total}`);
};

// 1) R* for one cap
let { code, result } = await runBuilder("rstar_builder.py",
  ["--pga", "0.349", "--u-cap-mm", "30", "--duration", "30"], progress);
console.log("rstar exit", code, "status", result.status, "R* =", result.r_star_m, "L* =", result.L_star_g);

// 2) table over caps: each entry of result.results carries its own full grid
({ code, result } = await runBuilder("umax_table_builder.py",
  ["--pga", "0.349", "--u-min-mm", "28", "--u-max-mm", "32", "--du-mm", "1", "--duration", "30", "--n-r", "80"]));
console.log("table exit", code);
for (const r of result.results) console.log(`  u_cap ${r.u_cap_mm} mm -> R* ${r.r_star_m} (${r.status}), grid of ${r.grid.R_m.length}`);

// 3) error contract
({ code, result } = await runBuilder("rstar_builder.py", ["--source", "missing.csv", "--u-cap-mm", "30"]));
console.log("bad input exit", code, result);
