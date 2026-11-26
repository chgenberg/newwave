import { registryClubs } from "@/lib/poc/build";

/** Hela klubbregistret i kort form, för Crafts klubbval: en rad per klubb (se RegistryRow i lib/poc/build.ts). */
export const dynamic = "force-dynamic";

export async function GET() {
  const clubs = await registryClubs();
  return Response.json({ clubs }, { headers: { "Cache-Control": "private, max-age=300" } });
}
