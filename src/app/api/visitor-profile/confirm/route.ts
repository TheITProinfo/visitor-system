import { confirmVisitorProfile } from "@/server/visitor-service";

export async function POST(request: Request) {
  let body: { profileId?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "profile-unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  if (typeof body.profileId !== "string" || typeof body.email !== "string") {
    return Response.json({ error: "profile-unavailable" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const profile = await confirmVisitorProfile(body.profileId, body.email);
  if (!profile) return Response.json({ error: "profile-unavailable" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
}
