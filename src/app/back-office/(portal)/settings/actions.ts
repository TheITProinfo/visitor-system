"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { toStoredTimeZone } from "@/server/time-zones";
import { encryptSetting } from "@/server/settings-crypto";
import { EmailTlsModeError, sendConfiguredEmail } from "@/server/email";

function field(formData: FormData, name: string, maxLength: number) {
  return String(formData.get(name) ?? "").trim().slice(0, maxLength);
}

function returnToSettings(result: string): never {
  revalidatePath("/back-office/settings");
  redirect(`/back-office/settings?result=${result}`);
}

export async function saveCompanySettings(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const companyName = field(formData, "companyName", 120);
  const address = field(formData, "address", 500);
  const timeZoneInput = field(formData, "timeZone", 100) || "UTC";
  if (!companyName) returnToSettings("company-required");
  const timeZone = toStoredTimeZone(timeZoneInput);
  if (!timeZone) returnToSettings("timezone-invalid");

  const existing = await prisma.companySettings.findFirst({ select: { id: true } });
  if (existing) {
    await prisma.companySettings.update({ where: { id: existing.id }, data: { companyName, address: address || null, timeZone } });
  } else {
    await prisma.companySettings.create({ data: { companyName, address: address || null, timeZone } });
  }
  returnToSettings("saved");
}

export async function saveAgreementTemplate(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const agreementText = String(formData.get("agreementText") ?? "").trim().slice(0, 12000);
  const existing = await prisma.companySettings.findFirst({ select: { id: true } });
  if (!existing) returnToSettings("company-required");
  await prisma.companySettings.update({ where: { id: existing.id }, data: { agreementText: agreementText || null } });
  returnToSettings("agreement-saved");
}

function isEmailAddress(value: string) {
  return value.length <= 254 && /^\S+@\S+\.\S+$/.test(value);
}

export async function saveSmtpSettings(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const host = field(formData, "smtpHost", 253);
  const port = Number(field(formData, "smtpPort", 5));
  const username = field(formData, "smtpUsername", 254);
  const password = String(formData.get("smtpPassword") ?? "");
  const senderName = field(formData, "smtpSenderName", 120);
  const senderEmail = field(formData, "smtpSenderEmail", 254).toLowerCase();
  const smtpSecure = formData.get("smtpSecure") === "on";

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !senderName || !isEmailAddress(senderEmail)) {
    returnToSettings("smtp-invalid");
  }
  if ((port === 587 && smtpSecure) || (port === 465 && !smtpSecure)) returnToSettings("smtp-tls-mismatch");

  const existing = await prisma.companySettings.findFirst({ select: { id: true, smtpPasswordEncrypted: true } });
  if (!existing) returnToSettings("company-required");
  if (!password && !existing.smtpPasswordEncrypted) returnToSettings("smtp-password-required");

  await prisma.companySettings.update({
    where: { id: existing.id },
    data: {
      smtpHost: host,
      smtpPort: port,
      smtpSecure,
      smtpUsername: username,
      smtpPasswordEncrypted: password ? encryptSetting(password) : existing.smtpPasswordEncrypted,
      smtpSenderName: senderName,
      smtpSenderEmail: senderEmail,
    },
  });
  returnToSettings("smtp-saved");
}

export async function sendSmtpTestEmail(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const to = field(formData, "testEmail", 254).toLowerCase();
  if (!isEmailAddress(to)) returnToSettings("test-email-invalid");
  const company = await prisma.companySettings.findFirst({ select: { companyName: true } });
  if (!company) returnToSettings("company-required");

  try {
    await sendConfiguredEmail({
      to,
      subject: `${company.companyName} email configuration test`,
      text: `This test message confirms that ${company.companyName} can send email using its configured SMTP settings.`,
    });
  } catch (error) {
    if (error instanceof EmailTlsModeError) returnToSettings("smtp-tls-mismatch");
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EAUTH") returnToSettings("test-email-auth-failed");
    if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED", "ENOTFOUND", "ETLS"].includes(code)) {
      returnToSettings("test-email-connection-failed");
    }
    returnToSettings("test-email-failed");
  }

  returnToSettings("test-email-sent");
}

export async function savePrinterSettings(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const printerEnabled = formData.get("printerEnabled") === "on";
  const printerModel = field(formData, "printerModel", 120);
  const printerAddress = field(formData, "printerAddress", 500);
  const widthText = field(formData, "badgeLabelWidthMm", 3);
  const heightText = field(formData, "badgeLabelHeightMm", 3);
  const width = widthText ? Number(widthText) : null;
  const height = heightText ? Number(heightText) : null;

  if (
    (width !== null && (!Number.isInteger(width) || width < 10 || width > 200)) ||
    (height !== null && (!Number.isInteger(height) || height < 10 || height > 200))
  ) returnToSettings("printer-invalid");

  const existing = await prisma.companySettings.findFirst({ select: { id: true } });
  if (!existing) returnToSettings("company-required");
  await prisma.companySettings.update({
    where: { id: existing.id },
    data: {
      printerEnabled,
      printerModel: printerModel || null,
      printerAddress: printerAddress || null,
      badgeLabelWidthMm: width,
      badgeLabelHeightMm: height,
    },
  });
  returnToSettings("printer-saved");
}

export async function createDepartment(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const name = field(formData, "name", 80);
  if (!name) returnToSettings("department-required");
  try {
    await prisma.department.create({ data: { name } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") returnToSettings("department-exists");
    throw error;
  }
  returnToSettings("department-added");
}

export async function toggleDepartment(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const id = field(formData, "id", 64);
  if (!id) returnToSettings("invalid");
  const department = await prisma.department.findUnique({ where: { id }, select: { isActive: true } });
  if (!department) returnToSettings("invalid");
  await prisma.department.update({ where: { id }, data: { isActive: !department.isActive } });
  returnToSettings("department-updated");
}

export async function createPurpose(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const name = field(formData, "name", 100);
  if (!name) returnToSettings("purpose-required");
  try {
    await prisma.visitPurpose.create({ data: { name } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") returnToSettings("purpose-exists");
    throw error;
  }
  returnToSettings("purpose-added");
}

export async function togglePurpose(formData: FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const id = field(formData, "id", 64);
  if (!id) returnToSettings("invalid");
  const purpose = await prisma.visitPurpose.findUnique({ where: { id }, select: { isActive: true } });
  if (!purpose) returnToSettings("invalid");
  await prisma.visitPurpose.update({ where: { id }, data: { isActive: !purpose.isActive } });
  returnToSettings("purpose-updated");
}
