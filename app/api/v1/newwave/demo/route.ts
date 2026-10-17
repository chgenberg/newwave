import { resetWorkspace } from "@/lib/newwave/workspace";

/** Börjar om besökarens demo: det hen ändrat försvinner och grunddatan visas igen. */
export async function DELETE() {
  await resetWorkspace();
  return Response.json({ ok: true });
}
