"use server";

import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser, verifyPassword } from "@/server/auth";

const scrypt = promisify(scryptCallback);

export async function changePassword(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");

  if (currentPassword.length > 128 || newPassword.length < 12 || newPassword.length > 128 || newPassword !== confirmation) {
    redirect("/back-office/account/password?error=details");
  }

  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!account?.passwordHash || !(await verifyPassword(currentPassword, account.passwordHash))) {
    redirect("/back-office/account/password?error=current");
  }
  if (await verifyPassword(newPassword, account.passwordHash)) {
    redirect("/back-office/account/password?error=same");
  }

  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(newPassword, salt, 64) as Buffer;
  const passwordHash = `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  redirect("/back-office/account/password?result=updated");
}
