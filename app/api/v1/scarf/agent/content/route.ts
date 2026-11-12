import { z } from "zod";
import { errorMessage, hasOpenAIKey } from "@/lib/openai";
import { CopySchema, FILM_CHANNELS, IMAGE_CHANNELS, type FilmChannel, type ImageChannel } from "@/lib/scarfChannels";
import { scarfClub, sportOf } from "@/lib/scarfClub";
import { createScarfCopy, demoScarfCopy, frontOf, mediaFor } from "@/lib/scarfContent";
import { renderFilm } from "@/lib/scarfFilm";
import { FilesShape, IdeaSchema, PHOTO_FILE } from "@/lib/scarfFlow";
import { scarfAllowed, scarfLimit } from "@/lib/scarfLimit";
import { channelImage, channelImages } from "@/lib/scarfMedia";
import { socialPhotos } from "@/lib/scarfPhoto";
import { saveFile } from "@/lib/store";

export const maxDuration = 300;

const Base = { clubId: z.string().max(120), idea: IdeaSchema, ...FilesShape };
const Made = { copy: CopySchema, photos: z.array(z.string().regex(PHOTO_FILE)).max(2) };
/** Beställarens egen länk till affischens QR-kod. Utan den används klubbens webbplats. */
const Link = { link: z.string().trim().max(300).optional() };

const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("copy"), ...Base, signal: z.object({ title: z.string().max(160), detail: z.string().max(600) }).optional() }),
  z.object({ step: z.literal("photo"), ...Base }),
  z.object({ step: z.literal("images"), ...Base, ...Made, ...Link }),
  z.object({ step: z.literal("poster"), ...Base, ...Made, ...Link }),
  z.object({ step: z.literal("film"), channel: z.enum(FILM_CHANNELS as [FilmChannel, ...FilmChannel[]]), ...Base, ...Made }),
]);

/** Språkmodellen svarar oftast på tjugo sekunder, men ibland inte alls. Då fylls texterna från mallen. */
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Modellen svarade inte i tid")), ms))]);

/**
 * Steg 8: materialet för det valda motivet. Sidan anropar stegen var för sig, så att laddningsrutan kan följa dem:
 * texterna och fotografierna först, sedan kanalbilderna och de två filmerna. Steget "poster" gör om affischen ensam,
 * när beställaren byter länken i QR-koden.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const body = parsed.data;
  const limited = scarfLimit(req, body.step === "copy" ? "copy" : body.step === "film" ? "film" : "media");
  if (limited) return limited;
  const found = await scarfClub(body.clubId);
  if (!found) return Response.json({ error: "Okänd klubb" }, { status: 404 });
  const { idea } = body;
  const files = { artFile: body.artFile, photoFile: body.photoFile, signFile: body.signFile };

  try {
    if (body.step === "copy") {
      const base = demoScarfCopy(found.club, idea);
      if (!hasOpenAIKey()) return Response.json({ mode: "demo", copy: base });
      const copy = await within(createScarfCopy(found.club, idea, body.signal), 90_000).catch((err) => {
        console.error("scarf/agent/content copy", errorMessage(err));
        return null;
      });
      return Response.json({ mode: copy ? "ai" : "demo", copy: copy ?? base });
    }

    if (body.step === "photo") {
      // Utan fotografier sätts bilderna och filmerna av halsduken ensam.
      if (!hasOpenAIKey()) return Response.json({ photos: [], note: "Ingen bildmodell är kopplad, så materialet är gjort utan fotografier." });
      if (!scarfAllowed(req, "shoot")) return Response.json({ photos: [], note: "Bildmodellen har tagit många fotografier den senaste timmen, så materialet är gjort utan." });
      // Platsen följer klubbens sport och årstiden följer dagens datum; julhalsduken fotograferas alltid i vinter.
      const front = await frontOf(found, idea, files);
      const shot = await within(socialPhotos({ club: found.club.name, scarf: front.image, text: front.text, setting: found.club.kind === "brand" ? "vardag" : "sport", sport: sportOf(found), winter: idea.recipe === "jul" }), 280_000).catch((err) => ({ worn: null, held: null, errors: [err as unknown] }));
      shot.errors.forEach((err) => console.error("scarf/agent/content photo", errorMessage(err)));
      // Ordningen är fast: först halsduken buren om halsen, sedan uppsträckt mellan händerna.
      const saved = await Promise.all([shot.worn, shot.held].flatMap((jpg) => (jpg ? [saveFile(jpg, "jpg")] : [])));
      return Response.json({ photos: saved.map((f) => f.id), note: saved.length ? null : "Bildmodellen kunde inte ta fotografierna, så materialet är gjort utan." });
    }

    const media = await mediaFor(found, idea, files, body.copy, body.photos, body.step === "film" ? undefined : body.link);

    if (body.step === "images") {
      const images = await channelImages(media);
      const saved = await Promise.all(IMAGE_CHANNELS.map((id) => saveFile(images[id], "jpg")));
      return Response.json({ images: Object.fromEntries(IMAGE_CHANNELS.map((id, i) => [id, saved[i].url])) as Record<ImageChannel, string>, link: media.link ?? null });
    }

    if (body.step === "poster") {
      const saved = await saveFile(await channelImage("poster", media), "jpg");
      return Response.json({ image: saved.url, link: media.link ?? null });
    }

    const film = await renderFilm(body.channel, media).catch((err) => {
      console.error("scarf/agent/content film", errorMessage(err));
      return null;
    });
    if (!film) return Response.json({ film: null, note: "Filmen gick inte att klippa på den här servern." });
    const [mp4, poster] = await Promise.all([saveFile(film.mp4, "mp4"), saveFile(film.poster, "jpg")]);
    return Response.json({ film: { url: mp4.url, poster: poster.url }, note: null });
  } catch (err) {
    console.error("scarf/agent/content", body.step, errorMessage(err));
    return Response.json({ error: "Kunde inte skapa materialet." }, { status: 500 });
  }
}
