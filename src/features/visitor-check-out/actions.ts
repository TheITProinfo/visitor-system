"use server";

import { checkOutLatestVisit } from "@/server/visitor-service";
import { revalidatePath } from "next/cache";

export type CheckOutResult = "checked-out" | "already-checked-out" | "not-found" | "invalid" | "failed";

export async function submitVisitorCheckOut(formData: FormData): Promise<CheckOutResult> {
  const email = String(formData.get("email") ?? "").trim().slice(0, 254).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return "invalid";
  try {
    const result = await checkOutLatestVisit(email);
    if (result === "checked-out") {
      revalidatePath("/back-office/dashboard");
      revalidatePath("/back-office/visits");
    }
    return result;
  } catch {
    return "failed";
  }
}
