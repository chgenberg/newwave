/** Vad varje mottagare hos New Wave får från hubben, per metod – samma krav som tryckerierna ställer på inskickade original. */
export const FORMATS = [
  {
    method: "dtg",
    label: "DTG",
    files: "PNG · 300 dpi · alfa",
    rules: ["Exakt tryckstorlek, ingen skalning i RIP:en", "sRGB in – RIP:en gör CMYK och vitt underlag", "Transparent bakgrund med rena kanter"],
  },
  {
    method: "screentryck",
    label: "Screentryck",
    files: "PNG-filmer + SVG",
    rules: ["En schablon per färg i 100 % svart", "Pantone och passmärken på varje film", "Vitt underlag på mörka plagg, krympt 0,25 mm"],
  },
  {
    method: "transfer",
    label: "Transfer (DTF)",
    files: "PNG · 300 dpi",
    rules: ["Rättvänd, ingen spegling", "Skrivaren lägger vitt under allt", "Namnark och namnlista som CSV"],
  },
  {
    method: "brodyr",
    label: "Brodyr",
    files: "DST + stygnplan",
    rules: ["Tajima DST i 0,1 mm – läses av nästan alla maskiner", "DST saknar färger: trådordningen står i stygnplanen", "Tatami 0,4 mm med underlag"],
  },
  {
    method: "gravyr",
    label: "Lasergravyr",
    files: "SVG + PNG 600 dpi",
    rules: ["En ton: svart är där lasern bränner", "Inga konturer, bara fyllda ytor", "Ritytan är graveringsytan"],
  },
  {
    method: "sublimering",
    label: "Sublimering",
    files: "PNG · 300 dpi · spegelvänd",
    rules: ["Mugg 200 × 90 mm + 3 mm utfall", "Motivet mitt emot handtaget", "sRGB in – RIP:ens sublimeringsprofil"],
  },
  {
    method: "digitaltryck",
    label: "Digitaltryck (UV)",
    files: "PNG färglager + vitt lager",
    rules: ["CMYK (FOGRA39) i RIP:en", 'Vitt som eget spotlager "White"', "Exakt tryckyta – inget utfall på produkter"],
  },
  {
    method: "stickning",
    label: "Jacquardstickning",
    files: "BMP + PNG med palett",
    rules: ["En pixel är en maska, 240 × 1 210", "Varje palettfärg är ett garn, högst sju", "Garnlista med närmaste Pantone"],
  },
] as const;

export function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} kB`;
  return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(n / 1024 / 1024)} MB`;
}
