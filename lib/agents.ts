import { randomUUID } from "node:crypto";
import { CATALOG } from "./catalog";
import { generateJson } from "./openai";
import type { Club, Concept, ContentPack, Signal } from "./types";

const SUGGESTIONS = 6;

const describeSignal = (s: Signal) =>
  `- [${s.kind}] ${s.title}${s.date ? ` (${s.date}${s.daysUntil !== undefined ? `, om ${s.daysUntil} dagar` : ""})` : ""}: ${s.detail}`;

const conceptSchema = (club: Club, signals: Signal[]) => ({
  type: "object",
  additionalProperties: false,
  required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "mode", "title", "slogan", "story", "style", "artDirection", "palette", "products"],
        properties: {
          signal: { type: "string", enum: signals.map((s) => s.title) },
          mode: { type: "string", enum: club.agent.satire.allowed ? ["standard", "satir"] : ["standard"] },
          title: { type: "string" },
          slogan: { type: "string" },
          story: { type: "string" },
          style: { type: "string" },
          artDirection: { type: "string" },
          palette: {
            type: "array",
            items: { type: "string", enum: [...club.palette, ...club.agent.satire.extraColors].map((c) => c.hex) },
          },
          products: { type: "array", items: { type: "string", enum: CATALOG.map((p) => p.id) } },
        },
      },
    },
  },
});

export async function createConcepts(club: Club, signals: Signal[], count = SUGGESTIONS): Promise<Concept[]> {
  const system = `Du är kreativ AD i Crafts innehållsmaskin för klubbmerch som trycks på beställning och säljs i klubbens butik hos Intersport.
Du tar fram motiv som känns unika för just ${club.name} och som går att trycka med digitaltryck (DTG).

Klubbens regelbok (måste följas utan undantag):
${club.rules.map((r) => `- ${r}`).join("\n")}
- Tonalitet: ${club.tone}
- Smeknamn som får användas: ${club.nicknames.join(", ")}
- Hemmaarena: ${club.arena}. Grundad ${club.founded}. Klubbens devis: "${club.tagline}".

Du är ${club.agent.name}. Uppdrag: ${club.agent.mission}
Riktlinjer:
${club.agent.guidelines.map((g) => `- ${g}`).join("\n")}

${club.agent.satire.allowed ? `SATIRLÄGE (mode "satir") – får användas i högst ${club.agent.satire.maxPerRun} förslag, och bara ${club.agent.satire.when}
${club.agent.satire.rules.map((r) => `- ${r}`).join("\n")}
- Extra färger som bara får användas i satirläge: ${club.agent.satire.extraColors.map((c) => `${c.name} ${c.hex}`).join(", ")}.
- Alla andra förslag har mode "standard" och följer klubbens färger strikt.` : ""}

Tänk bästsäljare, inte reklam: varje förslag ska ha EN stark idé som supportrarna direkt känner igen, ett stort och tydligt huvudmotiv, en slogan man vill säga högt och en känsla av stolthet eller humor. Undvik det generiska (diagram, abstrakta former, vaga stämningar).

${count === signals.length ? `Ta fram exakt ${count} förslag – ett per signal, i samma ordning som signalerna. Gör dem tydligt olika varandra i stil och idé.` : `Ta fram exakt ${count} förslag. Sprid dem över signalerna – varje signal ska få minst ett förslag om det finns plats, trender och högtider nära i tid prioriteras.`}
Variera stilen: humor/göteborgsk ordvits, retro, typografiskt minimalistiskt, illustrativt.
Så använder du signalerna efter typ:
- [match]: nästa match eller färsk seger – skarpast i tid, prioritera högt. Mot en rival passar satirläget.
- [podcast]: läktarens egna uttryck och skämt – bästa underlaget för satir och ordvitsar.
- [club]: klubbens egna evenemang och historia – stolthet och nostalgi.
- [weather]: styr främst produktvalet (products), inte motivet. Kallt eller regn ger hoodie, varmt ger t-tröja.
- [search]: använd bara om kopplingen till klubben är självklar.

Fält:
- signal: exakt titeln på signalen förslaget bygger på.
- title: kort internt namn på motivet.
- slogan: texten som trycks, max ${club.maxSloganLength} tecken, på svenska.
- story: 1–2 meningar om varför motivet träffar supportrarna just nu.
- style: stilbeskrivning på engelska, 3–6 ord.
- artDirection: bildbeskrivning på engelska till en bildmodell. Beskriv ENDAST illustrationen (objekt, komposition, formspråk). Nämn inga färger utanför paletten, ingen text, ingen logga, inga personer.
- palette: 2–3 färgkoder ur paletten.
- products: 2–3 produkt-id som passar motivet och årstiden.`;

  const user = `Signaler just nu:
${signals.map(describeSignal).join("\n")}

Produkter som finns:
${CATALOG.map((p) => `- ${p.id}: ${p.name} (${p.garmentColor})`).join("\n")}`;

  const out = await generateJson<{ concepts: Omit<Concept, "id">[] }>({
    system,
    user,
    schemaName: "concepts",
    schema: conceptSchema(club, signals),
  });
  return out.concepts.slice(0, count).map((c) => ({ ...c, id: randomUUID() }));
}

