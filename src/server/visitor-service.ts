import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { removeVisitorImage, storeVisitorImage } from "@/server/visitor-files";

export type VisitorCheckInInput = {
  fullName: string;
  companyName: string;
  isPersonalVisit: boolean;
  email: string;
  phone: string;
  vehicleRegistrationNumber: string;
  hostId: string;
  purposeId: string;
  checkInToken: string;
  signatureData: string;
  photoData: string;
};

export type VisitorCheckInResult =
  | { status: "created" | "already-created"; hostName: string; companyName: string; purposeName: string; timeZone: string; checkedInAt: string }
  | { status: "host-unavailable" }
  | { status: "purpose-unavailable" }
  | { status: "agreement-unavailable" };

export async function searchVisitHosts(query: string) {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (normalized.length < 2) return [];

  const words = normalized.split(" ");
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      firstName: { not: null },
      lastName: { not: null },
      AND: words.map((word) => ({
        OR: [
          { firstName: { contains: word, mode: "insensitive" } },
          { lastName: { contains: word, mode: "insensitive" } },
        ],
      })),
    },
    select: { id: true, firstName: true, lastName: true, department: { select: { name: true, isActive: true } } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 12,
  });

  return users.map((user) => ({
    id: user.id,
    name: `${user.firstName} ${user.lastName}`,
    department: user.department?.isActive ? user.department.name : "",
  }));
}

export async function createVisitorCheckIn(input: VisitorCheckInInput): Promise<VisitorCheckInResult> {
  const prior = await prisma.visitRecord.findUnique({
    where: { checkInToken: input.checkInToken },
    select: { hostNameSnapshot: true, companyNameSnapshot: true, purposeNameSnapshot: true, checkedInAt: true },
  });
  if (prior) {
    const settings = await prisma.companySettings.findFirst({ select: { timeZone: true } });
    return { status: "already-created", hostName: prior.hostNameSnapshot, companyName: prior.companyNameSnapshot, purposeName: prior.purposeNameSnapshot, timeZone: settings?.timeZone || "UTC", checkedInAt: prior.checkedInAt.toISOString() };
  }

  const [company, host, purpose] = await Promise.all([
    prisma.companySettings.findFirst({ select: { companyName: true, agreementText: true, timeZone: true } }),
    prisma.user.findFirst({
      where: { id: input.hostId, status: "ACTIVE", firstName: { not: null }, lastName: { not: null } },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
    prisma.visitPurpose.findFirst({ where: { id: input.purposeId, isActive: true }, select: { id: true, name: true } }),
  ]);

  if (!company?.agreementText?.trim()) return { status: "agreement-unavailable" };
  if (!host) return { status: "host-unavailable" };
  if (!purpose) return { status: "purpose-unavailable" };

  const hostName = `${host.firstName} ${host.lastName}`;
  const companyName = company.companyName;
  let signatureFileKey: string | undefined;
  let photoFileKey: string | undefined;

  try {
    signatureFileKey = await storeVisitorImage(input.signatureData, "signature");
    photoFileKey = await storeVisitorImage(input.photoData, "photo");
    const visit = await prisma.visitRecord.create({
      data: {
        visitorFullName: input.fullName,
        visitorCompanyName: input.isPersonalVisit ? null : input.companyName,
        isPersonalVisit: input.isPersonalVisit,
        visitorEmail: input.email,
        visitorPhone: input.phone,
        vehicleRegistrationNumber: input.vehicleRegistrationNumber || null,
        hostId: host.id,
        purposeId: purpose.id,
        companyNameSnapshot: companyName,
        hostNameSnapshot: hostName,
        purposeNameSnapshot: purpose.name,
        agreementTextSnapshot: company.agreementText,
        signatureFileKey,
        photoFileKey,
        checkInToken: input.checkInToken,
        signedAt: new Date(),
      },
      select: { checkedInAt: true },
    });

    return { status: "created", hostName, companyName, purposeName: purpose.name, timeZone: company.timeZone, checkedInAt: visit.checkedInAt.toISOString() };
  } catch (error) {
    await Promise.all([removeVisitorImage(signatureFileKey), removeVisitorImage(photoFileKey)]);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.visitRecord.findUnique({
        where: { checkInToken: input.checkInToken },
        select: { hostNameSnapshot: true, companyNameSnapshot: true, purposeNameSnapshot: true, checkedInAt: true },
      });
      if (duplicate) {
        const settings = await prisma.companySettings.findFirst({ select: { timeZone: true } });
        return { status: "already-created", hostName: duplicate.hostNameSnapshot, companyName: duplicate.companyNameSnapshot, purposeName: duplicate.purposeNameSnapshot, timeZone: settings?.timeZone || "UTC", checkedInAt: duplicate.checkedInAt.toISOString() };
      }
    }
    throw error;
  }
}

export async function checkOutLatestVisit(email: string) {
  const latest = await prisma.visitRecord.findFirst({
    where: { visitorEmail: { equals: email.trim(), mode: "insensitive" } },
    orderBy: { checkedInAt: "desc" },
    select: { id: true, checkedOutAt: true },
  });

  if (!latest) return "not-found" as const;
  if (latest.checkedOutAt) return "already-checked-out" as const;

  const update = await prisma.visitRecord.updateMany({
    where: { id: latest.id, checkedOutAt: null },
    data: { checkedOutAt: new Date() },
  });
  return update.count === 1 ? "checked-out" as const : "already-checked-out" as const;
}
