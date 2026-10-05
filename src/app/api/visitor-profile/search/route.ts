import { searchVisitorProfiles } from "@/server/visitor-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim();
  if (name.length < 2) return Response.json({ profiles: [], hasMore: false }, { headers: { "Cache-Control": "no-store" } });

  const result = await searchVisitorProfiles(name);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