export function artworkPrompt(club: Club, concept: Concept) {
  const all = [...club.palette, ...club.agent.satire.extraColors];
  const colors = concept.palette.map((hex) => `${all.find((c) => c.hex === hex)?.name ?? hex} (${hex})`).join(", ");
  const satire =
    concept.mode === "satir"
      ? "\nThis is a light-hearted supporter satire/meme motif. Rival colours may appear only as a small comic element. Never draw any real club crest, logo or trademark.\n"
      : "";
  return `Print-ready graphic for a football supporter garment, direct-to-garment print.
Subject: ${concept.artDirection}
Style: ${concept.style}. Flat, bold vector-like shapes, clean edges, screen-print feel, no gradients, no photographic detail.
Make it a best-selling supporter tee graphic: one big, iconic central motif with a strong silhouette that fills most of the canvas, high contrast, instantly readable from a distance.
Colour palette strictly limited to: ${colors}. Do not use any other colours.${satire}
Transparent background. Centered composition with generous empty margin around the motif.
Absolutely no text, letters, numbers, logos, shield or crest shapes, flags with symbols, or real people.`;
}

const obj = (props: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(props),
  properties: props,
});
const str = { type: "string" };
const strArr = { type: "array", items: str };

const contentSchema = obj({
  instagram: obj({ caption: str, hashtags: strArr }),
  facebook: obj({ post: str }),
  linkedin: obj({ post: str }),
  tiktok: obj({ hook: str, script: strArr, caption: str }),
  newsletter: obj({ subject: str, body: str }),
  banner: obj({ headline: str, subline: str, altText: str }),
  tv: obj({ headline: str, subline: str }),
  plan: { type: "array", items: obj({ date: str, channel: str, action: str }) },
});

export async function createContentPack(
  club: Club,
  concept: Concept,
  signal: Signal | undefined,
  products: { name: string; garmentColor: string; priceSek: number }[],
  shopUrl: string,
  today: string,
): Promise<ContentPack> {
  const system = `Du skriver marknadsföring för ${club.name} ("${club.tagline}") som klubbens kansli själv ska publicera. Tonalitet: ${club.tone}
Skriv på svenska. Produkterna trycks på beställning och finns i klubbens butik hos Intersport; varje köp stöttar klubben.
Hitta inte på priser, rabatter eller datum utöver det som anges. Använd länken exakt som den står. Nämn inga spelares namn.
- instagram.caption: max 300 tecken, 1–2 emojis. Skriv "Länk i bio" – ingen URL i texten. hashtags: 5–8 st utan #.
- tiktok.caption: skriv "Länk i bio" – ingen URL.
- Om signalen kommer från en nyhet: bygg på det som hänt, men citera inte artikeln och nämn inte tidningen.
- facebook.post: 2–4 meningar, varm och inkluderande, riktad till familjer och medlemmar.
- linkedin.post: 3–5 meningar i professionell ton för sponsorer och partners: klubbens egen merch, tryck på beställning utan lager, pengar tillbaka till föreningen.
- tiktok: hook (första 2 sekunderna), script med 3–5 scener för en 10-sekundersfilm, caption.
- newsletter: ämnesrad och brödtext (max 120 ord) till medlemmarna.
- banner: headline max 5 ord, subline max 10 ord, altText för hemsidebannern.
- tv: headline max 5 ord och subline max 10 ord för skärmar i klubbhuset och på arenan.
- plan: 4–6 steg för när kansliet ska publicera vad, med datum (ÅÅÅÅ-MM-DD). Sprid ut stegen: från ${today} fram till och med händelsens datum om det ligger i framtiden, annars över de kommande 10 dagarna. Ett steg per rad, en kanal per steg. Skriv bara konkreta instruktioner till kansliet – inga kommentarer om underlaget eller osäkerheter.`;

  const user = `Signal: ${signal ? describeSignal(signal) : concept.signal}
Motiv: ${concept.title}. Slogan: "${concept.slogan}". ${concept.story}
Produkter: ${products.map((p) => `${p.name} ${p.garmentColor} ${p.priceSek} kr`).join("; ")}
Länk: ${shopUrl}`;

  return generateJson<ContentPack>({ system, user, schemaName: "content_pack", schema: contentSchema });
}

