import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { requireUser } from "@/server/auth";
import { formatInTimeZone } from "@/server/dates";
import { prisma } from "@/server/db";
import { readVisitorImage } from "@/server/visitor-files";
import Image from "next/image";

function RecordField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value || "—"}</strong></div>;
}

export default async function VisitDetailPage({ params }: PageProps<"/back-office/visits/[id]">) {
  const [user, { id }, settings] = await Promise.all([
    requireUser(),
    params,
    prisma.companySettings.findFirst({ select: { timeZone: true } }),
  ]);
  const visit = await prisma.visitRecord.findFirst({
    where: { id, ...(user.role === "EMPLOYEE" ? { hostId: user.id } : {}) },
    select: {
      id: true,
      visitorFullName: true,
      visitorCompanyName: true,
      isPersonalVisit: true,
      visitorEmail: true,
      visitorPhone: true,
      vehicleRegistrationNumber: true,
      hostNameSnapshot: true,
      purposeNameSnapshot: true,
      companyNameSnapshot: true,
      agreementTextSnapshot: true,
      signatureFileKey: true,
      photoFileKey: true,
      checkedInAt: true,
      checkedOutAt: true,
    },
  });
  if (!visit) notFound();
  const [signatureImage, visitorPhoto] = await Promise.all([
    readVisitorImage(visit.signatureFileKey),
    readVisitorImage(visit.photoFileKey),
  ]);

  let timeZone = settings?.timeZone || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); } catch { timeZone = "UTC"; }

  return <AdminShell user={user} active="visits">
    <section className="page-heading-row detail-heading"><div><Link className="back-link" href="/back-office/visits">← Visitor records</Link><p className="eyebrow">VISIT DETAIL</p><h1>{visit.visitorFullName}</h1><p className="page-subtitle">Checked in {formatInTimeZone(visit.checkedInAt, timeZone)} · {visit.companyNameSnapshot}</p></div><span className={`status-pill ${visit.checkedOutAt ? "status-complete" : "status-open"}`}><i />{visit.checkedOutAt ? "Checked out" : "Not checked out"}</span></section>
    <div className="detail-grid">
      <section className="panel detail-card"><div className="panel-heading"><div><p className="eyebrow">VISITOR INFORMATION</p><h2>Contact details</h2></div><span className="settings-card-icon green">◎</span></div><div className="detail-fields"><RecordField label="Full name" value={visit.visitorFullName} /><RecordField label="Visit type" value={visit.isPersonalVisit ? "Personal visit" : "Company visit"} /><RecordField label="Company" value={visit.isPersonalVisit ? "Personal" : visit.visitorCompanyName || ""} /><RecordField label="Email" value={visit.visitorEmail} /><RecordField label="Phone number" value={visit.visitorPhone} /><RecordField label="Vehicle registration" value={visit.vehicleRegistrationNumber || "Not provided"} /></div></section>
      <section className="panel detail-card"><div className="panel-heading"><div><p className="eyebrow">VISIT INFORMATION</p><h2>Host &amp; timeline</h2></div><span className="settings-card-icon purple">◷</span></div><div className="detail-fields"><RecordField label="Person visited" value={visit.hostNameSnapshot} /><RecordField label="Purpose" value={visit.purposeNameSnapshot} /><RecordField label="Checked in" value={formatInTimeZone(visit.checkedInAt, timeZone)} /><RecordField label="Checked out" value={visit.checkedOutAt ? formatInTimeZone(visit.checkedOutAt, timeZone) : "Not checked out"} /><RecordField label="Company at check-in" value={visit.companyNameSnapshot} /></div><p className="detail-footnote">A missing check-out time means no departure was recorded. It does not establish whether the visitor is still on site.</p></section>
      <section className="panel detail-card visit-evidence-card"><div className="panel-heading"><div><p className="eyebrow">VISITOR CONSENT</p><h2>Agreement &amp; identity evidence</h2></div><span className="settings-card-icon green">✓</span></div>{visit.agreementTextSnapshot ? <div className="visit-agreement-snapshot">{visit.agreementTextSnapshot}</div> : <p className="detail-footnote">Agreement evidence was not captured for this record.</p>}{signatureImage || visitorPhoto ? <div className="visit-evidence-grid">{signatureImage && <figure><figcaption>Visitor signature</figcaption><Image src={signatureImage} width={720} height={210} unoptimized alt="Visitor’s saved signature" /></figure>}{visitorPhoto && <figure><figcaption>Visitor photo</figcaption><Image src={visitorPhoto} width={480} height={480} unoptimized alt="Visitor photo saved at check-in" /></figure>}</div> : <p className="detail-footnote">No signature or photo is available for this record.</p>}</section>
    </div>
  </AdminShell>;
}
