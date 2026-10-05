import "dotenv/config";
import { randomUUID, scrypt as scryptCallback, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const { Client } = pg;

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Run this command in an interactive terminal so the password can be entered privately.");
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let value = "";
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    const onData = (chunk) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          cleanup();
          reject(new Error("Cancelled."));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else if (char >= " ") {
          value += char;
        }
      }
    };
    function cleanup() {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
    }
    input.on("data", onData);
  });
}

const terminal = createInterface({ input: process.stdin, output: process.stdout });
const email = (await terminal.question("Administrator email: ")).trim().toLowerCase();
const firstName = (await terminal.question("First name: ")).trim();
const lastName = (await terminal.question("Last name: ")).trim();
terminal.close();
const password = await readHidden("Password (minimum 12 characters): ");
const confirmation = await readHidden("Confirm password: ");

if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
if (firstName.length < 1 || lastName.length < 1) throw new Error("First and last name are required.");
if (password.length < 12) throw new Error("Use a password with at least 12 characters.");
if (password !== confirmation) throw new Error("The passwords do not match.");

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query("LOCK TABLE \"User\" IN SHARE ROW EXCLUSIVE MODE");
  const { rows } = await client.query('SELECT count(*)::int AS count FROM "User" WHERE role = \'ADMINISTRATOR\'');
  if (rows[0].count > 0) throw new Error("An administrator already exists. Use the back office to manage accounts.");

  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  const passwordHash = `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
  await client.query(
    'INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", role, status, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, \'ADMINISTRATOR\', \'ACTIVE\', NOW(), NOW())',
    [randomUUID(), email, passwordHash, firstName, lastName],
  );
  await client.query("COMMIT");
  process.stdout.write(`Administrator account created for ${email}.\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
