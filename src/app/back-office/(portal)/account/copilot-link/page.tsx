import { AdminShell } from "@/components/admin-shell";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { beginCopilotIdentityLink } from "./actions";

const statusText:Record<string,string>={
  pending:"Your Microsoft identity was verified. An administrator must approve the link before it can be used.",
  "not-configured":"Microsoft identity linking is not configured for this deployment. Contact an administrator.",
  error:"Microsoft could not complete identity verification. Check the setup and try again.",
};
export default async function CopilotLinkPage({searchParams}:{searchParams:Promise<{status?:string}>}) {
  const user=await requireUser();
  const [{status},record,settings,pending]=await Promise.all([
    searchParams,
    prisma.user.findUnique({where:{id:user.id},select:{entraTenantId:true,entraObjectId:true}}),
    prisma.companySettings.findFirst({select:{copilotEnabled:true,copilotTenantId:true,copilotLoginClientId:true}}),
    prisma.entraLinkRequest.findFirst({where:{userId:user.id,status:"PENDING"},select:{email:true,createdAt:true}}),
  ]);
  const linked=Boolean(record?.entraTenantId&&record.entraObjectId);
  return <AdminShell user={user} active="account"><div className="page-heading"><div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Microsoft identity</h1><p>Link your existing Visitor System account to your organization&apos;s Microsoft work account.</p></div></div>
    {status&&statusText[status]&&<p className="settings-message" role="status">{statusText[status]}</p>}
    <section className="panel settings-card">
      <h2>{linked?"Microsoft account linked":pending?"Approval pending":"Connect Microsoft account"}</h2>
      {linked?<p>Your identity is linked to the configured organization tenant. Contact an administrator to change or remove the link.</p>
      :pending?<p>Verified account: {pending.email||"email claim unavailable"}. Requested {pending.createdAt.toLocaleString()}. You can continue using your regular sign-in while approval is pending.</p>
      :<><p>Continue to Microsoft sign-in. This verifies identity only; it does not create a Visitor System account or grant additional permissions. An administrator must approve the link.</p>
        {settings?.copilotEnabled&&settings.copilotTenantId&&settings.copilotLoginClientId?<form action={beginCopilotIdentityLink}><button className="primary-button compact-button" type="submit">Verify Microsoft account <span>→</span></button></form>:<p className="settings-help">Microsoft identity linking is not enabled for this deployment.</p>}</>}
    </section>
  </AdminShell>;
}