export function demoConcepts(club: Club, signals: Signal[], count = SUGGESTIONS): Concept[] {
  const [blue, white, navy] = club.palette.map((c) => c.hex);
  const pick = (i: number) => signals[i % signals.length]?.title ?? "Säsong";
  const base: Omit<Concept, "id">[] = [
    { signal: pick(0), mode: "standard", title: "Änglavakt", slogan: "Änglarna håller vakt", story: "Änglavingar över Gamla Ullevi.", style: "bold flat vector illustration", artDirection: "Large stylised angel wings over a simplified stadium silhouette", palette: [blue, white], products: ["tee-white", "hoodie-navy"] },
    { signal: pick(1), mode: "standard", title: "Retro 1904", slogan: "Blåvitt sedan 1904", story: "Vintagekänsla för alla generationer.", style: "retro 70s screen print", artDirection: "A vintage leather football with sun rays behind it", palette: [blue, navy, white], products: ["tee-navy", "mug-white"] },
    { signal: pick(2), mode: "standard", title: "Göteborgsvits", slogan: "Tre poäng och en räka", story: "Göteborgshumor med glimten i ögat.", style: "playful cartoon sticker style", artDirection: "A cheerful cartoon shrimp wearing a scarf, kicking a ball", palette: [blue, white], products: ["tee-white", "mug-white"] },
    { signal: pick(3), mode: "standard", title: "Minimal rand", slogan: "Blått blod", story: "Diskret och typografiskt.", style: "minimal geometric stripes", artDirection: "Five vertical stripes forming a subtle heart shape", palette: [blue, white], products: ["tee-navy", "hoodie-navy"] },
  ];
  return base.slice(0, count).map((c) => ({ ...c, id: randomUUID() }));
}

export function demoArtworkSvg(club: Club, concept: Concept) {
  const [a, b] = [concept.palette[0] ?? club.palette[0].hex, concept.palette[1] ?? "#FFFFFF"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512 512)">
    <circle r="360" fill="${a}"/>
    <circle r="300" fill="none" stroke="${b}" stroke-width="24" stroke-dasharray="40 24"/>
    <path d="M-260 40 C-180 -220 -40 -120 0 -40 C40 -120 180 -220 260 40 C160 -20 60 20 0 80 C-60 20 -160 -20 -260 40Z" fill="${b}"/>
    <circle r="70" cy="150" fill="${b}"/>
  </g>
</svg>`;
}

export function demoContentPack(club: Club, concept: Concept, shopUrl: string, today: string): ContentPack {
  return {
    instagram: {
      caption: `${concept.slogan} 💙🤍 Nytt motiv – trycks på beställning och finns nu i klubbshoppen hos Intersport. Varje köp stöttar ${club.shortName}. Länk i bio.`,
      hashtags: ["blåvitt", "ifkgöteborg", "änglarna", "gamlaullevi", "allsvenskan"],
    },
    facebook: { post: `Nytt motiv: "${concept.slogan}". ${concept.story} Trycks på beställning och finns i klubbens butik hos Intersport – varje köp stöttar klubben. ${shopUrl}` },
    linkedin: { post: `${club.name} lanserar "${concept.slogan}" – egen merch som trycks på beställning, utan lager och utan svinn. Varje köp går tillbaka till föreningen. ${shopUrl}` },
    tiktok: { hook: `${concept.slogan} 💙`, script: ["Närbild på tröjan", `Text: "${concept.slogan}"`, "Snabbklipp: t-shirt, hoodie, mugg", "Slut: länk i bio"], caption: `${concept.slogan} – länk i bio` },
    newsletter: { subject: `${concept.slogan} – nytt i klubbshoppen`, body: `Hej Blåvitt-vän!\n\n${concept.story}\n\nProdukterna trycks på beställning och varje köp stöttar klubben.\n\n${shopUrl}` },
    banner: { headline: concept.slogan, subline: "Nu i klubbshoppen hos Intersport", altText: `${club.name}: ${concept.slogan} – ny merch` },
    tv: { headline: concept.slogan, subline: "Skanna eller sök Blåvitt i Intersports klubbshop" },
    plan: [
      { date: today, channel: "Hemsida", action: "Lägg upp bannern på startsidan" },
      { date: today, channel: "Instagram", action: "Publicera inlägget och storyn" },
      { date: today, channel: "Facebook", action: "Publicera inlägget" },
      { date: today, channel: "Nyhetsbrev", action: "Skicka till medlemmarna" },
    ],
  };
}
