import type { NextRequest } from "next/server";
import { internalPath, isRole, logout } from "@/lib/poc/auth";

/**
 * Utloggning: `roll` loggar ut en roll (craft, stickeri, tryckeri), utan den loggas alla ut. Som formulär eller med
 * `?roll=&next=`. Med `next` skickas webbläsaren dit (bara sökvägar på sajten), annars svaras rollerna som är kvar.
 */
export async function POST(req: NextRequest) {
  const form = req.headers.get("content-type")?.includes("form") ? await req.formData().catch(() => null) : null;
  const q = req.nextUrl.searchParams;
  const role = form?.get("roll") ?? q.get("roll");
  const roles = await logout(isRole(role) ? role : undefined);
  const next = internalPath(form?.get("next") ?? q.get("next"));
  if (next) return new Response(null, { status: 303, headers: { Location: next } });
  return Response.json({ roles });
}
