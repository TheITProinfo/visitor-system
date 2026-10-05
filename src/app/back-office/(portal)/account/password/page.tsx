import { AdminShell } from "@/components/admin-shell";
import { requireUser } from "@/server/auth";
import { changePassword } from "./actions";

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; result?: string }>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);

  return (
    <AdminShell user={user} active="account">
      <section className="page-heading-row">
        <div>
          <p className="eyebrow">ACCOUNT SECURITY</p>
          <h1>Change password</h1>
          <p className="page-subtitle">Verify your current password before choosing a new one.</p>
        </div>
      </section>
      {params.result === "updated" && <p className="settings-message" role="status">Your password has been updated.</p>}
      {params.error && <p className="settings-message is-error" role="alert">
        {params.error === "current" ? "Your current password is incorrect." : params.error === "same" ? "Choose a new password different from your current password." : "Use a new password with at least 12 characters and make sure both new-password fields match."}
      </p>}
      <section className="panel settings-card" style={{ maxWidth: 640 }}>
        <div className="panel-heading"><div><p className="eyebrow">PASSWORD</p><h2>Update your sign-in</h2></div></div>
        <form action={changePassword} className="auth-form">
          <label htmlFor="currentPassword">Current password</label>
          <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} />
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
          <p className="auth-footnote">Use at least 12 characters. Your password is stored as a salted scrypt hash.</p>
          <button className="primary-button" type="submit">Update password <span aria-hidden="true">→</span></button>
        </form>
      </section>
    </AdminShell>
  );
}
