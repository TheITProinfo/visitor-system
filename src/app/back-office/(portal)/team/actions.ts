"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { sendConfiguredEmail } from "@/server/email";

export async function createStaffInvitation(formData: FormData) {
  const administrator = await requireUser(["ADMINISTRATOR"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !["EMPLOYEE", "RECEPTIONIST"].includes(role)) {
    redirect("/back-office/team?error=invite-details");
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    redirect("/back-office/team?error=account-exists");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invitationRole = role as "EMPLOYEE" | "RECEPTIONIST";
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.invitation.upsert({
    where: { email },
    create: { email, role: invitationRole, tokenHash, expiresAt, createdById: administrator.id },
    update: { role: invitationRole, tokenHash, expiresAt, acceptedAt: null, createdById: administrator.id },
  });

  const origin = process.env.APP_URL || "http://localhost:3000";
  const invitationUrl = new URL("/back-office/accept-invitation", origin);
  invitationUrl.searchParams.set("token", token);
  let delivery = "failed";
  try {
    const company = await prisma.companySettings.findFirst({ select: { companyName: true } });
    await sendConfiguredEmail({
      to: email,
      subject: `Invitation to join ${company?.companyName || "Visitor System"}`,
      text: `You have been invited to join ${company?.companyName || "Visitor System"} as a ${invitationRole.toLowerCase()}.\n\nSet up your account using this one-time link within 7 days:\n${invitationUrl.toString()}\n\nIf you were not expecting this invitation, you can ignore this email.`,
    });
    delivery = "sent";
  } catch {
    delivery = "failed";
  }
  revalidatePath("/back-office/team");
  redirect(`/back-office/team?invite=${encodeURIComponent(invitationUrl.toString())}&email=${encodeURIComponent(email)}&delivery=${delivery}`);
}

export async function toggleStaffAccess(formData: FormData) {
  const administrator = await requireUser(["ADMINISTRATOR"]);
  const id = String(formData.get("id") ?? "").trim();
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
  if (!target || target.id === administrator.id || target.role === "ADMINISTRATOR" && target.status === "INVITED") {
    redirect("/back-office/team?error=account-action");
  }

  const nextStatus = target.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE";
  if (target.role === "ADMINISTRATOR" && nextStatus === "DEACTIVATED") {
    const activeAdministrators = await prisma.user.count({ where: { role: "ADMINISTRATOR", status: "ACTIVE" } });
    if (activeAdministrators <= 1) redirect("/back-office/team?error=last-admin");
  }
  if (target.status === "INVITED") redirect("/back-office/team?error=account-action");

  await prisma.user.update({ where: { id }, data: { status: nextStatus } });
  revalidatePath("/back-office/team");
  revalidatePath("/back-office/dashboard");
  redirect("/back-office/team?result=access-updated");
}

export async function promoteStaffToAdministrator(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const id = String(formData.get("id") ?? "").trim();
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
  if (!target || target.role === "ADMINISTRATOR" || target.status !== "ACTIVE") {
    redirect("/back-office/team?error=role-change");
  }

  await prisma.user.update({ where: { id: target.id }, data: { role: "ADMINISTRATOR" } });
  revalidatePath("/back-office/team");
  revalidatePath("/back-office/dashboard");
  redirect("/back-office/team?result=role-updated");
}
