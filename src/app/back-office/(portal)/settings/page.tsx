import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { createDepartment, createPurpose, saveAgreementTemplate, saveCompanySettings, saveSmtpSettings, savePrinterSettings, sendSmtpTestEmail, toggleDepartment, togglePurpose } from "./actions";
import { AdminShell } from "@/components/admin-shell";
import { toTimeZoneInput } from "@/server/time-zones";

const messages: Record<string, string> = {
  saved: "Company settings saved.",
  "company-required": "Company name is required.",
  "timezone-invalid": "Enter a valid IANA time zone, for example America/New_York.",
  "department-required": "Enter a department name.",
  "department-exists": "That department already exists.",
  "department-added": "Department added.",
  "department-updated": "Department status updated.",
  "purpose-required": "Enter a visit purpose.",
  "purpose-exists": "That visit purpose already exists.",
  "purpose-added": "Visit purpose added.",
  "purpose-updated": "Visit purpose status updated.",
  "agreement-saved": "Visitor agreement template saved.",
  "smtp-saved": "Email delivery settings saved. Send a test email to verify them.",
  "smtp-invalid": "Check the SMTP host, port, username, sender name, and sender email.",
  "smtp-tls-mismatch": "For Gmail on port 587, uncheck implicit TLS (Gmail uses STARTTLS). Use implicit TLS with port 465.",
  "smtp-password-required": "Enter the SMTP password to save email delivery settings.",
  "test-email-invalid": "Enter a valid address to receive the test email.",
  "test-email-sent": "Test email sent successfully.",
  "test-email-failed": "The test email could not be sent. Check the SMTP settings and server access, then try again.",
  "test-email-auth-failed": "The SMTP server rejected the login. Check the username and use a provider-approved app password or authentication method.",
  "test-email-connection-failed": "The app could not connect to the SMTP server. Check its host, port, TLS mode, and network access.",
  "printer-saved": "Badge printer settings saved.",
  "printer-invalid": "Label width and height must each be between 10 and 200 millimeters.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const user = await requireUser(["ADMINISTRATOR"]);
  const [params, company, departments, purposes] = await Promise.all([
    searchParams,
    prisma.companySettings.findFirst(),
    prisma.department.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.visitPurpose.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
  ]);
  const smtpConfigured = Boolean(company?.smtpHost && company.smtpPort && company.smtpUsername && company.smtpPasswordEncrypted && company.smtpSenderEmail);
  const savedSmtpTlsMismatch = Boolean(company && ((company.smtpPort === 587 && company.smtpSecure) || (company.smtpPort === 465 && !company.smtpSecure)));
  const displayedResult = params.result === "test-email-failed" && savedSmtpTlsMismatch ? "smtp-tls-mismatch" : params.result;

  return (
    <AdminShell user={user} active="settings">
      <section className="page-heading-row"><div><p className="eyebrow">WORKSPACE PREFERENCES</p><h1>Configuration</h1><p className="page-subtitle">Set company details and maintain the lists used in the visitor experience.</p></div><span className="result-count">ADMINISTRATOR</span></section>
      {displayedResult && messages[displayedResult] && <p className={`settings-message ${displayedResult.endsWith("required") || displayedResult.endsWith("invalid") || displayedResult.endsWith("exists") || displayedResult.endsWith("failed") || displayedResult.endsWith("mismatch") ? "is-error" : ""}`} role="status">{messages[displayedResult]}</p>}
      <div className="settings-grid">
        <section className="panel settings-card company-settings"><div className="panel-heading"><div><p className="eyebrow">COMPANY PROFILE</p><h2>Organization details</h2></div><span className="settings-card-icon green">⌂</span></div>
          <form action={saveCompanySettings} className="settings-form">
            <label>Company name<input name="companyName" defaultValue={company?.companyName || ""} placeholder="Your organization" maxLength={120} required /></label>
            <label>Address <span className="optional-label">OPTIONAL</span><textarea name="address" defaultValue={company?.address || ""} rows={3} maxLength={500} placeholder="Street, city, postal code" /></label>
            <label>Company time zone<input name="timeZone" defaultValue={toTimeZoneInput(company?.timeZone || "UTC")} placeholder="America/New_York or UTC -5" maxLength={100} required /><small>Use a region such as America/New_York for daylight saving, or a fixed offset such as UTC -5.</small></label>
            <button className="primary-button compact-button" type="submit">Save company details <span>→</span></button>
          </form>
        </section>
        <section className="panel settings-card"><div className="panel-heading"><div><p className="eyebrow">ORGANIZATION</p><h2>Departments</h2></div><span className="settings-card-icon purple">♧</span></div>
          <form action={createDepartment} className="inline-create"><label className="sr-only" htmlFor="new-department">Department name</label><input id="new-department" name="name" placeholder="Add a department" maxLength={80} required /><button aria-label="Add department">+</button></form>
          <ul className="settings-list">{departments.map((department) => <li key={department.id}><span><strong>{department.name}</strong><small>{department.isActive ? "Available for staff profiles" : "Inactive"}</small></span><form action={toggleDepartment}><input type="hidden" name="id" value={department.id} /><button className={`text-action ${department.isActive ? "deactivate-action" : "activate-action"}`}>{department.isActive ? "Deactivate" : "Activate"}</button></form></li>)}</ul>
          {departments.length === 0 && <p className="list-empty">No departments added yet.</p>}
        </section>
        <section className="panel settings-card"><div className="panel-heading"><div><p className="eyebrow">VISITOR EXPERIENCE</p><h2>Visit purposes</h2></div><span className="settings-card-icon gold">✳</span></div>
          <form action={createPurpose} className="inline-create"><label className="sr-only" htmlFor="new-purpose">Visit purpose</label><input id="new-purpose" name="name" placeholder="Add a visit purpose" maxLength={100} required /><button aria-label="Add visit purpose">+</button></form>
          <ul className="settings-list">{purposes.map((purpose) => <li key={purpose.id}><span><strong>{purpose.name}</strong><small>{purpose.isActive ? "Shown during check-in" : "Inactive"}</small></span><form action={togglePurpose}><input type="hidden" name="id" value={purpose.id} /><button className={`text-action ${purpose.isActive ? "deactivate-action" : "activate-action"}`}>{purpose.isActive ? "Deactivate" : "Activate"}</button></form></li>)}</ul>
          {purposes.length === 0 && <p className="list-empty">No visit purposes added yet.</p>}
        </section>
        <section className="panel settings-card"><div className="panel-heading"><div><p className="eyebrow">VISITOR EXPERIENCE</p><h2>Agreement template</h2></div><span className="settings-card-icon green">✎</span></div>
          <form action={saveAgreementTemplate} className="settings-form"><label>Agreement text<textarea name="agreementText" defaultValue={company?.agreementText || ""} rows={8} maxLength={12000} placeholder="Enter the visitor agreement shown during check-in." /><small>This saves the agreement text for the visitor check-in flow. Signature capture will be added with that workflow.</small></label><button className="primary-button compact-button" type="submit">Save agreement template <span>→</span></button></form>
        </section>
        <section className="panel settings-card"><div className="panel-heading"><div><p className="eyebrow">EMAIL DELIVERY</p><h2>SMTP settings</h2></div><span className={`quiet-badge ${smtpConfigured ? "configured-badge" : ""}`}>{smtpConfigured ? "CONFIGURED" : "NOT CONFIGURED"}</span></div>
          <form action={saveSmtpSettings} className="settings-form">
            <label>SMTP host<input name="smtpHost" defaultValue={company?.smtpHost || ""} placeholder="smtp.example.com" maxLength={253} required /></label>
            <div className="settings-two-fields"><label>Port<input name="smtpPort" type="number" min="1" max="65535" defaultValue={company?.smtpPort || 587} required /></label><label className="settings-checkbox"><input name="smtpSecure" type="checkbox" defaultChecked={company?.smtpSecure ?? false} />Use implicit TLS (port 465)</label></div>
            <label>SMTP username<input name="smtpUsername" defaultValue={company?.smtpUsername || ""} autoComplete="username" maxLength={254} required /></label>
            <label>SMTP password<input name="smtpPassword" type="password" autoComplete="new-password" placeholder={company?.smtpPasswordEncrypted ? "Saved securely — leave blank to keep it" : "Enter SMTP password"} maxLength={500} /></label>
            <div className="settings-two-fields"><label>Sender name<input name="smtpSenderName" defaultValue={company?.smtpSenderName || company?.companyName || ""} maxLength={120} required /></label><label>Sender email<input name="smtpSenderEmail" type="email" defaultValue={company?.smtpSenderEmail || ""} maxLength={254} required /></label></div>
            <small>The password is encrypted before it is stored and is never shown again. Gmail: port 587 with implicit TLS off, or port 465 with implicit TLS on. Gmail password sign-in may require an app password.</small>
            <button className="primary-button compact-button" type="submit">Save email settings <span>→</span></button>
          </form>
          <form action={sendSmtpTestEmail} className="test-email-form"><label>Send test email to<input name="testEmail" type="email" placeholder="you@example.com" maxLength={254} required /></label><button className="filter-button" type="submit" disabled={!smtpConfigured}>Send test email</button></form>
          {!smtpConfigured && <p className="settings-help">Save complete SMTP settings before sending a test. Staff invitations will use this mail server; visitor and host notices will be added with check-in.</p>}
        </section>
        <section className="panel settings-card"><div className="panel-heading"><div><p className="eyebrow">BADGE PRINTING</p><h2>Printer settings</h2></div><span className="settings-card-icon muted-icon">⌘</span></div>
          <form action={savePrinterSettings} className="settings-form">
            <label className="settings-checkbox"><input name="printerEnabled" type="checkbox" defaultChecked={company?.printerEnabled || false} />Enable badge printing</label>
            <label>Printer model<input name="printerModel" defaultValue={company?.printerModel || ""} placeholder="Brother model" maxLength={120} /></label>
            <label>Printer connection details<input name="printerAddress" defaultValue={company?.printerAddress || ""} placeholder="Local print bridge or network address" maxLength={500} /><small>For example, the address used by the local print bridge. Do not enter a public password here.</small></label>
            <div className="settings-two-fields"><label>Label width (mm)<input name="badgeLabelWidthMm" type="number" min="10" max="200" defaultValue={company?.badgeLabelWidthMm ?? ""} /></label><label>Label height (mm)<input name="badgeLabelHeightMm" type="number" min="10" max="200" defaultValue={company?.badgeLabelHeightMm ?? ""} /></label></div>
            <button className="primary-button compact-button" type="submit">Save badge settings <span>→</span></button>
          </form><p className="settings-help">These preferences are saved now. Live printing needs the Brother model and a verified local print bridge; the cloud app cannot directly access a printer on the reception network.</p>
        </section>
      </div>
    </AdminShell>
  );
}
