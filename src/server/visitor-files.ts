import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 850 * 1024;
const PRIVATE_ROOT = path.resolve(process.env.VISITOR_FILES_DIR || path.join(process.cwd(), ".visitor-files"));

type ImageKind = "photo" | "signature";

function decodeImage(encoded: string, kind: ImageKind): { bytes: Buffer; extension: string } {
  if (!encoded || encoded.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Image data is invalid or too large.");
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES || bytes.toString("base64") !== encoded) {
    throw new Error("Image data is invalid or too large.");
  }

  const isPng = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((kind === "signature" && !isPng) || (kind === "photo" && !isJpeg)) {
    throw new Error("The image format is not supported.");
  }

  return { bytes, extension: isPng ? ".png" : ".jpg" };
}

export async function storeVisitorImage(encoded: string, kind: ImageKind): Promise<string> {
  const { bytes, extension } = decodeImage(encoded, kind);
  const fileName = `${randomUUID()}${extension}`;
  await mkdir(PRIVATE_ROOT, { recursive: true, mode: 0o700 });
  await writeFile(path.join(PRIVATE_ROOT, fileName), bytes, { flag: "wx", mode: 0o600 });
  return fileName;
}

export async function removeVisitorImage(fileKey: string | undefined) {
  if (!fileKey || path.basename(fileKey) !== fileKey) return;
  await unlink(path.join(PRIVATE_ROOT, fileKey)).catch(() => undefined);
}

export async function readVisitorImage(fileKey: string | null | undefined) {
  if (!fileKey || !/^[0-9a-f-]{36}\.(png|jpg)$/.test(fileKey)) return null;
  try {
    const bytes = await readFile(path.join(PRIVATE_ROOT, fileKey));
    const mime = fileKey.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
