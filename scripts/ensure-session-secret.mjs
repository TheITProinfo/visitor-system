import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const envPath = new URL("../.env", import.meta.url);
let contents = "";

try {
  contents = await readFile(envPath, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

let updated = false;

if (!/^SESSION_SECRET\s*=/m.test(contents)) {
  const separator = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  contents += `${separator}SESSION_SECRET="${randomBytes(32).toString("base64url")}"\n`;
  updated = true;
}

if (!/^SETTINGS_ENCRYPTION_KEY\s*=/m.test(contents)) {
  const separator = contents.length > 0 && !contents.endsWith("\n") ? "\n" : "";
  contents += `${separator}SETTINGS_ENCRYPTION_KEY="${randomBytes(32).toString("base64")}"\n`;
  updated = true;
}

if (updated) {
  await writeFile(envPath, contents, { mode: 0o600 });
}
