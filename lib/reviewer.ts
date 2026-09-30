import sharp from "sharp";
import { openai, TEXT_MODEL } from "./openai";
import type { Club, Concept, Review } from "./types";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["realism", "relevance", "brandFit", "sales", "strengths", "issues", "summary"],
  properties: {
    realism: { type: "integer", minimum: 1, maximum: 10 },
    relevance: { type: "integer", minimum: 1, maximum: 10 },
    brandFit: { type: "integer", minimum: 1, maximum: 10 },
    sales: { type: "integer", minimum: 1, maximum: 10 },
    strengths: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

export function verdictFor(club: Club, r: Pick<Review, "realism" | "brandFit" | "sales">): Review["verdict"] {
  const t = club.agent.review;
  return r.sales >= t.minSales && r.realism >= t.minRealism && r.brandFit >= t.minBrandFit ? "publicera" : "underkänd";
}

export async function reviewAsset(
  club: Club,
  concept: Concept,
  images: Buffer[],
  kind: "motiv" | "produktfoto",
): Promise<Review> {
  const inputs = await Promise.all(
    images.map(async (img) => {
      const jpg = await sharp(img).flatten({ background: "#FFFFFF" }).resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      return { type: "input_image" as const, image_url: `data:image/jpeg;base64,${jpg.toString("base64")}`, detail: "auto" as const };
    }),
  );
  const t = club.agent.review;
  const satire = concept.mode === "satir";

  const b = club.kind === "brand";
  const res = await openai().responses.create({
    model: TEXT_MODEL,
    input: [
      {
        role: "system",
        content: `Du är granskaragenten för ${club.name} – en erfaren merchansvarig och art director som bestämmer om material får publiceras i ${b ? `${club.name}-shoppen` : "klubbshoppen hos Intersport"}. Var ärlig och kräsen: betyget 8 betyder "jag skulle själv lägga ut det här i dag", 10 är sällsynt.

${b ? "Varumärkets" : "Klubbens"} riktlinjer:
${club.agent.guidelines.map((g) => `- ${g}`).join("\n")}
${club.rules.map((r) => `- ${r}`).join("\n")}
${satire ? `Detta är SATIR/MEME-läge. Regler:\n${club.agent.satire.rules.map((r) => `- ${r}`).join("\n")}` : b ? `Standardläge: bara ${club.name}s färger och logga.` : "Standardläge: bara klubbens färger och symboler."}

Betygsätt 1–10:
- realism: ${kind === "produktfoto" ? "ser fotot ut som ett riktigt kampanjfoto? Naturliga människor, händer, ansikten, tyg, ljus och tryck som ligger rätt på plagget. Allt som ser AI-genererat ut drar ner kraftigt." : "ser motivet professionellt och tryckfärdigt ut, som från en riktig designbyrå?"}
- relevance: träffar det signalen ("${concept.signal}") och känns aktuellt för ${b ? "stamkunderna" : "supportrarna"} just nu?
- brandFit: följer det ${b ? "varumärkets" : "klubbens"} riktlinjer, färger och tonläge? ${b ? "Konkurrenters namn, loggor eller färger" : "Andra klubbars sköldar eller varumärken"} ger 1.
- sales: hur troligt är det att en ${b ? "stamkund" : "supporter"} köper det här? Tänk på känsla, humor, stolthet, bärbarhet och om det sticker ut i ett flöde.
strengths/issues: korta punkter på svenska. summary: en mening.`,
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `${kind === "produktfoto" ? "Produktfoton" : "Motiv"} för "${concept.slogan}" (${concept.title}). ${concept.story}${
              kind === "motiv"
                ? b
                  ? `\nBilden är en enkel platt skiss av en t-shirt som bara visar trycket. Bedöm själva trycket – motiv, slogan och logga – inte skissen. Loggan i trycket är ${club.name}s officiella och ska inte räknas som ett fel.`
                  : "\nBilden är en enkel platt skiss av en t-shirt som bara visar trycket. Bedöm själva trycket – motiv, slogan och sköld – inte skissen. Skölden i trycket är klubbens officiella och ska inte räknas som ett fel."
                : b
                  ? `\nTrycket på plagget är lagt från ${club.name}s exakta originalfil, inklusive den officiella loggan. Bedöm fotots realism, hur naturligt trycket sitter på plagget och hur säljande helheten är.`
                  : "\nTrycket på plagget är lagt från klubbens exakta originalfil, inklusive den officiella skölden. Bedöm fotots realism, hur naturligt trycket sitter på plagget och hur säljande helheten är."
            }`,
          },
          ...inputs,
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "review", schema, strict: true } },
  });

  const r = JSON.parse(res.output_text) as Omit<Review, "verdict">;
  void t;
  return { ...r, verdict: verdictFor(club, r) };
}
