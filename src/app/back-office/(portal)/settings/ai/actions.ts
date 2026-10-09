"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { encryptSetting } from "@/server/settings-crypto";
import { callAi, parseAiJson, AiProviderError } from "@/server/ai-provider";
import { reportConfigurationHash, sendReportPreview, nextReportOccurrence } from "@/server/ai-reports";
import type { AiProvider, AiReportCadence } from "@/generated/prisma/client";

function field(fd: FormData, name: string, max = 500) { return String(fd.get(name) ?? "").trim().slice(0, max); }
function result(code: string): never { revalidatePath("/back-office/settings/ai"); redirect(`/back-office/settings/ai?result=${encodeURIComponent(code)}`); }
function httpsUrl(value: string) { try { const u=new URL(value); return u.protocol==="https:" && !u.username && !u.password && u.hostname.length<=253; } catch { return false; } }
function aiHash(v:{provider:AiProvider;endpoint:string|null;model:string;encryptedKey:string}) { return createHash("sha256").update(JSON.stringify(v)).digest("hex"); }

export async function saveAiProviderSettings(fd:FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const p=field(fd,"provider",30); if(p!=="OPENAI"&&p!=="AZURE_OPENAI") result("ai-invalid");
  const provider=p as AiProvider, model=field(fd,"model",120), rawEndpoint=field(fd,"endpoint",500);
  const endpoint=provider==="AZURE_OPENAI"?rawEndpoint.replace(/\/$/,""):null;
  const apiKey=String(fd.get("apiKey")??"").trim();
  const requests=Number(field(fd,"requestsPerUserPerDay",3)), tokens=Number(field(fd,"maxTokensPerMonth",10));
  if(!model||(provider==="AZURE_OPENAI"&&!httpsUrl(endpoint||""))||!Number.isInteger(requests)||requests<1||requests>500||!Number.isInteger(tokens)||tokens<1000||tokens>100000000) result("ai-invalid");
  const old=await prisma.companySettings.findFirst({select:{id:true,aiApiKeyEncrypted:true,aiConfigurationHash:true}});
  if(!old) result("company-required");
  const id=old.id, encrypted=apiKey?encryptSetting(apiKey):old.aiApiKeyEncrypted;
  if(!encrypted) result("ai-key-required");
  const hash=aiHash({provider,endpoint,model,encryptedKey:encrypted});
  const changed=old.aiConfigurationHash!==hash;
  await prisma.companySettings.update({where:{id},data:{
    aiProvider:provider,aiEndpoint:endpoint,aiModel:model,aiApiKeyEncrypted:encrypted,aiConfigurationHash:hash,
    ...(changed?{aiEnabled:false,aiConnectionTestedAt:null,aiTestedConfigurationHash:null}:{}),
    aiRequestsPerUserPerDay:requests,aiMaxTokensPerMonth:tokens
  }});
  result(changed?"ai-saved-test-required":"ai-saved");
}

export async function testAiProvider() {
  await requireUser(["ADMINISTRATOR"]);
  const s=await prisma.companySettings.findFirst({select:{id:true,aiProvider:true,aiEndpoint:true,aiModel:true,aiApiKeyEncrypted:true,aiConfigurationHash:true}});
  if(!s?.aiProvider||!s.aiModel||!s.aiApiKeyEncrypted||!s.aiConfigurationHash) result("ai-not-configured");
  try {
    const r=await callAi(s,"Connection check. Return exactly JSON {\"ok\":true}. Do not access or infer visitor information.","Synthetic connectivity test.");
    if(parseAiJson<{ok?:unknown}>(r.text).ok!==true) result("ai-test-invalid");
  } catch(e) { result(`ai-test-failed-${e instanceof AiProviderError?e.code:"provider-error"}`); }
  await prisma.companySettings.update({where:{id:s.id},data:{aiConnectionTestedAt:new Date(),aiTestedConfigurationHash:s.aiConfigurationHash}});
  result("ai-tested");
}
export async function enableAiProvider() {
  await requireUser(["ADMINISTRATOR"]);
  const s=await prisma.companySettings.findFirst({select:{id:true,aiConfigurationHash:true,aiTestedConfigurationHash:true,aiConnectionTestedAt:true,aiApiKeyEncrypted:true,aiProvider:true,aiModel:true}});
  if(!s?.aiProvider||!s.aiModel||!s.aiApiKeyEncrypted||!s.aiConnectionTestedAt||s.aiConfigurationHash!==s.aiTestedConfigurationHash) result("ai-test-required");
  await prisma.companySettings.update({where:{id:s.id},data:{aiEnabled:true}}); result("ai-enabled");
}
export async function disableAiProvider() {
  await requireUser(["ADMINISTRATOR"]); const s=await prisma.companySettings.findFirst({select:{id:true}});
  if(s) await prisma.companySettings.update({where:{id:s.id},data:{aiEnabled:false}}); result("ai-disabled");
}

