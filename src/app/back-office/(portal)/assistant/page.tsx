import { AdminShell } from "@/components/admin-shell";
import { AiAssistant } from "@/components/ai-assistant";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";

export default async function AssistantPage() {
  const user = await requireUser(["ADMINISTRATOR", "RECEPTIONIST"]);
  const settings = await prisma.companySettings.findFirst({ select: { companyName: true, aiEnabled: true, timeZone: true } });

  return (
    <AdminShell user={user} active="assistant">
      <section className="page-heading-row">
        <div><p className="eyebrow">READ-ONLY OPERATIONS</p><h1>AI visitor assistant</h1><p className="page-subtitle">Ask about arrivals, checkout status, or visits by host and purpose.</p></div>
        <span className={`quiet-badge ${settings?.aiEnabled ? "configured-badge" : ""}`}>{settings?.aiEnabled ? "AI ENABLED" : "AI NOT ENABLED"}</span>
      </section>
      {!settings?.aiEnabled && <p className="settings-message is-error" role="status">An administrator must configure, test, and enable an AI provider before you can ask questions.</p>}
      <AiAssistant enabled={Boolean(settings?.aiEnabled)} timeZone={settings?.timeZone || "UTC"} />
      <p className="settings-help">The assistant cannot search visitor names, emails, or phone numbers. It does not receive visitor record details; exact results are queried by the system and shown here.</p>
    </AdminShell>
  );
}
