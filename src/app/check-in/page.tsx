import Link from "next/link";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { CheckInForm } from "@/features/visitor-check-in/check-in-form";
import { prisma } from "@/server/db";

export default async function CheckInPage() {
  await connection();
  const initialToken = randomUUID();
  const [company, purposes] = await Promise.all([
    prisma.companySettings.findFirst({ select: { companyName: true, agreementText: true } }),
    prisma.visitPurpose.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="visitor-page">
      <div className="visitor-page-shell">
        <Link className="visitor-back" href="/">← Visitor System</Link>
        <header className="visitor-page-heading"><p className="visitor-eyebrow">WELCOME TO {company?.companyName.toUpperCase() || "OUR WORKSPACE"}</p><h1>Check in</h1><p>Share a few details so we can let your host know you’ve arrived.</p></header>
        <CheckInForm initialToken={initialToken} companyName={company?.companyName || "Visitor System"} agreementText={company?.agreementText || ""} purposes={purposes} />
        <footer className="visitor-page-footer">Your visit details are recorded securely for visitor management. Need help? Please ask reception.</footer>
      </div>
    </main>
  );
}
