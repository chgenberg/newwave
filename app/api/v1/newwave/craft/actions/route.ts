import { z } from "zod";
import { craftClub, craftOverview, isLive } from "@/lib/newwave/craft";
import { logItem, updateState } from "@/lib/newwave/craftState";
import { addFeed } from "@/lib/newwave/store";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("remind"), clubIds: z.array(z.string()).min(1).max(2000) }),
  z.object({ action: z.literal("onboard"), clubIds: z.array(z.string()).min(1).max(2000) }),
  z.object({ action: z.literal("autopilot"), clubIds: z.array(z.string()).min(1).max(2000), on: z.boolean() }),
  z.object({ action: z.literal("threshold"), clubId: z.string(), threshold: z.number().int().min(5).max(10) }),
  z.object({ action: z.literal("gate"), materialId: z.string().max(80), gate: z.enum(["släppt", "stoppad"]) }),
  z.object({ action: z.literal("dismiss"), key: z.string().max(120) }),
]);

const names = (ids: string[]) => (ids.length === 1 ? craftClub(ids[0])?.name : `${ids.length} klubbar`);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig åtgärd" }, { status: 400 });
  const body = parsed.data;

  if (body.action === "dismiss") {
    await updateState((s) => void (s.dismissed = [...new Set([body.key, ...s.dismissed])].slice(0, 200)));
    return Response.json({ ok: true });
  }

  if (body.action === "gate") {
    const rows = await craftOverview();
    const m = rows.flatMap((r) => r.materials).find((x) => x.id === body.materialId);
    if (!m) return Response.json({ error: "Okänt material" }, { status: 404 });
    await updateState((s) => {
      s.gates[m.id] = body.gate;
      s.log.unshift(logItem({ kind: body.gate, text: `${body.gate === "släppt" ? "Släppte" : "Stoppade"} "${m.title}" för ${craftClub(m.clubId)?.name}.`, clubIds: [m.clubId], materialId: m.id }));
    });
    return Response.json({ ok: true });
  }

  if (body.action === "threshold") {
    if (!craftClub(body.clubId)) return Response.json({ error: "Okänd klubb" }, { status: 404 });
    await updateState((s) => {
      s.settings[body.clubId] = { ...s.settings[body.clubId], threshold: body.threshold };
      s.log.unshift(logItem({ kind: "autopilot", text: `${names([body.clubId])} släpper nu igenom material från betyg ${body.threshold}.`, clubIds: [body.clubId] }));
    });
    return Response.json({ ok: true });
  }

  const clubIds = [...new Set(body.clubIds)].filter((id) => craftClub(id));
  if (!clubIds.length) return Response.json({ error: "Okända klubbar" }, { status: 404 });

  if (body.action === "autopilot") {
    await updateState((s) => {
      for (const id of clubIds) s.settings[id] = { ...s.settings[id], autopilot: body.on };
      s.log.unshift(logItem({ kind: "autopilot", text: `Autopilot ${body.on ? "på" : "av"} för ${names(clubIds)}.`, clubIds }));
    });
    return Response.json({ ok: true });
  }

  const rows = await craftOverview();
  for (const id of clubIds.filter(isLive)) {
    const r = rows.find((x) => x.id === id);
    if (body.action === "remind" && r?.stats.pending) await addFeed(id, "Craft", `Påminnelse: ${r.stats.pending} material väntar på ert godkännande.`);
    if (body.action === "onboard") await addFeed(id, "Craft", "Skickade en länk för att slutföra uppstarten i navet.");
  }
  await updateState((s) =>
    void s.log.unshift(
      logItem({ kind: body.action === "remind" ? "påminnelse" : "uppstart", text: body.action === "remind" ? `Påminde ${names(clubIds)} om material som väntar.` : `Skickade uppstartslänk till ${names(clubIds)}.`, clubIds }),
    ),
  );
  return Response.json({ ok: true });
}
