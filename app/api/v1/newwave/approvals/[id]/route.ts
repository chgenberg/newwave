import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { addFeed, decideApproval } from "@/lib/newwave/store";

const Body = z.object({
  clubId: z.string(),
  decision: z.enum(["godkänd", "ändring"]),
  note: z.string().trim().max(1000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const { clubId, decision, note } = parsed.data;
  const club = CLUBS[clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  if (decision === "ändring" && !note) return Response.json({ error: "Skriv vad som ska ändras" }, { status: 400 });

  const result = await decideApproval(clubId, id, decision, note);
  if (!result) return Response.json({ error: "Hittades inte" }, { status: 404 });

  const { approval, published } = result;
  if (decision === "godkänd") {
    await addFeed(clubId, "Kansliet", `Godkände "${approval.title}".`);
    if (published) await addFeed(clubId, "Butiksagenten", `Lade ut ${published} produkter med "${approval.title}" i klubbens butik hos Intersport.`);
  } else {
    await addFeed(clubId, "Kansliet", `Bad om ändring på "${approval.title}": ${note}`);
  }
  return Response.json({ approval, published });
}
