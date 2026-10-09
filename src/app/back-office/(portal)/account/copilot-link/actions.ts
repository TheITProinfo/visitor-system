"use server";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { encryptSetting } from "@/server/settings-crypto";

const STATE_COOKIE="entra_link_state";
function hash(value:string){return createHash("sha256").update(value).digest("hex");}
function appOrigin(){
  const value=process.env.APP_URL;
  if(!value)throw new Error("APP_URL is required for Microsoft identity linking.");
  const url=new URL(value);
  if(process.env.NODE_ENV==="production"&&url.protocol!=="https:")throw new Error("APP_URL must use HTTPS in production.");
  return url.origin;
}
export async function beginCopilotIdentityLink(){
  const user=await requireUser();
  const settings=await prisma.companySettings.findFirst({select:{id:true,copilotEnabled:true,copilotTenantId:true,copilotLoginClientId:true}});
  if(!settings?.copilotEnabled||!settings.copilotTenantId||!settings.copilotLoginClientId)redirect("/back-office/account/copilot-link?status=not-configured");
  const state=randomBytes(32).toString("base64url"),nonce=randomBytes(32).toString("base64url");
  const verifier=randomBytes(32).toString("base64url"),challenge=createHash("sha256").update(verifier).digest("base64url");
  await prisma.entraLinkChallenge.create({data:{stateHash:hash(state),nonce,codeVerifierEncrypted:encryptSetting(verifier),userId:user.id,settingsId:settings.id,expiresAt:new Date(Date.now()+10*60_000)}});
  const jar=await cookies();
  jar.set(STATE_COOKIE,state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:600});
  const redirectUri=appOrigin()+"/api/copilot/entra/callback";
  const authorize=new URL("https://login.microsoftonline.com/"+settings.copilotTenantId+"/oauth2/v2.0/authorize");
  authorize.searchParams.set("client_id",settings.copilotLoginClientId);
  authorize.searchParams.set("response_type","code");
  authorize.searchParams.set("redirect_uri",redirectUri);
  authorize.searchParams.set("response_mode","query");
  authorize.searchParams.set("scope","openid profile email");
  authorize.searchParams.set("state",state);
  authorize.searchParams.set("nonce",nonce);
  authorize.searchParams.set("code_challenge",challenge);
  authorize.searchParams.set("code_challenge_method","S256");
  authorize.searchParams.set("prompt","select_account");
  redirect(authorize.toString());
}
