import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/app/back-office/actions";
import { getAuthenticatedUser } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function BackOfficeSignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (user) redirect("/back-office/dashboard");

  const [{ error }, administrators] = await Promise.all([
    searchParams,
    prisma.user.count({ where: { role: "ADMINISTRATOR", status: "ACTIVE" } }),
  ]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="auth-back">← Visitor System</Link>
        <div className="auth-emblem">V</div>
        <p className="eyebrow">VISITOR ADMINISTRATION</p>
        <h1>Welcome back</h1>
        <p className="auth-description">Sign in to manage your visitor desk and company workspace.</p>
        {error === "credentials" && <p className="form-alert" role="alert">That email and password combination was not recognized.</p>}
        {error === "session" && <p className="form-alert" role="alert">Your session ended. Please sign in again.</p>}
        <form action={signIn} className="auth-form">
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" autoComplete="username" placeholder="you@company.com" required maxLength={254} />
          <div className="password-label"><label htmlFor="password">Password</label><span>Use your staff account</span></div>
          <input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={256} />
          <button className="primary-button" type="submit">Sign in <span aria-hidden="true">→</span></button>
        </form>
        {administrators === 0 && (
          <div className="setup-note">
            <strong>First-time setup</strong>
            <p>Create the first administrator from the project terminal with <code>npm run admin:create</code>.</p>
          </div>
        )}
        <p className="auth-footnote">Your account is protected with secure, time-limited sign-in.</p>
      </section>
      <aside className="auth-aside">
        <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
        <div className="aside-content">
          <span className="aside-tag"><i /> VISITOR OPERATIONS</span>
          <h2>A smoother welcome starts here.</h2>
          <p>Keep arrivals organized, help your team stay informed, and make every visit feel considered.</p>
          <div className="aside-stat"><span className="aside-stat-mark">✳</span><span><strong>One calm place to manage the day</strong><small>Your visitor workspace</small></span></div>
        </div>
        <span className="aside-footer">VISITOR SYSTEM <span>·</span> STAFF WORKSPACE</span>
      </aside>
    </main>
  );
}
