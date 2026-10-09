import { AdminShell } from "@/components/admin-shell";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import {
  saveAiProviderSettings, testAiProvider, enableAiProvider, disableAiProvider,
  saveCopilotSettings, enableCopilotApi, disableCopilotApi, saveAiReportSchedule,
  testAiReportSchedule, enableAiReportSchedule, disableAiReportSchedule, reviewEntraLink,
} from "./actions";

const messages:Record<string,string>={
  "ai-invalid":"Review the provider, model, endpoint, and usage limits.",
  "ai-key-required":"Enter an API key before saving provider settings.",
  "ai-saved-test-required":"Settings saved. Test the connection before enabling the assistant.",
  "ai-saved":"Provider settings saved.",
  "ai-tested":"Provider connection succeeded. You may enable AI.",
  "ai-test-required":"Save and successfully test the current provider settings first.",
  "ai-enabled":"AI assistant enabled.",
  "ai-disabled":"AI assistant disabled.",
  "ai-not-configured":"Complete and save provider settings first.",
  "copilot-invalid":"Enter valid Microsoft Entra application IDs and an API audience.",
  "copilot-secret-required":"Enter the confidential client secret before saving.",
  "copilot-saved-disabled":"Copilot settings saved and disabled. Review and enable them when ready.",
  "copilot-saved":"Copilot settings saved.",
  "copilot-enabled":"Copilot read-only API enabled.",
  "copilot-disabled":"Copilot API disabled.",
  "copilot-incomplete":"Complete all Copilot application settings first.",
  "report-invalid":"Choose a valid cadence and local send time.",
  "report-recipients-required":"Select at least one active administrator recipient.",
  "report-recipients-invalid":"One or more selected recipients are no longer active administrators.",
  "report-saved-test-required":"Schedule saved and disabled. Send a preview before enabling.",
  "report-save-and-select-yourself":"Save the schedule and include your admin account to send a preview.",
  "report-preview-failed":"Preview email could not be sent. Check SMTP settings and retry.",
  "report-preview-sent":"Test preview sent to your account. The schedule remains disabled until enabled.",
  "report-smtp-required":"Configure and test SMTP before enabling scheduled reports.",
  "report-test-required":"Save the schedule and send a successful preview before enabling.",
  "report-enabled":"Scheduled report enabled.",
  "report-disabled":"Scheduled report disabled.",
  "entra-link-approved":"Microsoft identity link approved.",
  "entra-link-rejected":"Microsoft identity link rejected.",
  "entra-tenant-mismatch":"The requested Microsoft identity is outside the configured tenant.",
  "entra-user-mismatch":"The verified identity email must match an active local account.",
  "entra-identity-already-linked":"That Microsoft identity is already linked to another account.",
};
type Props={searchParams:Promise<{result?:string}>};

