import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/server/db";
import { getLocalDateRange } from "@/server/dates";
import type { UserRole } from "@/generated/prisma/client";

export const runtime="nodejs";
const ALLOWED_ROLES:UserRole[]=["ADMINISTRATOR","RECEPTIONIST"];
const MAX_RANGE_DAYS=90;
function jsonError(message:string,status:number){return Response.json({error:message},{status,headers:{"Cache-Control":"no-store"}});}
function validDate(value:unknown):value is string{return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value);}
function safeZone(value:string){try{new Intl.DateTimeFormat("en-US",{timeZone:value}).format();return value;}catch{return "UTC";}}

export async function POST(request:Request){
  const raw=await request.text();if(raw.length>4096)return jsonError("Request too large.",413);
  let body:unknown;try{body=JSON.parse(raw);}catch{return jsonError("Invalid JSON.",400);}
  if(!body||typeof body!=="object")return jsonError("Invalid request.",400);
  const input=body as Record<string,unknown>;
  if(input.queryType!=="summary"&&input.queryType!=="not_checked_out")return jsonError("Unsupported query type.",400);
  const settings=await prisma.companySettings.findFirst({select:{id:true,timeZone:true,copilotEnabled:true,copilotTenantId:true,copilotApiAudience:true,copilotConnectorClientId:true}});
  if(!settings?.copilotEnabled||!settings.copilotTenantId||!settings.copilotApiAudience||!settings.copilotConnectorClientId)return jsonError("Copilot integration is disabled.",503);
  const header=request.headers.get("authorization")||"";
  const match=header.match(/^Bearer ([A-Za-z0-9._~-]+)$/);if(!match)return jsonError("A Microsoft access token is required.",401);
  let payload;
  try{
    const tenant=settings.copilotTenantId;
    const jwks=createRemoteJWKSet(new URL("https://login.microsoftonline.com/"+tenant+"/discovery/v2.0/keys"));
    const verified=await jwtVerify(match[1],jwks,{issuer:"https://login.microsoftonline.com/"+tenant+"/v2.0",audience:settings.copilotApiAudience,algorithms:["RS256"]});
    payload=verified.payload;
  }catch{return jsonError("The Microsoft access token is invalid.",401);}
  if(payload.tid!==settings.copilotTenantId||typeof payload.oid!=="string")return jsonError("The token tenant or identity is invalid.",403);
  const scopes=typeof payload.scp==="string"?payload.scp.split(" "):[];
  if(!scopes.includes("visitor.read"))return jsonError("The token does not have the visitor.read delegated scope.",403);
  const actor=typeof payload.azp==="string"?payload.azp:typeof payload.appid==="string"?payload.appid:"";
  if(actor.toLowerCase()!==settings.copilotConnectorClientId.toLowerCase())return jsonError("The calling Copilot connector is not authorized.",403);

  const user=await prisma.user.findFirst({where:{entraTenantId:settings.copilotTenantId,entraObjectId:payload.oid,status:"ACTIVE"},select:{id:true,role:true}});
  if(!user||!ALLOWED_ROLES.includes(user.role))return jsonError("This Microsoft identity is not approved for visitor reporting.",403);
  const since=new Date(Date.now()-60*60_000);
  const recent=await prisma.aiAuditEvent.count({where:{settingsId:settings.id,userId:user.id,operation:"copilot-query",createdAt:{gte:since}}});
  if(recent>=60)return jsonError("Request limit reached. Try again later.",429);

  const timeZone=safeZone(settings.timeZone||"UTC");
  let where:{checkedInAt?:{gte:Date;lt:Date};checkedOutAt?:null;hostId?:string;purposeId?:string}={};
  let from:string|undefined,to:string|undefined;
  if(input.queryType==="summary"){
    if(!validDate(input.from)||!validDate(input.to)||input.from>input.to)return jsonError("Provide a valid from and to date.",400);
    const start=getLocalDateRange(input.from,timeZone),end=getLocalDateRange(input.to,timeZone);
    if(!start||!end)return jsonError("Invalid date range.",400);
    const days=Math.round((end.start.getTime()-start.start.getTime())/86400000)+1;
    if(days<1||days>MAX_RANGE_DAYS)return jsonError("Date ranges may cover at most 90 days.",400);
    from=input.from;to=input.to;where={checkedInAt:{gte:start.start,lt:end.end}};
  }else{where={checkedOutAt:null};}
  const hostId=typeof input.hostId==="string"?input.hostId.slice(0,64):"";
  const purposeId=typeof input.purposeId==="string"?input.purposeId.slice(0,64):"";
  if(hostId)where.hostId=hostId;
  if(purposeId)where.purposeId=purposeId;
  const [total,open]=await Promise.all([
    prisma.visitRecord.count({where}),
    prisma.visitRecord.count({where:{...where,checkedOutAt:null}}),
  ]);
  const periodWhere=where;
  const daily:Array<{date:string;arrivals:number;suppressed:boolean}>=[];
  if(input.queryType==="summary"&&from&&to){
    for(let date=from;date<=to;){
      const day=getLocalDateRange(date,timeZone)!;
      const count=await prisma.visitRecord.count({where:{...periodWhere,checkedInAt:{gte:day.start,lt:day.end}}});
      daily.push({date,arrivals:count>=5?count:0,suppressed:count<5});
      const next=new Date(date+"T00:00:00.000Z");next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);
    }
  }
  const output={
    queryType:input.queryType,
    ...(from&&to?{period:{from,to,timeZone}}:{}),
    arrivals:total>=5?total:null,
    visitsWithoutCheckout:open>=5?open:null,
    suppressed:total<5,
    dailyArrivals:daily,
    filters:{hostId:hostId||null,purposeId:purposeId||null},
    portalUrl:process.env.APP_URL||null,
    note:"Aggregate data only. Values below five are suppressed. Use the portal link to open records permitted by your application role; this API never returns visitor records.",
  };
  await prisma.aiAuditEvent.create({data:{
    settingsId:settings.id,userId:user.id,operation:"copilot-query",
    filters:{queryType:input.queryType,...(from?{from,to}:{}),hostId:hostId||null,purposeId:purposeId||null},
    resultCount:total,success:true,inputTokens:0,outputTokens:0,
  }});
  return Response.json(output,{headers:{"Cache-Control":"no-store"}});
}
