import type { Signal } from "./types";

type Occasion = { id: string; title: string; detail: string; date: Date };

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const iso = (date: Date) => date.toISOString().slice(0, 10);
const DAY = 86_400_000;

function nthWeekday(y: number, m: number, weekday: number, n: number) {
  const first = d(y, m, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return d(y, m, 1 + offset + (n - 1) * 7);
}

function lastWeekday(y: number, m: number, weekday: number) {
  const last = d(y, m + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return d(y, m, last.getUTCDate() - offset);
}

function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const dd = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(y, month, day);
}

function occasionsForYear(y: number): Occasion[] {
  const midsummerEve = (() => {
    for (let day = 19; day <= 25; day++) if (d(y, 6, day).getUTCDay() === 5) return d(y, 6, day);
    return d(y, 6, 19);
  })();
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  return [
    { id: "alla-hjartans", title: "Alla hjärtans dag", detail: "Kärlek till klubben – par, familj och läktarkompisar.", date: d(y, 2, 14) },
    { id: "allsvenskan-premiar", title: "Allsvenskan drar igång", detail: "Säsongspremiär – ny säsong, nya drömmar.", date: nthWeekday(y, 4, 6, 1) },
    { id: "pask", title: "Påsk", detail: "Påskhälsning från klubben.", date: easter(y) },
    { id: "valborg", title: "Valborg", detail: "Vårkänslor och brasa – våren är fotbollens högtid.", date: d(y, 4, 30) },
    { id: "mors-dag", title: "Mors dag", detail: "Mammor som skjutsat, hejat och tvättat matchställ i generationer.", date: lastWeekday(y, 5, 0) },
    { id: "nationaldagen", title: "Nationaldagen", detail: "Blått, vitt och stolthet.", date: d(y, 6, 6) },
    { id: "midsommar", title: "Midsommar", detail: "Sommar, sill och sommaruppehåll.", date: midsummerEve },
    { id: "skolstart", title: "Skolstart", detail: "Nya ryggsäckar, nya träningar – barn och ungdom tillbaka.", date: d(y, 8, 20) },
    { id: "halloween", title: "Halloween", detail: "Läskigt bra – spöken, pumpor och blåvit skräck för motståndarna.", date: d(y, 10, 31) },
    { id: "allsvenskan-final", title: "Sista omgången", detail: "Säsongsavslutning – tack för i år.", date: nthWeekday(y, 11, 0, 1) },
    { id: "fars-dag", title: "Fars dag", detail: "Pappor som tagit med barnen till matcherna i generationer.", date: nthWeekday(y, 11, 0, 2) },
    { id: "black-friday", title: "Black Friday", detail: "Årets största shoppinghelg – julklappar i blåvitt.", date: new Date(thanksgiving.getTime() + DAY) },
    { id: "lucia", title: "Lucia", detail: "Ljus i mörkret.", date: d(y, 12, 13) },
    { id: "jul", title: "Jul", detail: "Julklappar och mys i klubbens färger.", date: d(y, 12, 24) },
    { id: "nyar", title: "Nyår", detail: "Nytt år, ny säsong att se fram emot.", date: d(y, 12, 31) },
  ];
}

export function seasonFor(date: Date): Signal {
  const m = date.getUTCMonth() + 1;
  const [title, detail] =
    m <= 2 || m === 12
      ? ["Vinter", "Mörker, kyla och försäsong – mössor, hoodies och termosmuggar."]
      : m <= 5
        ? ["Vår", "Premiär, ljus och första matcherna på gräs."]
        : m <= 8
          ? ["Sommar", "Sommarfotboll, cuper och semester – t-shirts och kepsar."]
          : ["Höst", "Höstruset och avgörande matcher – hoodies och mössor."];
  return { id: `season-${title.toLowerCase()}`, kind: "season", title, detail };
}

export function upcomingOccasions(from: Date, windowDays = 60): Signal[] {
  const y = from.getUTCFullYear();
  const start = d(y, from.getUTCMonth() + 1, from.getUTCDate()).getTime();
  return [...occasionsForYear(y), ...occasionsForYear(y + 1)]
    .map((o) => ({ ...o, days: Math.round((o.date.getTime() - start) / DAY) }))
    .filter((o) => o.days >= 0 && o.days <= windowDays)
    .sort((a, b) => a.days - b.days)
    .map((o) => ({
      id: `${o.id}-${o.date.getUTCFullYear()}`,
      kind: "occasion" as const,
      title: o.title,
      detail: o.detail,
      date: iso(o.date),
      daysUntil: o.days,
    }));
}
