import { techPdf } from "@/lib/newwave/techDoc";

export const maxDuration = 30;

/** Den tekniska översikten som PDF; görs en gång per server och delas sedan. */
export async function GET() {
  const pdf = await techPdf().catch(() => null);
  if (!pdf) return new Response("Kunde inte skapa PDF", { status: 500 });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Next-Wave-teknisk-oversikt.pdf"', "Cache-Control": "private, no-store" },
  });
}