export default async function AiSettingsPage({searchParams}:Props) {
  const user=await requireUser(["ADMINISTRATOR"]);
  const [{result},settings,admins,schedule,pending,smtp]=await Promise.all([
    searchParams,
    prisma.companySettings.findFirst({select:{
      id:true,timeZone:true,aiProvider:true,aiEndpoint:true,aiModel:true,aiEnabled:true,aiApiKeyEncrypted:true,
      aiConnectionTestedAt:true,aiConfigurationHash:true,aiTestedConfigurationHash:true,aiRequestsPerUserPerDay:true,aiMaxTokensPerMonth:true,aiPausedUntil:true,
      copilotEnabled:true,copilotTenantId:true,copilotApiAudience:true,copilotConnectorClientId:true,copilotLoginClientId:true,copilotLoginClientSecretEncrypted:true,
    }}),
    prisma.user.findMany({where:{role:"ADMINISTRATOR",status:"ACTIVE"},orderBy:{email:"asc"},select:{id:true,email:true,firstName:true,lastName:true}}),
    prisma.aiReportSchedule.findFirst(),
    prisma.entraLinkRequest.findMany({where:{status:"PENDING"},orderBy:{createdAt:"asc"},include:{user:{select:{email:true,firstName:true,lastName:true}}}}),
    prisma.companySettings.findFirst({select:{smtpHost:true,smtpPort:true,smtpUsername:true,smtpPasswordEncrypted:true,smtpSenderEmail:true}}),
  ]);
  const aiTested=Boolean(settings?.aiConnectionTestedAt&&settings.aiConfigurationHash===settings.aiTestedConfigurationHash);
  const smtpConfigured=Boolean(smtp?.smtpHost&&smtp.smtpPort&&smtp.smtpUsername&&smtp.smtpPasswordEncrypted&&smtp.smtpSenderEmail);
  const isMessage=result?messages[result]||(/ai-test-failed-/.test(result)?"The provider connection test failed. Verify endpoint, model, credentials, and network access.":null):null;
  return <AdminShell user={user} active="settings">
    <div className="page-heading"><div><p className="eyebrow">AI & INTEGRATIONS</p><h1>AI configuration</h1><p>Configure one AI provider for the assistant and scheduled summaries. Keys are encrypted at rest.</p></div></div>
    {isMessage&&<div className="settings-message" role="status">{isMessage}</div>}
    {result&&!isMessage&&<div className="settings-message is-error" role="alert">The requested operation could not be completed: {result.replaceAll("-"," ")}.</div>}
    <div className="settings-grid">
      <section className="panel settings-card">
        <div className="panel-heading"><div><p className="eyebrow">MODEL PROVIDER</p><h2>AI assistant</h2></div><span className="quiet-badge">{settings?.aiEnabled?"ENABLED":"DISABLED"}</span></div>
        <form action={saveAiProviderSettings} className="settings-form">
          <label>Provider<select name="provider" defaultValue={settings?.aiProvider||"OPENAI"}><option value="OPENAI">OpenAI API</option><option value="AZURE_OPENAI">Azure OpenAI</option></select></label>
          <label>Azure OpenAI endpoint<input name="endpoint" type="url" defaultValue={settings?.aiEndpoint||""} placeholder="https://your-resource.openai.azure.com" /><small>Required for Azure OpenAI. OpenAI uses its standard API endpoint.</small></label>
          <label>Model or deployment name<input name="model" defaultValue={settings?.aiModel||""} maxLength={120} required placeholder="gpt-4.1-mini or deployment name" /></label>
          <label>API key<input name="apiKey" type="password" autoComplete="new-password" maxLength={2000} placeholder={settings?.aiApiKeyEncrypted?"Saved securely — leave blank to keep it":"Enter API key"} required={!settings?.aiApiKeyEncrypted} /></label>
          <div className="settings-two-fields"><label>Requests per user/day<input name="requestsPerUserPerDay" type="number" min="1" max="500" defaultValue={settings?.aiRequestsPerUserPerDay??30}/></label><label>Monthly token cap<input name="maxTokensPerMonth" type="number" min="1000" max="100000000" defaultValue={settings?.aiMaxTokensPerMonth??100000}/></label></div>
          <small>Assistant scope is read-only: arrival counts, date-range statistics, open visits and host/purpose filters. It does not send visitor records to the model for lookup. Requests are limited and audit metadata is retained for 90 days.</small>
          <button className="primary-button compact-button" type="submit">Save provider settings <span>→</span></button>
        </form>
        <div className="test-email-form">
          <span>Connection: {aiTested?"tested for current settings":"test required"}{settings?.aiConnectionTestedAt?" · "+settings.aiConnectionTestedAt.toLocaleString():""}</span>
          <form action={testAiProvider}><button className="filter-button" type="submit">Test connection</button></form>
          {settings?.aiEnabled?<form action={disableAiProvider}><button className="filter-button" type="submit">Disable AI</button></form>:<form action={enableAiProvider}><button className="filter-button" type="submit" disabled={!aiTested}>Enable AI</button></form>}
        </div>
        {settings?.aiPausedUntil&&settings.aiPausedUntil>new Date()&&<p className="settings-help">Usage cap pause ends {settings.aiPausedUntil.toLocaleDateString()}.</p>}
      </section>
      <section className="panel settings-card">
        <div className="panel-heading"><div><p className="eyebrow">MICROSOFT COPILOT STUDIO</p><h2>Read-only integration</h2></div><span className="quiet-badge">{settings?.copilotEnabled?"ENABLED":"DISABLED"}</span></div>
        <p className="settings-help">Configure one Microsoft Entra tenant for this deployment. Copilot Studio calls the separate API using delegated identity; only approved, active local accounts can query aggregate information.</p>
        <form action={saveCopilotSettings} className="settings-form">
          <label>Entra tenant ID<input name="tenantId" defaultValue={settings?.copilotTenantId||""} maxLength={80} required /></label>
          <label>API audience / Application ID URI<input name="audience" defaultValue={settings?.copilotApiAudience||""} maxLength={200} required placeholder="api://..." /></label>
          <label>Copilot connector application (client) ID<input name="connectorClientId" defaultValue={settings?.copilotConnectorClientId||""} maxLength={80} required /></label>
          <label>Confidential client ID for staff identity verification<input name="loginClientId" defaultValue={settings?.copilotLoginClientId||""} maxLength={80} required /></label>
          <label>Confidential client secret<input name="loginClientSecret" type="password" autoComplete="new-password" maxLength={2000} placeholder={settings?.copilotLoginClientSecretEncrypted?"Saved securely — leave blank to keep it":"Enter secret"} required={!settings?.copilotLoginClientSecretEncrypted}/></label>
          <small>Register the app in Entra and configure the approved redirect URL shown in the setup guide. Do not enable until delegated scopes, audience, connector identity and tenant have been verified.</small>
          <button className="primary-button compact-button" type="submit">Save Copilot settings <span>→</span></button>
        </form>
        <div className="test-email-form">{settings?.copilotEnabled?<form action={disableCopilotApi}><button className="filter-button" type="submit">Disable API</button></form>:<form action={enableCopilotApi}><button className="filter-button" type="submit">Enable API</button></form>}</div>
        <h3>Microsoft identity link requests</h3>
        {pending.length===0?<p className="settings-help">No staff identity requests are waiting for review.</p>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Local account</th><th>Verified identity</th><th>Verified</th><th>Review</th></tr></thead><tbody>{pending.map((item)=><tr key={item.id}><td>{[item.user.firstName,item.user.lastName].filter(Boolean).join(" ")||item.user.email}<br/><small>{item.user.email}</small></td><td>{item.email||"No email claim"}<br/><small>{item.displayName||"Microsoft account"}</small></td><td>{item.verifiedAt.toLocaleString()}</td><td><div className="inline-actions"><form action={reviewEntraLink}><input type="hidden" name="requestId" value={item.id}/><input type="hidden" name="decision" value="approve"/><button className="filter-button" type="submit">Approve</button></form><form action={reviewEntraLink}><input type="hidden" name="requestId" value={item.id}/><input type="hidden" name="decision" value="reject"/><button className="filter-button" type="submit">Reject</button></form></div></td></tr>)}</tbody></table></div>}
      </section>
      <section className="panel settings-card">
        <div className="panel-heading"><div><p className="eyebrow">AUTOMATED REPORTS</p><h2>Daily or weekly email</h2></div><span className="quiet-badge">{schedule?.enabled?"ENABLED":"DISABLED"}</span></div>
        <p className="settings-help">Reports cover the previous completed local day or week. Emails go only to selected active administrators. A model failure leaves exact system-calculated counts in the email and marks the AI summary unavailable.</p>
        <form action={saveAiReportSchedule} className="settings-form">
          <label>Frequency<select name="cadence" defaultValue={schedule?.cadence||"DAILY"}><option value="DAILY">Daily</option><option value="WEEKLY">Weekly (Monday)</option></select></label>
          <label>Send time ({settings?.timeZone||"UTC"})<input name="sendTime" type="time" defaultValue={schedule?.sendTime||"09:00"} required/></label>
          <fieldset className="settings-form"><legend>Administrator recipients</legend>{admins.map((admin)=><label className="settings-checkbox" key={admin.id}><input type="checkbox" name="recipientUserIds" value={admin.id} defaultChecked={schedule?.recipientUserIds.includes(admin.id)??admin.id===user.id}/>{[admin.firstName,admin.lastName].filter(Boolean).join(" ")||admin.email} ({admin.email})</label>)}</fieldset>
          <button className="primary-button compact-button" type="submit">Save report schedule <span>→</span></button>
        </form>
        <div className="test-email-form"><form action={testAiReportSchedule}><button className="filter-button" type="submit" disabled={!smtpConfigured}>Send test preview to me</button></form>{schedule?.enabled?<form action={disableAiReportSchedule}><button className="filter-button" type="submit">Disable schedule</button></form>:<form action={enableAiReportSchedule}><button className="filter-button" type="submit" disabled={!schedule?.testedAt}>Enable schedule</button></form>}</div>
        <p className="settings-help">Configured next delivery: {schedule?.nextRunAt?.toLocaleString()||"not scheduled"}. Schedule delivery uses the application process and requires at least one running server instance.</p>
      </section>
    </div>
  </AdminShell>;
}
