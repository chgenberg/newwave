import { loadDrop, saveDrop } from "@/lib/drops";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const drop = await loadDrop(id);
  if (!drop) return Response.json({ error: "Droppet hittades inte" }, { status: 404 });
  return Response.json(drop);
}

export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const drop = await loadDrop(id);
  if (!drop) return Response.json({ error: "Droppet hittades inte" }, { status: 404 });
  return Response.json(await saveDrop({ ...drop, status: "approved" }));
}
