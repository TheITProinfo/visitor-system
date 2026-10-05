"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { createSession } from "@/server/auth";
import { randomUUID, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, 80);
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, 80);
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  if (!/^[\w-]{40,60}$/.test(token) || !firstName || !lastName || password.length < 12 || password.length > 128 || password !== confirmation) {
    redirect("/back-office/accept-invitation?error=details&token=" + encodeURIComponent(token));
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    redirect("/back-office/accept-invitation?error=expired");
  }
  if (invitation.role === "EMPLOYEE" && departmentId) {
    const department = await prisma.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } });
    if (!department) redirect("/back-office/accept-invitation?error=department&token=" + encodeURIComponent(token));
  }
  if (invitation.role === "RECEPTIONIST" && departmentId) redirect("/back-office/accept-invitation?error=department&token=" + encodeURIComponent(token));

  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  const passwordHash = `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
  let userId: string;
  try {
    const user = await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("Invitation already used.");
      return transaction.user.create({
        data: {
          id: randomUUID(),
          email: invitation.email,
          passwordHash,
          firstName,
          lastName,
          role: invitation.role,
          status: "ACTIVE",
          departmentId: invitation.role === "EMPLOYEE" ? departmentId : null,
        },
        select: { id: true },
      });
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Error && error.message === "Invitation already used.") {
      redirect("/back-office/accept-invitation?error=expired");
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      redirect("/back-office/accept-invitation?error=expired");
    }
    throw error;
  }

  await createSession(userId);
  redirect("/back-office/dashboard");
}
