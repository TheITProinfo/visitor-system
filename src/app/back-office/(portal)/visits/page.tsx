import Link from "next/link";
import { prisma } from "@/server/db";
import { formatInTimeZone, getLocalDateRange } from "@/server/dates";
import { requireUser } from "@/server/auth";
import { AdminShell } from "@/components/admin-shell";

function validDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string }>;
}) {
  const [user, params, settings] = await Promise.all([
    requireUser(),
    searchParams,
    prisma.companySettings.findFirst({ select: { timeZone: true } }),
  ]);
  const q = (params.q || "").trim().slice(0, 120);
  const timeZone = settings?.timeZone || "UTC";
  let displayTimeZone = "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); displayTimeZone = timeZone; } catch { /* use UTC for invalid saved setting */ }
  const from = validDate(params.from) ? getLocalDateRange(params.from!, displayTimeZone)?.start : undefined;
  const to = validDate(params.to) ? getLocalDateRange(params.to!, displayTimeZone)?.end : undefined;

  const where = {
    ...(user.role === "EMPLOYEE" ? { hostId: user.id } : {}),
    ...(q ? { OR: [
      { visitorFullName: { contains: q, mode: "insensitive" as const } },
      { visitorEmail: { contains: q, mode: "insensitive" as const } },
      { visitorCompanyName: { contains: q, mode: "insensitive" as const } },
      { hostNameSnapshot: { contains: q, mode: "insensitive" as const } },
      { purposeNameSnapshot: { contains: q, mode: "insensitive" as const } },
    ] } : {}),
    ...(from || to ? { checkedInAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(params.status === "open" ? { checkedOutAt: null } : params.status === "closed" ? { checkedOutAt: { not: null } } : {}),
  };

  const visits = await prisma.visitRecord.findMany({
    where,
    orderBy: { checkedInAt: "desc" },
    take: 100,
    select: { id: true, visitorFullName: true, visitorEmail: true, visitorPhone: true, visitorCompanyName: true, isPersonalVisit: true, hostNameSnapshot: true, purposeNameSnapshot: true, checkedInAt: true, checkedOutAt: true },
  });

  return (
    <AdminShell user={user} active="visits">
      <section className="page-heading-row"><div><p className="eyebrow">VISITOR MANAGEMENT</p><h1>Visitor records</h1><p className="page-subtitle">Review arrivals and recorded departures. Missing departure times do not indicate someone is still on site.</p></div><span className="result-count">{visits.length}{visits.length === 100 ? "+" : ""} records</span></section>
      <section className="panel records-panel">
        <form className="filter-bar" method="get">
          <label className="search-field"><span aria-hidden="true">⌕</span><input name="q" type="search" placeholder="Search visitor, host, company…" defaultValue={q} /></label>
          <label className="filter-control"><span>Status</span><select name="status" defaultValue={params.status || "all"}><option value="all">All visits</option><option value="open">Not checked out</option><option value="closed">Checked out</option></select></label>
          <label className="filter-control"><span>From</span><input name="from" type="date" defaultValue={params.from || ""} /></label>
          <label className="filter-control"><span>To</span><input name="to" type="date" defaultValue={params.to || ""} /></label>
          <button className="filter-button" type="submit">Apply filters</button>
          {(q || params.status || params.from || params.to) && <Link className="clear-filters" href="/back-office/visits">Clear</Link>}
        </form>
        {visits.length === 0 ? <div className="empty-state records-empty"><span className="empty-icon">⌕</span><strong>No visitor records found</strong><p>Try changing your search or date filters. New records appear after visitors complete check-in.</p></div> : (
          <div className="table-scroll"><table className="data-table records-table"><thead><tr><th>VISITOR</th><th>CONTACT</th><th>HOST &amp; PURPOSE</th><th>CHECKED IN</th><th>CHECKED OUT</th><th>STATUS</th></tr></thead><tbody>
            {visits.map((visit) => <tr key={visit.id}><td><Link className="record-name-link" href={`/back-office/visits/${visit.id}`}><strong>{visit.visitorFullName}</strong></Link><small>{visit.isPersonalVisit ? "Personal visit" : visit.visitorCompanyName || "Company not supplied"}</small></td><td>{visit.visitorEmail}<small>{visit.visitorPhone}</small></td><td><strong>{visit.hostNameSnapshot}</strong><small>{visit.purposeNameSnapshot}</small></td><td>{formatInTimeZone(visit.checkedInAt, displayTimeZone)}</td><td>{visit.checkedOutAt ? formatInTimeZone(visit.checkedOutAt, displayTimeZone) : "—"}</td><td><span className={`status-pill ${visit.checkedOutAt ? "status-complete" : "status-open"}`}><i />{visit.checkedOutAt ? "Checked out" : "Not checked out"}</span></td></tr>)}
          </tbody></table></div>
        )}
        <div className="table-footnote">Showing up to 100 results · Company time zone: {displayTimeZone}</div>
      </section>
    </AdminShell>
  );
}
