import "server-only";

import nodemailer from "nodemailer";
import { prisma } from "@/server/db";
import { decryptSetting } from "@/server/settings-crypto";

export class EmailNotConfiguredError extends Error {}
export class EmailTlsModeError extends Error {}

export async function sendConfiguredEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  const settings = await prisma.companySettings.findFirst({
    select: {
      companyName: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUsername: true,
      smtpPasswordEncrypted: true,
      smtpSenderName: true,
      smtpSenderEmail: true,
    },
  });

  if (
    !settings?.smtpHost || !settings.smtpPort || !settings.smtpUsername ||
    !settings.smtpPasswordEncrypted || !settings.smtpSenderEmail
  ) {
    throw new EmailNotConfiguredError("SMTP settings are incomplete.");
  }

  if ((settings.smtpPort === 587 && settings.smtpSecure) || (settings.smtpPort === 465 && !settings.smtpSecure)) {
    throw new EmailTlsModeError("Port 587 uses STARTTLS; port 465 uses implicit TLS.");
  }

  const transport = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    requireTLS: !settings.smtpSecure,
    auth: {
      user: settings.smtpUsername,
      pass: decryptSetting(settings.smtpPasswordEncrypted),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  try {
    await transport.sendMail({
      from: { name: settings.smtpSenderName || settings.companyName, address: settings.smtpSenderEmail },
      to,
      subject,
      text,
    });
  } finally {
    transport.close();
  }
}