export async function saveCopilotSettings(fd:FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const tenantId=field(fd,"tenantId",80), audience=field(fd,"audience",200), connector=field(fd,"connectorClientId",80);
  const loginClient=field(fd,"loginClientId",80), secret=String(fd.get("loginClientSecret")??"").trim();
  const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(![tenantId,connector,loginClient].every(x=>guid.test(x))||!audience) result("copilot-invalid");
  const old=await prisma.companySettings.findFirst({select:{id:true,copilotLoginClientSecretEncrypted:true,copilotTenantId:true,copilotApiAudience:true,copilotConnectorClientId:true,copilotLoginClientId:true}});
  if(!old) result("company-required");
  const id=old.id; if(!secret&&!old.copilotLoginClientSecretEncrypted) result("copilot-secret-required");
  const changed=old.copilotTenantId!==tenantId||old.copilotApiAudience!==audience||old.copilotConnectorClientId!==connector||old.copilotLoginClientId!==loginClient||Boolean(secret);
  await prisma.companySettings.update({where:{id},data:{
    copilotTenantId:tenantId,copilotApiAudience:audience,copilotConnectorClientId:connector,copilotLoginClientId:loginClient,
    ...(secret?{copilotLoginClientSecretEncrypted:encryptSetting(secret)}:{}),...(changed?{copilotEnabled:false}:{})
  }});
  result(changed?"copilot-saved-disabled":"copilot-saved");
}
export async function enableCopilotApi() {
  await requireUser(["ADMINISTRATOR"]);
  const s=await prisma.companySettings.findFirst({select:{id:true,copilotTenantId:true,copilotApiAudience:true,copilotConnectorClientId:true,copilotLoginClientId:true,copilotLoginClientSecretEncrypted:true}});
  if(!s?.copilotTenantId||!s.copilotApiAudience||!s.copilotConnectorClientId||!s.copilotLoginClientId||!s.copilotLoginClientSecretEncrypted) result("copilot-incomplete");
  await prisma.companySettings.update({where:{id:s.id},data:{copilotEnabled:true}}); result("copilot-enabled");
}
export async function disableCopilotApi() {
  await requireUser(["ADMINISTRATOR"]);const s=await prisma.companySettings.findFirst({select:{id:true}});
  if(s)await prisma.companySettings.update({where:{id:s.id},data:{copilotEnabled:false}});result("copilot-disabled");
}

