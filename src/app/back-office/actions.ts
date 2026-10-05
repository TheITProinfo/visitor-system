"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { createSession, destroySession, verifyPassword } from "@/server/auth";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (email.length > 254 || password.length > 256 || !email || !password) {
    redirect("/back-office?error=credentials");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  });

  const valid = user?.status === "ACTIVE" && user.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!user || !valid) redirect("/back-office?error=credentials");
  await createSession(user.id);
  redirect("/back-office/dashboard");
}

export async function signOut() {
  await destroySession();
  redirect("/back-office");
}
