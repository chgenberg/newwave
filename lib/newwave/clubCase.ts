import { CLUBS } from "@/lib/club";
import type { ApprovalProduct, PackAssets, PackContent, PackPhoto } from "./store";

/**
 * Ett färdigt veckopaket för Åsa IF, som klubbens visning spelar upp: från veckans signaler och fyra motiv till
 * mejlet, tryckfilerna hos New Wave och produkterna i Intersport-butiken. Allt ligger i `public`, så visningen
 * fungerar likadant för alla och utan AI.
 */

const DIR = "/newwave/clubs/asa-if/klubbandan";
const SHOP = CLUBS["asa-if"].intersportShopUrl;
const DROP = "asa-if-v42-klubbandan";
const utm = (source: string, medium: string) => `${SHOP}?drop=${DROP}&utm_source=${source}&utm_medium=${medium}&utm_campaign=${DROP}&utm_content=asa-if`;

export type CaseMotif = { slogan: string; signal: string; story: string; brand: number; sales: number; note: string };

export const CLUB_CASE = {
  id: "v42",
  week: 42,
  title: "Åsa har klubbanda",
  occasion: "Säsongsavslutning",
  story:
    "När knattefotbollen spelar sin sista helg samlas hela Åsa, och då ska klubbandan synas. Åsa IF:s sköld i gult och svart sitter stort fram, utan krusiduller, så att fotbollen, pingisfamiljen och innebandygänget bär samma märke.",
  signals: [
    { title: "Knattefotbollens sista helg", detail: "Åsavallen" },
    { title: "Öppen hall – innebandy", detail: "Fredag 16–17.30" },
    { title: "Halloween", detail: "Lördag 31 oktober" },
  ],
  motifs: [
    {
      slogan: "Åsa har klubbanda",
      signal: "Knattefotbollens sista helg",
      story: "Klubbens sköld stort fram – samma märke för knattefotbollen, pingisfamiljen och innebandygänget.",
      brand: 9,
      sales: 9,
      note: "Märket alla redan känner igen: rent, tidlöst och lätt att trycka – och det säljer långt efter veckan.",
    },
    {
      slogan: "Åsa har hallkoll",
      signal: "Öppen hall – innebandy",
      story: "Fredagens öppna hall får en varm ordvits och en dörr på vid gavel: alla åldrar och hela Åsa är välkomna.",
      brand: 9,
      sales: 8,
      note: "Välkomnande och lätt att bära även efter veckan, men säljer något sämre än klubbmärket.",
    },
    {
      slogan: "Läskigt bra i Åsa",
      signal: "Halloween",
      story: "En fotbollspumpa gör Halloween och knattefotbollen till samma glada motiv, utan att bli otäckt för de yngsta.",
      brand: 8,
      sales: 8,
      note: "Snäll Halloweenhumor för familjer, men känns gammal efter den 31 oktober och pingis och innebandy får mindre att känna igen sig i.",
    },
    {
      slogan: "Åsa förenar sedan 1919",
      signal: "Öppen hall – innebandy",
      story: "Ett retromotiv med fotboll, pingis och innebandy som låter alla sektioner bära samma stolthet.",
      brand: 7,
      sales: 6,
      note: "Bygger gemenskap, men kopplingen till veckan är svag och motivet säljer sämst av de fyra.",
    },
  ] satisfies CaseMotif[],
  picked: 0,
  printFiles: { light: `${DIR}/tryck-ljus.png`, dark: `${DIR}/tryck-mork.png` },
  assets: { feed: `${DIR}/instagram.png`, story: `${DIR}/story.png`, banner: `${DIR}/banner.png`, poster: `${DIR}/affisch.png` } satisfies PackAssets,
  photos: [
    { id: "livsstil", label: "Livsstil", url: `${DIR}/foto-livsstil.jpg` },
    { id: "filt", label: "Filt i soffan", url: `${DIR}/foto-filt.jpg` },
  ] satisfies PackPhoto[],
  products: [
    { id: "p002", name: "T-shirt Premium svart", priceSek: 349, mockupUrl: `${DIR}/p002.jpg` },
    {
      id: "p004",
      name: "Hoodie svart",
      priceSek: 599,
      mockupUrl: `${DIR}/p004.jpg`,
      custom: { design: { method: "screentryck", colors: 2, shape: "original", zone: "brost", sizeCm: 24 }, color: "#111111" },
    },
    { id: "p011", name: "Keps svart", priceSek: 249, mockupUrl: `${DIR}/p011.jpg` },
    {
      id: "p022",
      name: "Mugg vit",
      priceSek: 179,
      mockupUrl: `${DIR}/p022.jpg`,
      custom: { design: { method: "sublimering", colors: 4, shape: "original", zone: "front", sizeCm: 8 }, color: "#F4F3EF" },
    },
  ] satisfies ApprovalProduct[],
  content: {
    instagram: {
      caption:
        "Åsa har klubbanda – och nu syns den. Vår sköld i gult och svart, stort fram på T-shirt 349 kr och hoodie 599 kr, och på keps 249 kr och mugg 179 kr. Trycks på beställning hos Intersport, och varje köp stöttar Åsa IF. För hela vårt fotbolls-, pingis- och innebandygäng. Länk i bio 💛🖤",
      hashtags: ["ÅsaIF", "ÅsaHarKlubbanda", "Klubbmärket", "Säsongsavslutning", "Klubbmerch", "Föreningsliv", "Åsa"],
    },
    facebook: {
      post: `Knattefotbollens sista helg på Åsavallen – och klubbandan ska synas! Motivet ”Åsa har klubbanda” är helt enkelt vår sköld, stort fram. Samma märke för knattefamiljerna, pingisgänget och innebandyvännerna. Välj T-shirt för 349 kr, hoodie för 599 kr, keps för 249 kr eller mugg för 179 kr. Allt trycks på beställning, och varje köp stöttar vår förening. Hitta familjens favorit i Åsa IF:s butik hos Intersport: ${utm("facebook", "social")}`,
    },
    newsletter: {
      subject: "Åsa har klubbanda – bär märket till säsongsavslutningen",
      body: `Hej alla medlemmar!\n\nKnattefotbollens sista helg är här och hela Åsa samlas på Åsavallen. Därför gör vi det enkelt: motivet ”Åsa har klubbanda” är Åsa IF:s sköld i gult och svart, stort fram. Märket som hela föreningen redan bär, från pingisfamiljen till fotbolls- och innebandygänget.\n\nVälj T-shirt för 349 kr, hoodie för 599 kr, keps för 249 kr eller mugg för 179 kr. Allt trycks på beställning och varje köp stöttar Åsa IF.\n\nHitta din favorit i klubbens butik hos Intersport:\n${utm("nyhetsbrev", "email")}\n\nTack för att du bär vår gemenskap vidare!\nÅsa Idrottsförening sedan 1919`,
    },
    banner: {
      headline: "Åsa har klubbanda",
      subline: "Vårt märke, stort fram. Varje köp stöttar Åsa IF.",
      altText: "Svart T-shirt med Åsa IF:s gula och svarta sköld stort fram. Åsa IF:s motiv ”Åsa har klubbanda”.",
    },
    tiktok: {
      hook: "Det här är vår klubbanda 💛🖤",
      script: [
        "0–2 sek: Zooma in på skölden på bröstet. Säg: ”Det här är vår klubbanda.”",
        "2–4 sek: Visa T-shirten, hoodien, kepsen och muggen. Text: ”Åsa har klubbanda”.",
        "4–7 sek: Klipp mellan en fotboll, ett pingisrack och en innebandyklubba. Text: ”Tre sporter. Samma märke.”",
        "7–10 sek: Visa produkterna igen. Text: ”Trycks på beställning. Varje köp stöttar Åsa IF.” Avsluta med ”Länk i bio”.",
      ],
      caption: "Samma märke, hela Åsa 💛🖤 T-shirt, hoodie, keps och mugg – trycks på beställning i klubbens butik hos Intersport. Varje köp stöttar Åsa IF. Länk i bio",
    },
  } satisfies PackContent,
  shopUrl: `${SHOP}?drop=${DROP}`,
  mailedAt: "Måndag 12 oktober kl. 07.00",
  approvedAt: "2026-10-12T08:14:00+02:00",
};
