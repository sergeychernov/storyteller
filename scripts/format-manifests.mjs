import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const checkOnly = process.argv.includes("--check");
const manifests = ["package.json"];

for (const workspaceRoot of ["apps", "packages"]) {
  for (const workspace of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (workspace.isDirectory()) manifests.push(join(workspaceRoot, workspace.name, "package.json"));
  }
}

const unformatted = [];

for (const manifest of manifests) {
  const current = readFileSync(manifest, "utf8");
  const formatted = `${JSON.stringify(JSON.parse(current), null, 2)}\n`;

  if (current === formatted) continue;
  if (checkOnly) unformatted.push(manifest);
  else writeFileSync(manifest, formatted);
}

if (unformatted.length > 0) {
  console.error(`Package manifests need formatting:\n${unformatted.join("\n")}`);
  process.exitCode = 1;
}
