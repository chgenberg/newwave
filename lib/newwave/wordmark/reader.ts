import { type Content, visionJson } from "@/lib/brandVision";
import { FONT_ROLES, type FontRole } from "./fonts";
import { type Candidate, isTextRole, READ_ROLES, type ReadRole, type TextStyle } from "./importSvg";
import type { Answer } from "./memory";
import { COLOR_SLOTS, type ColorSlot } from "./schema";

/**
 * Läsagenten: tittar på en färdig design gjord för en klubb och säger vilken del som är namnet, märket och dekoren,
 * och vilka färger som är klubbens. Svaret pekar bara på delarna och färgerna i filen – själva mallen byggs av
 * importSvg i webbläsaren, så agenten kan inte hitta på grafik.
 */

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["club", "parts", "colors", "notes", "mark"],
  properties: {
    club: { type: "string", description: "Klubben designen är gjord för, som namnet står i designen" },
    parts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["i", "role", "text", "font", "upper"],
        properties: {
          i: { type: "integer" },
          role: { type: "string", enum: [...READ_ROLES] },
          text: { type: "string", description: "Det som står i delen, tecken för tecken som det syns (versaler som versaler); tom sträng när delen inte är text" },
          font: { type: "string", enum: [...FONT_ROLES, "none"] },
          upper: { type: "boolean" },
        },
      },
    },
    colors: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["hex", "slot"], properties: { hex: { type: "string" }, slot: { type: "string", enum: [...COLOR_SLOTS] } } },
    },
    notes: { type: "array", items: { type: "string" }, description: "Bara det Craft behöver kontrollera, som en osäker tolkning – högst tre korta meningar på svenska, tom lista när allt är tydligt" },
    mark: { type: "string", description: "Varumärket när designen är ett känt märke som tillhör någon annan än en svensk idrottsförening, t.ex. \"Miami Dolphins (NFL)\"; annars tom sträng" },
  },
} as const;

const SYSTEM = `Du är formgivare på ett tryckeri för idrottsklubbar. Du får en färdig design – ett tryck, ordmärke eller emblem – som är gjord för en klubb, och ska göra den till en mall så att exakt samma design kan tryckas för andra klubbar: klubbens namn byts mot den nya klubbens namn, klubbmärket mot deras märke och klubbens färger mot deras färger. Allt annat ska se likadant ut.

Designen är uppdelad i numrerade delar. Ge varje del en roll:
- name: hela klubbnamnet på en rad, med föreningsförkortningen, t.ex. "IFK GÖTEBORG".
- name1: när namnet är uppdelat, föreningsförkortningen eller första ordet ("IFK").
- name2: när namnet är uppdelat, huvudnamnet eller orten ("GÖTEBORG"). Står bara huvudnamnet eller orten, utan förkortning ("Onsala", "GÖTEBORG"), är det också name2 – även när name1 saknas i designen.
- monogram: förkortningen eller initialen som ett eget stort tecken ("IFK" ensamt, ett stort "G").
- tagline: en rad som "Sedan 1904", "Est. 1904" eller sporterna.
- sport: sportens namn ensam ("FOTBOLL").
- year: grundandeåret ensamt ("1904"), när det står för sig självt. Står det i en rad som "Sedan 1904" får både ordet och årtalet tagline, även om de är två delar – raden skriver själv ut den nya klubbens år.
- ornament: dekor som står kvar i den nya klubbens färger – ränder, ramar, stjärnor, linjer, en sköld eller ruta bakom texten, och fast text ritad som former (t.ex. "SUPPORTER") som inte är klubbens namn.
- icon: klubbens märke eller emblem, som ersätts av den nya klubbens märke. Alla delar som tillsammans bildar märket får icon.
- ignore: bakgrund som täcker hela ytan, osynliga hjälpformer, beskärningsramar och sådant som inte hör till designen.
Är namnet ritat som former bokstav för bokstav får alla bokstäverna samma roll. Ta med varje del exakt en gång.

Typsnitt: delar med kind "text" är levande text och har typsnittet i filen. För alla andra delar som får en textroll (name, name1, name2, monogram, tagline, sport, year) är texten ritad som former – ange stilen den liknar mest i font:
- block: tung sans-serif (Arial Black, Futura Bold, Gotham Black). condensed: smal och hög (Impact, Bebas, Oswald).
- caps: slab-serif i halvfet vikt (Rockwell, Clarendon). slab: mycket tung slab-serif med korta, tjocka serifer.
- serif: klassisk serif med kontrast (Times, Trajan, Georgia). varsity: college-typsnitt med fyrkantiga serifer.
- script: skrivstil eller penselskrift. sport: sportig, kursiv och dynamisk.
upper = true när texten står i versaler. Delar som inte har en textroll får font "none" och upper false.
Skriv i text exakt vad som står i varje del med en textroll – "Dolphins", "MIAMI", "SEDAN 1904" – även när den är ritad som former; texten används för att mäta typsnittet mot originalet. Är ett ord delat på flera delar får varje del sina egna tecken.

Färger: ge varje färg som delarna använder en plats:
- primary: klubbens huvudfärg. secondary: klubbens andrafärg.
- ink: svart eller mörk neutral som inte är en klubbfärg.
- paper: plaggets eller bakgrundens färg, oftast vitt, som ska följa plagget.
- on: text eller detaljer som ligger ovanpå en yta i huvudfärgen, som vit text på en blå sköld.

Varumärken: är designen ett känt märke som tillhör ett proffslag, en liga, ett företag eller ett annat lands förbund – som Miami Dolphins, NFL, Nike eller Coca-Cola – skriv vems i mark. Craft får då en påminnelse om att bara stilen får användas. En svensk förenings eget märke eller ett vanligt ordmärke är inte ett sådant varumärke.

Den första bilden är designen. Den andra är samma design på grå botten med en färgad ruta och ett nummer för varje del.`;

