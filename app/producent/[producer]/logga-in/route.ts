import { type NextRequest, NextResponse } from "next/server";
import { loginPath } from "@/components/poc/producer/access";
import { isProducer } from "@/lib/poc/orders";

type Ctx = { params: Promise<{ producer: string }> };

/**
 * Den gamla inloggningen med demonyckeln. Producenterna loggar nu in med lösenord på /logga-in, så gamla länkar och
 * bokmärken hit leds dit, med vägen tillbaka till kön. En nyckel i länken används inte längre.
 */
async function moved(req: NextRequest, ctx: Ctx) {
  const { producer } = await ctx.params;
  if (!isProducer(producer)) return new NextResponse("Finns inte.", { status: 404 });
  return NextResponse.redirect(new URL(loginPath(producer), req.url), 303);
}

export const GET = moved;
export const POST = moved;