function reportHash(s:{cadence:AiReportCadence;sendTime:string;recipientUserIds:string[]},tz:string) {
  return reportConfigurationHash({cadence:s.cadence,sendTime:s.sendTime,recipientUserIds:s.recipientUserIds,timeZone:tz});
}
export async function saveAiReportSchedule(fd:FormData) {
  await requireUser(["ADMINISTRATOR"]);
  const settings=await prisma.companySettings.findFirst({select:{id:true,timeZone:true}});
  if(!settings) result("company-required");
  const id=settings.id;
  const c=field(fd,"cadence",10);if(c!=="DAILY"&&c!=="WEEKLY")result("report-invalid");
  const cadence=c as AiReportCadence,sendTime=field(fd,"sendTime",5);
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(sendTime))result("report-invalid");
  const recipientUserIds=[...new Set(fd.getAll("recipientUserIds").map(x=>String(x).slice(0,64)))];
  if(!recipientUserIds.length||recipientUserIds.length>50)result("report-recipients-required");
  const valid=await prisma.user.findMany({where:{id:{in:recipientUserIds},status:"ACTIVE",role:"ADMINISTRATOR"},select:{id:true}});
  if(valid.length!==recipientUserIds.length)result("report-recipients-invalid");
  const configurationHash=reportHash({cadence,sendTime,recipientUserIds},settings.timeZone||"UTC");
  await prisma.aiReportSchedule.upsert({
    where:{settingsId:id},create:{settingsId:id,cadence,sendTime,recipientUserIds,enabled:false,configurationHash},
    update:{cadence,sendTime,recipientUserIds,enabled:false,configurationHash,testedAt:null,nextRunAt:null}
  });result("report-saved-test-required");
}
export async function testAiReportSchedule() {
  const user=await requireUser(["ADMINISTRATOR"]);
  const settings=await prisma.companySettings.findFirst({select:{id:true,timeZone:true}});
  if(!settings) result("company-required");
  const id=settings.id;
  const s=await prisma.aiReportSchedule.findUnique({where:{settingsId:id}});
  if(!s||!s.recipientUserIds.includes(user.id))result("report-save-and-select-yourself");
  const hash=reportHash(s,settings.timeZone||"UTC");
  try{await sendReportPreview(id,user.email,s.cadence,settings.timeZone||"UTC");}catch{result("report-preview-failed");}
  await prisma.aiReportSchedule.update({where:{id:s.id},data:{enabled:false,testedAt:new Date(),configurationHash:hash}});result("report-preview-sent");
}
export async function enableAiReportSchedule() {
  await requireUser(["ADMINISTRATOR"]);
  const settings=await prisma.companySettings.findFirst({select:{id:true,timeZone:true,smtpHost:true,smtpPort:true,smtpUsername:true,smtpPasswordEncrypted:true,smtpSenderEmail:true}});
  if(!settings) result("company-required");
  const id=settings.id;
  if(!settings.smtpHost||!settings.smtpPort||!settings.smtpUsername||!settings.smtpPasswordEncrypted||!settings.smtpSenderEmail)result("report-smtp-required");
  const s=await prisma.aiReportSchedule.findUnique({where:{settingsId:id}});
  if(!s?.testedAt||!s.recipientUserIds.length)result("report-test-required");
  const tz=settings.timeZone||"UTC";if(s.configurationHash!==reportHash(s,tz))result("report-test-required");
  const active=await prisma.user.count({where:{id:{in:s.recipientUserIds},status:"ACTIVE",role:"ADMINISTRATOR"}});
  if(active!==s.recipientUserIds.length)result("report-recipients-invalid");
  await prisma.aiReportSchedule.update({where:{id:s.id},data:{enabled:true,nextRunAt:nextReportOccurrence(new Date(),s.cadence,s.sendTime,tz)}});result("report-enabled");
}
export async function disableAiReportSchedule() {
  await requireUser(["ADMINISTRATOR"]);const s=await prisma.companySettings.findFirst({select:{id:true}});
  if(s)await prisma.aiReportSchedule.updateMany({where:{settingsId:s.id},data:{enabled:false}});result("report-disabled");
}

export async function reviewEntraLink(fd:FormData) {
  const reviewer=await requireUser(["ADMINISTRATOR"]),id=field(fd,"requestId",64),decision=field(fd,"decision",10);
  if(!id||!["approve","reject"].includes(decision))result("entra-review-invalid");
  const req=await prisma.entraLinkRequest.findUnique({where:{id}});
  if(!req||req.status!=="PENDING")result("entra-request-not-pending");
  if(decision==="reject"){await prisma.entraLinkRequest.update({where:{id},data:{status:"REJECTED",reviewedById:reviewer.id,reviewedAt:new Date()}});result("entra-link-rejected");}
  const config=await prisma.companySettings.findUnique({where:{id:req.settingsId},select:{copilotTenantId:true,copilotEnabled:true}});
  if(!config?.copilotEnabled||config.copilotTenantId!==req.entraTenantId)result("entra-tenant-mismatch");
  const user=await prisma.user.findUnique({where:{id:req.userId},select:{id:true,status:true,email:true}});
  if(!user||user.status!=="ACTIVE"||user.email.toLowerCase()!==req.email?.toLowerCase())result("entra-user-mismatch");
  const conflict=await prisma.user.findFirst({where:{entraTenantId:req.entraTenantId,entraObjectId:req.entraObjectId,id:{not:user.id}},select:{id:true}});
  if(conflict)result("entra-identity-already-linked");
  await prisma.$transaction([
    prisma.user.update({where:{id:user.id},data:{entraTenantId:req.entraTenantId,entraObjectId:req.entraObjectId}}),
    prisma.entraLinkRequest.update({where:{id},data:{status:"APPROVED",reviewedById:reviewer.id,reviewedAt:new Date()}})
  ]);revalidatePath("/back-office/settings/ai");revalidatePath("/back-office/account/copilot-link");redirect("/back-office/settings/ai?result=entra-link-approved");
}
