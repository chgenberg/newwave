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

function brandOccasionsForYear(y: number): Occasion[] {
  const midsummerEve = (() => {
    for (let day = 19; day <= 25; day++) if (d(y, 6, day).getUTCDay() === 5) return d(y, 6, day);
    return d(y, 6, 19);
  })();
  const e = easter(y);
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  return [
    { id: "sportlov", title: "Sportlovsresan", detail: "Skidorna på taket, termosen i mitthålet – fjällresan börjar med ett stopp.", date: nthWeekday(y, 2, 6, 3) },
    { id: "alla-hjartans", title: "Alla hjärtans dag", detail: "Kärlek på vägen – kaffe för två och en korv att dela.", date: d(y, 2, 14) },
    { id: "pask", title: "Påskresan", detail: "Påskledigt, fulla bilar och ett efterlängtat stopp på vägen.", date: new Date(e.getTime() - 2 * DAY) },
    { id: "sommardack", title: "Dags för sommardäck", detail: "Vinterdäcken av – våren är på riktigt.", date: d(y, 4, 15) },
    { id: "nationaldagen", title: "Nationaldagen", detail: "Sverige på väg – långa vägar, röda stugor och ljusa kvällar.", date: d(y, 6, 6) },
    { id: "midsommar", title: "Midsommarresan", detail: "Årets mest trafikerade helg – kaffe, glass och korv på vägen till landet.", date: new Date(midsummerEve.getTime() - DAY) },
    { id: "bilsemester", title: "Bilsemestern börjar", detail: "Industrisemester och roadtrip – kartan, kylväskan och K-Freeze.", date: d(y, 7, 1) },
    { id: "skolstart", title: "Skolstart", detail: "Morgonkaffe igen – vardagen och pendlingen tillbaka.", date: d(y, 8, 20) },
    { id: "hostlov", title: "Höstlovsresan", detail: "Mörka kvällar, stationen som lyser upp vägen hem.", date: nthWeekday(y, 10, 6, 4) },
    { id: "vinterdack", title: "Första frosten", detail: "Isskrapan fram, vinterdäcken på – och en varm kopp i handen.", date: d(y, 10, 15) },
    { id: "halloween", title: "Halloween", detail: "Läskigt god korv och spöklika stationer i mörkret.", date: d(y, 10, 31) },
    { id: "black-friday", title: "Black Friday", detail: "Årets största shoppinghelg – julklappar för bilfolket.", date: new Date(thanksgiving.getTime() + DAY) },
    { id: "lucia", title: "Lucia", detail: "Ljus i mörkret – och lussekatt till kaffet.", date: d(y, 12, 13) },
    { id: "jul", title: "Julresan", detail: "Hem till jul – bilen full av klappar och ett stopp för glögg och kaffe.", date: d(y, 12, 22) },
    { id: "nyar", title: "Nyår", detail: "Nytt år, nya resor.", date: d(y, 12, 31) },
  ];
}

export function seasonFor(date: Date, brand = false): Signal {
  const m = date.getUTCMonth() + 1;
  if (brand) {
    const [title, detail] =
      m <= 2 || m === 12
        ? ["Vinter", "Frost, mörker och fjällresor – isskrapor, termosar och varma mössor."]
        : m <= 5
          ? ["Vår", "Ljusare morgnar, sommardäck och påskresor."]
          : m <= 8
            ? ["Sommar", "Roadtrip och bilsemester – kepsar, t-shirts och dricksglas."]
            : ["Höst", "Mörka kvällar och första frosten – hoodies, kaffe och isskrapor."];
    return { id: `season-${title.toLowerCase()}`, kind: "season", title, detail };
  }
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

export function upcomingOccasions(from: Date, windowDays = 60, brand = false): Signal[] {
  const y = from.getUTCFullYear();
  const start = d(y, from.getUTCMonth() + 1, from.getUTCDate()).getTime();
  const forYear = brand ? brandOccasionsForYear : occasionsForYear;
  return [...forYear(y), ...forYear(y + 1)]
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
