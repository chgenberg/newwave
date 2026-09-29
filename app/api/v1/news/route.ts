import { z } from "zod";
import { CLUBS } from "@/lib/club";
import { NewsError, articleToSignal, readArticle } from "@/lib/news";
import { errorMessage } from "@/lib/openai";

export const maxDuration = 60;

const Body = z.object({ clubId: z.string(), url: z.string().min(8).max(2000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Klistra in en länk till en nyhet." }, { status: 400 });
  const club = CLUBS[parsed.data.clubId];
  if (!club) return Response.json({ error: "Okänd klubb" }, { status: 404 });

  try {
    const article = await readArticle(parsed.data.url);
    const signal = await articleToSignal(club, article);
    return Response.json({ signal, article: { title: article.title, site: article.site, image: article.image, published: article.published } });
  } catch (err) {
    if (err instanceof NewsError) return Response.json({ error: err.message }, { status: 422 });
    return Response.json({ error: errorMessage(err) }, { status: 502 });
  }
}
