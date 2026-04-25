import { readFileSync } from "node:fs";
import path from "node:path";

let didLoadRootEnv = false;

function applyEnvFile(filePath: string) {
  let content = "";
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function getServerEnv(name: string) {
  if (!didLoadRootEnv) {
    didLoadRootEnv = true;
    applyEnvFile(path.resolve(process.cwd(), "..", ".env"));
  }
  return process.env[name];
}
