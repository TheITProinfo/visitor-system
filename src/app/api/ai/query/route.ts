import { getAuthenticatedUser } from "@/server/auth";
import { AiQueryError, runAiQuery } from "@/server/ai-query";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });
  if (user.role === "EMPLOYEE") return Response.json({ error: "The assistant is available to administrators and reception staff." }, { status: 403 });

  const raw = await request.text();
  if (raw.length > 4_096) return Response.json({ error: "The request is too large." }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Send a valid JSON request." }, { status: 400 }); }
  const question = body && typeof body === "object" && "question" in body && typeof body.question === "string" ? body.question : "";
  try {
    const result = await runAiQuery({ id: user.id, role: user.role }, question);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AiQueryError) {
      const messages: Record<string, string> = {
        "ai-disabled": "The AI assistant is not enabled. Ask an administrator to configure and test a provider.",
        "ai-usage-paused": "AI requests are paused for this usage period. Ask an administrator to review the usage settings.",
        "ai-user-limit": "You have reached the current AI query limit. Try again later.",
        "ai-visitor-search-unavailable": "AI cannot search by visitor name or contact details. Use Visitor records for that search.",
        "ai-invalid-question": "Enter a question of up to 500 characters.",
        "ai-provider-auth": "The configured AI provider rejected its credentials. Ask an administrator to test the connection.",
        "ai-provider-rate-limit": "The AI provider is temporarily rate limiting requests. Try again later.",
        "ai-timeout": "The AI provider did not respond in time. Retry this request.",
        "ai-provider-unavailable": "The selected AI provider is unavailable. No other provider was used.",
        "ai-query-failed": "The assistant could not complete this request. Retry it or use Visitor records.",
      };
      return Response.json({ error: messages[error.code] || "The assistant could not complete this request." }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "The assistant could not complete this request." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
