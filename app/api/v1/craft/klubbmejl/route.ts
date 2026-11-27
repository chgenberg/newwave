import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readJson } from "@/lib/demoLimit";
import { CLUBS_DIR, CLUB_ID, clubDetail } from "@/lib/newwave/clubRegistry";
import { roleAddresses } from "@/lib/poc/clubEmail";
import { clubEmailCount, saveClubEmails } from "@/lib/poc/content";
import { roleFromRequest } from "@/lib/poc/auth";

export const maxDuration = 120;

const Body = z.object({
  /** Klubbens id i registret och adresserna som skrapningen hittade; högst 2 000 klubbar per anrop. */
  clubs: z.record(z.string().regex(CLUB_ID), z.array(z.string().max(200)).max(20)),
});

/**
 * Föreningsadresserna som mejlutkasten till klubbarna går till. Registrets paket i produktionen är publikt och saknar
 * kontaktuppgifter, så adresserna läggs i databasen härifrån: på datorn, med skrapningens filer, skickas de hit med
 * Crafts inloggning. Servern väljer själv bara föreningens egna adresser (info@, kansli@ … på klubbens domän, se
 * lib/poc/clubEmail.ts) och fyller i mottagaren i utkasten som saknar den. Svar: `{ saved, removed, draftsUpdated, skipped }`.
 */
export async function POST(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const body = await readJson(req, 2_000_000);
  if (body === undefined) return Response.json({ error: "Kroppen är för stor" }, { status: 413 });
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Skicka { clubs: { <klubb-id>: [adresser] } }." }, { status: 400 });
  const ids = Object.keys(parsed.data.clubs);
  if (ids.length > 2000) return Response.json({ error: "Högst 2 000 klubbar per anrop." }, { status: 413 });
  const entries: { clubId: string; emails: string[] }[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const club = await clubDetail(id);
    if (!club) {
      skipped.push(id);
      continue;
    }
    entries.push({ clubId: id, emails: roleAddresses({ name: club.name, host: club.host }, parsed.data.clubs[id]) });
  }
  return Response.json({ ...(await saveClubEmails(entries)), skipped: skipped.length });
}

/** Hur många klubbar som har föreningsadresser, och hur många av registrets klubbar som har det i skrapningens filer. */
export async function GET(req: Request) {
  if (!(await roleFromRequest(req, "craft"))) return Response.json({ error: "Logga in som Craft." }, { status: 401 });
  const index = JSON.parse(await readFile(path.join(CLUBS_DIR, "index.json"), "utf8").catch(() => '{"items":[]}')) as { items: unknown[] };
  return Response.json({ clubs: await clubEmailCount(), registry: index.items.length });
}
