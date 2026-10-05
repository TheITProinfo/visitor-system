import "server-only";
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import type { UserRole } from "@/generated/prisma/client";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "visitor_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing. Start the app with npm run dev or npm run start.");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, key] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const actual = Buffer.from(derived);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = `${userId}.${expiresAt}.${randomBytes(12).toString("base64url")}`;
  const token = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getAuthenticatedUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expiry, nonce, signature] = parts;
  const payload = `${userId}.${expiry}.${nonce}`;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!/^\d+$/.test(expiry) || Number(expiry) <= Math.floor(Date.now() / 1000)) return null;

  return prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE" },
    select: { id: true, email: true, firstName: true, lastName: true, role: true, departmentId: true },
  });
}

export async function requireUser(roles?: UserRole[]) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/back-office?error=session");
  if (roles && !roles.includes(user.role)) redirect("/back-office/dashboard?error=forbidden");
  return user;
}
