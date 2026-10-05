import Link from "next/link";
import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { acceptInvitation } from "./actions";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token || "";
  const validFormat = /^[\w-]{40,60}$/.test(token);
  const tokenHash = validFormat ? createHash("sha256").update(token).digest("hex") : "invalid";
  const [invitation, departments] = await Promise.all([
    prisma.invitation.findUnique({ where: { tokenHash } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const usable = !!invitation && !invitation.acceptedAt && invitation.expiresAt > new Date();

  return (
    <main className="auth-page invite-accept-page">
      <section className="auth-card">
        <Link href="/back-office" className="auth-back">← Staff sign in</Link>
        <div className="auth-emblem">V</div>
        <p className="eyebrow">STAFF ACCOUNT</p>
        <h1>{usable ? "Set up your profile" : "Invitation unavailable"}</h1>
        {!usable ? <><p className="auth-description">This invitation link has expired, was already used, or is not valid. Ask your administrator to create a new one.</p><Link className="primary-button invite-back-button" href="/back-office">Return to staff sign in <span>→</span></Link></> : <>
          <p className="auth-description">Complete your profile for <strong>{invitation.email}</strong>. Your role is {invitation.role.toLowerCase()}.</p>
          {params.error && <p className="form-alert" role="alert">{params.error === "details" ? "Complete each field and use a matching password with at least 12 characters." : params.error === "department" ? "Choose an active department from the list." : "This invitation link is no longer available."}</p>}
          <form action={acceptInvitation} className="auth-form"><input type="hidden" name="token" value={token} />
            <label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autoComplete="given-name" maxLength={80} required />
            <label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" autoComplete="family-name" maxLength={80} required />
            {invitation.role === "EMPLOYEE" && <><label htmlFor="departmentId">Department</label><select id="departmentId" name="departmentId" defaultValue="" required><option value="" disabled>Select your department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></>}
            <label htmlFor="password">Create password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
            <button className="primary-button" type="submit">Complete account setup <span>→</span></button>
          </form>
          <p className="auth-footnote">This one-time invitation expires {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(invitation.expiresAt)}.</p>
        </>}
      </section>
      <aside className="auth-aside"><div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" /><div className="aside-content"><span className="aside-tag"><i /> YOUR TEAM WORKSPACE</span><h2>Good teamwork begins with a warm welcome.</h2><p>Your staff account helps make each visitor’s arrival organized and personal.</p></div><span className="aside-footer">VISITOR SYSTEM <span>·</span> STAFF WORKSPACE</span></aside>
    </main>
  );
}
