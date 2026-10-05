import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { AdminShell } from "@/components/admin-shell";
import { InvitationSubmitButton } from "@/components/invitation-submit-button";
import { createStaffInvitation, toggleStaffAccess } from "./actions";

const statusLabels = { ACTIVE: "Active", INVITED: "Invited", DEACTIVATED: "Deactivated" } as const;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string; error?: string; result?: string; delivery?: string }> }) {
  const user = await requireUser(["ADMINISTRATOR"]);
  const params = await searchParams;
  const [staff, pendingInvitations] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { lastName: "asc" }, { email: "asc" }],
      select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true, department: { select: { name: true } } },
    }),
    prisma.invitation.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
    }),
  ]);
  const activeCount = staff.filter((member) => member.status === "ACTIVE").length;
  const invitationUrl = params.invite?.startsWith("http://") || params.invite?.startsWith("https://") ? params.invite : "";

  return (
    <AdminShell user={user} active="team">
      <section className="page-heading-row"><div><p className="eyebrow">ACCESS &amp; DIRECTORY</p><h1>People</h1><p className="page-subtitle">Manage staff access and the employee directory used for visitor host search.</p></div><span className="result-count">{staff.length} accounts</span></section>
      <section className="team-summary"><article className="team-stat"><span>Active accounts</span><strong>{activeCount}</strong></article><article className="team-stat"><span>Invitations pending</span><strong>{pendingInvitations.length}</strong></article><article className="team-note"><span>↗</span><p>Deactivated staff can no longer sign in or appear in host search. Their historical visit records remain available.</p></article></section>
      {params.error && <p className="settings-message is-error" role="alert">{params.error === "account-exists" ? "An account already uses that email address." : params.error === "invite-details" ? "Enter a valid email and choose Employee or Receptionist." : params.error === "last-admin" ? "The last active Administrator cannot be deactivated." : "That account action could not be completed."}</p>}
      {params.result === "access-updated" && <p className="settings-message" role="status">Staff access updated.</p>}
      {invitationUrl && <section className="invite-link-panel"><div><strong>{params.delivery === "sent" ? "Invitation email sent" : "Invitation created — email could not be sent"}</strong><p>{params.delivery === "sent" ? `A setup link was emailed to ${params.email || "the staff member"}. Keep this backup link for sharing if needed.` : `Share this one-time setup link with ${params.email || "the staff member"}. Configure SMTP or check its settings to send invitations by email. It expires in 7 days.`}</p><input aria-label="One-time invitation link" readOnly value={invitationUrl} /></div></section>}
      <section className="panel invite-panel"><div className="panel-heading"><div><p className="eyebrow">ADD TO YOUR WORKSPACE</p><h2>Invite a staff member</h2></div><span className="quiet-badge">Expires after 7 days</span></div><form action={createStaffInvitation} className="invite-form"><label>Work email<input name="email" type="email" maxLength={254} placeholder="teammate@company.com" required /></label><label>Role<select name="role" defaultValue="EMPLOYEE"><option value="EMPLOYEE">Employee</option><option value="RECEPTIONIST">Receptionist</option></select></label><InvitationSubmitButton /></form><p className="table-footnote">When you create an invitation, keep this page open while the email is sent. A copyable link appears when delivery completes.</p></section>
      <section className="panel records-panel pending-invitations-panel"><div className="panel-heading team-heading"><div><p className="eyebrow">AWAITING ACCEPTANCE</p><h2>Pending invitations</h2></div><span className="quiet-badge">{pendingInvitations.length} pending</span></div>
        {pendingInvitations.length === 0 ? <p className="list-empty pending-empty">There are no pending invitations.</p> :
          <div className="table-scroll"><table className="data-table"><thead><tr><th>INVITEE</th><th>ROLE</th><th>INVITED</th><th>EXPIRES</th><th>STATUS</th></tr></thead><tbody>
            {pendingInvitations.map((invitation) => <tr key={invitation.id}><td><strong>{invitation.email}</strong></td><td><span className="role-label">{invitation.role.toLowerCase().replace("_", " ")}</span></td><td>{invitation.createdAt.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })}</td><td>{invitation.expiresAt.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })}</td><td><span className="status-pill status-pending"><i />Pending</span></td></tr>)}
          </tbody></table></div>}
        <div className="table-footnote">Expired or accepted invitations are removed from this list.</div>
      </section>
      <section className="panel records-panel"><div className="panel-heading team-heading"><div><p className="eyebrow">STAFF DIRECTORY</p><h2>Staff accounts</h2></div><span className="quiet-badge">Email · role · access</span></div>
        {staff.length === 0 ? <div className="empty-state records-empty"><span className="empty-icon">♧</span><strong>No staff accounts yet</strong><p>Create the first administrator from the project terminal. Then use this page to invite employee and receptionist accounts.</p></div> :
          <div className="table-scroll"><table className="data-table"><thead><tr><th>TEAM MEMBER</th><th>DEPARTMENT</th><th>ROLE</th><th>ACCESS STATUS</th><th>ACTION</th></tr></thead><tbody>
            {staff.map((member) => { const name = [member.firstName, member.lastName].filter(Boolean).join(" "); return <tr key={member.id}><td><strong>{name || "Profile incomplete"}</strong><small>{member.email}</small></td><td>{member.department?.name || "—"}</td><td><span className="role-label">{member.role.toLowerCase().replace("_", " ")}</span></td><td><span className={`status-pill ${member.status === "ACTIVE" ? "status-complete" : member.status === "INVITED" ? "status-pending" : "status-muted"}`}><i />{statusLabels[member.status]}</span></td><td>{member.status !== "INVITED" && member.id !== user.id && <form action={toggleStaffAccess}><input type="hidden" name="id" value={member.id} /><button className={`text-action ${member.status === "ACTIVE" ? "deactivate-action" : "activate-action"}`}>{member.status === "ACTIVE" ? "Deactivate" : "Reactivate"}</button></form>}</td></tr>; })}
          </tbody></table></div>}
        <div className="table-footnote">Invited staff set a password and complete their directory profile before their account is activated. Role restrictions apply throughout the portal.</div>
      </section>
    </AdminShell>
  );
}