const HEX = /^#[0-9A-F]{6}$/;

type Raw = { club: string; parts: { i: number; role: string; text: string; font: string; upper: boolean }[]; colors: { hex: string; slot: string }[]; notes: string[]; mark: string };

export async function readDesign(input: { name: string; candidates: Candidate[]; image: string; annotated: string; fonts?: string[]; lessons?: string[] }): Promise<Answer> {
  const fonts = input.fonts?.length ? `\nTypsnitt som används i filen: ${input.fonts.join(", ")}.` : "";
  const learned = input.lessons?.length ? `\nCraft har rättat tidigare tolkningar så här – gör likadant när du ser samma sak:\n${input.lessons.map((l) => `- ${l}`).join("\n")}\n` : "";
  const content: Content[] = [
    { type: "input_text", text: `Filen heter "${input.name}".${fonts}${learned} Delarna (ruta = x, y, bredd, höjd där designens långsida är 1000; colors = färgerna i delen, vanligast först; text = texten i delen när den går att läsa ur filen):\n${JSON.stringify(input.candidates)}` },
    { type: "input_image", image_url: input.image, detail: "low" },
    { type: "input_image", image_url: input.annotated, detail: "high" },
  ];
  const raw = await visionJson<Raw>(SYSTEM, content, { name: "design_reading", schema: SCHEMA }, 90_000);
  const byIndex = new Map(input.candidates.map((c) => [c.i, c]));
  const used = new Set(input.candidates.flatMap((c) => c.colors));
  const roles: Record<number, ReadRole> = {};
  const styles: Record<number, TextStyle> = {};
  const texts: Record<number, string> = {};
  for (const p of raw.parts ?? []) {
    const c = byIndex.get(p.i);
    if (!c || !(READ_ROLES as readonly string[]).includes(p.role) || roles[p.i] !== undefined) continue;
    roles[p.i] = p.role as ReadRole;
    if (c.kind !== "text" && (FONT_ROLES as readonly string[]).includes(p.font)) styles[p.i] = { font: p.font as FontRole, upper: Boolean(p.upper) };
    if (isTextRole(p.role) && p.text?.trim()) texts[p.i] = p.text.trim().slice(0, 60);
  }
  // En del agenten hoppade över står kvar som dekor hellre än att försvinna ur designen.
  for (const c of input.candidates) roles[c.i] ??= "ornament";
  const colors: Record<string, ColorSlot> = {};
  for (const c of raw.colors ?? []) {
    const hex = c.hex.trim().toUpperCase();
    if (HEX.test(hex) && used.has(hex) && (COLOR_SLOTS as readonly string[]).includes(c.slot)) colors[hex] = c.slot as ColorSlot;
  }
  const mark = (raw.mark ?? "").trim().slice(0, 120);
  return { roles, colors, styles, texts, club: (raw.club ?? "").slice(0, 80), notes: (raw.notes ?? []).slice(0, 3).map((n) => n.slice(0, 200)), ...(mark ? { mark } : {}) };
}
