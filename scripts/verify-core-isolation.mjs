import { readdir, readFile, rename, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const coreRoots = ["packages/effect-api", "packages/engine", "packages/perception", "packages/showrunner", "packages/sim"];
const forbidden = /(?:@loki\/effect-(?:card|example)|(?:^|[/\\])effects[/\\](?:card|_example)(?:[/\\]|$))/;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

let violations = [];
for (const packageDir of coreRoots) {
  for (const file of await walk(resolve(root, packageDir))) {
    const lines = (await readFile(file, "utf8")).split("\n");
    lines.forEach((text, index) => {
      if (forbidden.test(text) && !text.trimStart().startsWith("*") && !text.trimStart().startsWith("//")) {
        violations.push({ file: relative(root, file), line: index + 1, text: text.trim() });
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Core isolation FAILED: core source imports a concrete effect.");
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.text}`);
  }
  process.exit(1);
}
console.log(`Core import scan clean (${coreRoots.length} packages).`);

const cardDir = resolve(root, "effects/card");
const backupDir = resolve(root, `effects/.card-isolation-${process.pid}`);
const exists = await stat(cardDir).then(() => true, () => false);
if (!exists) {
  console.error("Core isolation FAILED: effects/card is missing before the test.");
  process.exit(1);
}

let moved = false;
try {
  await rename(cardDir, backupDir);
  moved = true;
  console.log("Temporarily removed effects/card; compiling and testing the core + toy effect.");

  const typecheck = spawnSync("npx", ["tsc", "-p", "tsconfig.core.json", "--noEmit"], {
    cwd: root,
    stdio: "inherit"
  });
  if (typecheck.status !== 0) {
    throw new Error(`core typecheck failed with status ${typecheck.status}`);
  }

  const tests = spawnSync("npx", ["vitest", "run", "packages", "effects/_example"], {
    cwd: root,
    stdio: "inherit"
  });
  if (tests.status !== 0) {
    throw new Error(`core tests failed with status ${tests.status}`);
  }
  console.log("Core isolation PASSED: core compiles and tests without effects/card.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (moved) {
    await rename(backupDir, cardDir);
    console.log("Restored effects/card.");
  }
}
