import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/server/db";
import { decryptSetting } from "@/server/settings-crypto";

export const runtime="nodejs";
const cookieName="entra_link_state";
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
function redirectTo(request:Request,status:string){return NextResponse.redirect(new URL("/back-office/account/copilot-link?status="+encodeURIComponent(status),request.url));}
function origin(){
  const value=process.env.APP_URL;if(!value)throw new Error("APP_URL missing");
  const url=new URL(value);if(process.env.NODE_ENV==="production"&&url.protocol!=="https:")throw new Error("APP_URL must use HTTPS");
  return url.origin;
}
export async function GET(request:Request){
  const jar=await cookies(),stateCookie=jar.get(cookieName)?.value;
  jar.delete(cookieName);
  const url=new URL(request.url),state=url.searchParams.get("state"),code=url.searchParams.get("code");
  if(!stateCookie||!state||state!==stateCookie||!code)return redirectTo(request,"error");
  const challenge=await prisma.entraLinkChallenge.findUnique({where:{stateHash:hash(state)},include:{user:{select:{id:true,email:true,status:true}},settings:{select:{copilotTenantId:true,copilotLoginClientId:true,copilotLoginClientSecretEncrypted:true,copilotEnabled:true}}}});
  if(!challenge||challenge.expiresAt<=new Date()||challenge.user.status!=="ACTIVE"||!challenge.settings.copilotEnabled||
      !challenge.settings.copilotTenantId||!challenge.settings.copilotLoginClientId||!challenge.settings.copilotLoginClientSecretEncrypted)return redirectTo(request,"error");
  await prisma.entraLinkChallenge.delete({where:{id:challenge.id}});
  const tenant=challenge.settings.copilotTenantId,clientId=challenge.settings.copilotLoginClientId;
  try{
    const tokenResponse=await fetch("https://login.microsoftonline.com/"+tenant+"/oauth2/v2.0/token",{
      method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        client_id:clientId,client_secret:decryptSetting(challenge.settings.copilotLoginClientSecretEncrypted),
        grant_type:"authorization_code",code,redirect_uri:origin()+"/api/copilot/entra/callback",
        code_verifier:decryptSetting(challenge.codeVerifierEncrypted),
      }),
      cache:"no-store",signal:AbortSignal.timeout(15000),
    });
    if(!tokenResponse.ok)return redirectTo(request,"error");
    const tokenBody=await tokenResponse.json() as {id_token?:unknown};
    if(typeof tokenBody.id_token!=="string")return redirectTo(request,"error");
    const jwks=createRemoteJWKSet(new URL("https://login.microsoftonline.com/"+tenant+"/discovery/v2.0/keys"));
    const {payload}=await jwtVerify(tokenBody.id_token,jwks,{issuer:"https://login.microsoftonline.com/"+tenant+"/v2.0",audience:clientId,algorithms:["RS256"]});
    if(payload.nonce!==challenge.nonce||payload.tid!==tenant||typeof payload.oid!=="string")return redirectTo(request,"error");
    const identityEmail=typeof payload.email==="string"?payload.email:typeof payload.preferred_username==="string"?payload.preferred_username:null;
    if(!identityEmail||identityEmail.toLowerCase()!==challenge.user.email.toLowerCase())return redirectTo(request,"error");
    const linked=await prisma.user.findFirst({where:{entraTenantId:tenant,entraObjectId:payload.oid},select:{id:true}});
    if(linked&&linked.id!==challenge.user.id)return redirectTo(request,"error");
    const pending=await prisma.entraLinkRequest.findFirst({where:{entraTenantId:tenant,entraObjectId:payload.oid,status:"PENDING"},select:{id:true,userId:true}});
    if(pending&&pending.userId!==challenge.user.id)return redirectTo(request,"error");
    if(!pending){
      const rejected=await prisma.entraLinkRequest.findFirst({where:{entraTenantId:tenant,entraObjectId:payload.oid,status:"REJECTED"},select:{id:true}});
      const data={settingsId:challenge.settingsId,userId:challenge.user.id,entraTenantId:tenant,entraObjectId:payload.oid,
        email:identityEmail,displayName:typeof payload.name==="string"?payload.name.slice(0,200):null,verifiedAt:new Date()};
      if(rejected)await prisma.entraLinkRequest.update({where:{id:rejected.id},data:{...data,status:"PENDING",reviewedById:null,reviewedAt:null}});
      else await prisma.entraLinkRequest.create({data});
    }
    return redirectTo(request,"pending");
  }catch{
    return redirectTo(request,"error");
  }
}
