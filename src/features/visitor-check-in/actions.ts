"use server";

import { revalidatePath } from "next/cache";
import { searchVisitHosts, createVisitorCheckIn, type VisitorCheckInInput } from "@/server/visitor-service";
import { sendConfiguredEmail } from "@/server/email";
import { prisma } from "@/server/db";
import { formatInTimeZone } from "@/server/dates";

function field(formData: FormData, key: string, max: number) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function validEmail(value: string) {
  return value.length <= 254 && /^\S+@\S+\.\S+$/.test(value);
}

export async function searchActiveHosts(query: string) {
  return searchVisitHosts(query);
}

export type CheckInActionResult =
  | { ok: true; hostName: string; companyName: string }
  | { ok: false; code: "invalid" | "host-unavailable" | "purpose-unavailable" | "agreement-unavailable" | "failed" };

export async function submitVisitorCheckIn(formData: FormData): Promise<CheckInActionResult> {
  const fullName = field(formData, "fullName", 160);
  const isPersonalVisit = formData.get("isPersonalVisit") === "true";
  const companyName = field(formData, "visitorCompanyName", 160);
  const email = field(formData, "visitorEmail", 254).toLowerCase();
  const phone = field(formData, "visitorPhone", 40);
  const driving = formData.get("isDriving") === "true";
  const vehicleRegistrationNumber = field(formData, "vehicleRegistrationNumber", 24).toUpperCase();
  const hostId = field(formData, "hostId", 64);
  const purposeId = field(formData, "purposeId", 64);
  const checkInToken = field(formData, "checkInToken", 36);
  const signatureData = field(formData, "signatureData", 1_200_000);
  const photoData = field(formData, "photoData", 1_200_000);
  const agreed = formData.get("agreed") === "true";

  if (
    fullName.length < 2 || (!isPersonalVisit && !companyName) || !validEmail(email) || phone.length < 5 ||
    (driving && !vehicleRegistrationNumber) || !hostId || !purposeId || !/^[0-9a-f-]{36}$/i.test(checkInToken) ||
    !signatureData || !photoData || !agreed
  ) return { ok: false, code: "invalid" };

  try {
    const result = await createVisitorCheckIn({
      fullName, companyName, isPersonalVisit, email, phone,
      vehicleRegistrationNumber: driving ? vehicleRegistrationNumber : "",
      hostId, purposeId, checkInToken, signatureData, photoData,
    } satisfies VisitorCheckInInput);

    if (result.status === "host-unavailable") return { ok: false, code: "host-unavailable" };
    if (result.status === "purpose-unavailable") return { ok: false, code: "purpose-unavailable" };
    if (result.status === "agreement-unavailable") return { ok: false, code: "agreement-unavailable" };

    if (result.status === "created") {
      const time = formatInTimeZone(new Date(result.checkedInAt), result.timeZone);
      await Promise.allSettled([
        sendConfiguredEmail({
          to: email,
          subject: `${result.companyName} check-in confirmation`,
          text: `Hello ${fullName},\n\nYour visit to ${result.companyName} has been checked in.\nPerson you are visiting: ${result.hostName}\nCheck-in time: ${time}\n\nPlease collect your visitor badge at reception.`,
        }),
        prisma.user.findUnique({ where: { id: hostId }, select: { email: true } }).then((host) => host && sendConfiguredEmail({
          to: host.email,
          subject: `${fullName} has arrived`,
          text: `Hello ${result.hostName},\n\n${fullName}${isPersonalVisit ? "" : ` from ${companyName}`} has checked in to visit you.\nVisit purpose: ${result.purposeName}.`,
        })),
      ]);
    }

    revalidatePath("/back-office/dashboard");
    revalidatePath("/back-office/visits");
    return { ok: true, hostName: result.hostName, companyName: result.companyName };
  } catch {
    return { ok: false, code: "failed" };
  }
}
