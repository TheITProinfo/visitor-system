import Link from "next/link";
import { prisma } from "@/server/db";
import { getLocalDayRange, formatInTimeZone } from "@/server/dates";
import { requireUser } from "@/server/auth";
import { AdminShell } from "@/components/admin-shell";

function greetingHour() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const settings = await prisma.companySettings.findFirst({ select: { companyName: true, timeZone: true } });
  const timeZone = settings?.timeZone || "UTC";
  const safeTimeZone = (() => {
    try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); return timeZone; }
    catch { return "UTC"; }
  })();
  const range = getLocalDayRange(new Date(), safeTimeZone);
  const scope = user.role === "EMPLOYEE" ? { hostId: user.id } : {};
  const todayWhere = { ...scope, checkedInAt: { gte: range.start, lt: range.end } };

  const [todayCount, openCount, teamCount, recentVisits] = await Promise.all([
    prisma.visitRecord.count({ where: todayWhere }),
    prisma.visitRecord.count({ where: { ...scope, checkedOutAt: null } }),
    user.role === "ADMINISTRATOR" ? prisma.user.count({ where: { status: "ACTIVE" } }) : Promise.resolve(null),
    prisma.visitRecord.findMany({
      where: scope,
      orderBy: { checkedInAt: "desc" },
      take: 6,
      select: { id: true, visitorFullName: true, visitorCompanyName: true, isPersonalVisit: true, hostNameSnapshot: true, purposeNameSnapshot: true, checkedInAt: true, checkedOutAt: true },
    }),
  ]);

  const firstName = user.firstName || "there";

  return (
    <AdminShell user={user} active="dashboard">
      <section className="welcome-row">
        <div><p className="eyebrow">{greetingHour()}, {firstName}</p><h1>Your visitor desk at a glance</h1><p className="page-subtitle">Here’s what’s happening across {settings?.companyName || "your workspace"} today.</p></div>
        <div className="today-chip"><span className="today-dot" />{new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeZone: safeTimeZone }).format(new Date())}</div>
      </section>

      <section className="metric-grid" aria-label="Today's visitor metrics">
        <article className="metric-card metric-primary"><div className="metric-top"><span>Arrivals today</span><span className="metric-icon">↘</span></div><strong>{todayCount}</strong><p>Visits recorded today</p><span className="metric-accent" /></article>
        <article className="metric-card"><div className="metric-top"><span>Not checked out</span><span className="metric-icon amber">◷</span></div><strong>{openCount}</strong><p>Records without a departure time</p></article>
        {teamCount !== null && <article className="metric-card"><div className="metric-top"><span>Active team</span><span className="metric-icon violet">♧</span></div><strong>{teamCount}</strong><p>Staff accounts enabled</p></article>}
        <article className="metric-card metric-note"><span className="note-icon">✳</span><strong>Welcome, well managed.</strong><p>Visitor records stay organized here, so reception can focus on the people arriving.</p></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel arrivals-panel">
          <div className="panel-heading"><div><p className="eyebrow">LIVE ACTIVITY</p><h2>Recent arrivals</h2></div><Link className="text-link" href="/back-office/visits">All visitor records <span>→</span></Link></div>
          {recentVisits.length === 0 ? (
            <div className="empty-state"><span className="empty-icon">▤</span><strong>No visits recorded yet</strong><p>New visitor check-ins will appear here as they arrive.</p></div>
          ) : (
            <div className="table-scroll"><table className="data-table"><thead><tr><th>VISITOR</th><th>HOST</th><th>PURPOSE</th><th>ARRIVED</th><th>STATUS</th></tr></thead><tbody>
              {recentVisits.map((visit) => <tr key={visit.id}><td><Link className="record-name-link" href={`/back-office/visits/${visit.id}`}><strong>{visit.visitorFullName}</strong></Link><small>{visit.isPersonalVisit ? "Personal visit" : visit.visitorCompanyName || "Company not supplied"}</small></td><td>{visit.hostNameSnapshot}</td><td>{visit.purposeNameSnapshot}</td><td>{formatInTimeZone(visit.checkedInAt, safeTimeZone)}</td><td><span className={`status-pill ${visit.checkedOutAt ? "status-complete" : "status-open"}`}><i />{visit.checkedOutAt ? "Checked out" : "Not checked out"}</span></td></tr>)}
            </tbody></table></div>
          )}
          <div className="table-footnote">“Not checked out” means the visit has no recorded departure time.</div>
        </article>
        <aside className="panel quick-panel"><p className="eyebrow">QUICK ACCESS</p><h2>Keep things moving</h2><p className="quick-intro">Jump into the tools you use most.</p>
          <Link href="/back-office/visits" className="quick-link"><span className="quick-link-icon green">▤</span><span><strong>Browse visitor records</strong><small>Search, review, and follow up</small></span><b>→</b></Link>
          {user.role === "ADMINISTRATOR" && <>
            <Link href="/back-office/team" className="quick-link"><span className="quick-link-icon purple">♧</span><span><strong>Manage your team</strong><small>Review staff accounts</small></span><b>→</b></Link>
            <Link href="/back-office/settings" className="quick-link"><span className="quick-link-icon gold">⚙</span><span><strong>Workspace settings</strong><small>Company, departments, purposes</small></span><b>→</b></Link>
          </>}
          <div className="quick-tip"><span>✦</span><p>Keep company settings up to date so visitors see the right details at check-in.</p></div>
        </aside>
      </section>
    </AdminShell>
  );
}
