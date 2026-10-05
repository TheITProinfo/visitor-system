import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ENCRYPTION_VERSION = "v1";

function encryptionKey() {
  const encoded = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Settings encryption is not configured.");

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Settings encryption key must be 32 bytes.");
  return key;
}

export function encryptSetting(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSetting(encrypted: string) {
  const [version, ivText, tagText, ciphertextText] = encrypted.split(".");
  if (version !== ENCRYPTION_VERSION || !ivText || !tagText || !ciphertextText) {
    throw new Error("Saved SMTP password cannot be decrypted.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
