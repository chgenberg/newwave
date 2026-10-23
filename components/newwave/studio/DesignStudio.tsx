"use client";

import "./studio.css";
import { type DragEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { NwProduct } from "@/lib/newwave/catalog";
import { colorName, suggestions } from "@/lib/newwave/colors";
import {
  cmText,
  colorsOf,
  colorText,
  type Design,
  estimate,
  fasterOption,
  fitDesign,
  fitNames,
  fitPlacement,
  fmtWeekday,
  freeZone,
  isLocked,
  markingPrice,
  maxCmIn,
  METHOD_INFO,
  NAME_UNIT,
  nameZones,
  type Placement,
  SHAPE_LABEL,
  SHAPES,
  type Shape,
  sizeCmFor,
  type Zone,
  zoneMethods,
  zonesClash,
  zonesFor,
} from "@/lib/newwave/marking";
import { sek } from "@/lib/newwave/reseller";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";
import { buildLogoArt, buildNameArt, inkContrast, isDark, type LogoArt, logoColors } from "./logoArt";
import { fallbackKind, type Layer, ProductScene, type SceneApi, type View } from "./ProductScene";
import { readLogoUpload } from "./readLogoFile";
import { WordmarkPicker } from "./WordmarkPicker";

export type Proof = { label: string; image: string };
export type StudioResult = { design: Design; color: string; preview: string; proofs: Proof[] };
/** Motivet studion öppnas med: klubbens tryckfil, märket eller företagets logga, i ljust och mörkt utförande. */
export type StudioArt = { light: string | null; dark?: string | null; label: string };

const SHAPE_ICON: Record<Shape, string> = {
  original: "M4 8h16M4 12h10M4 16h13",
  rund: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z",
  kvadrat: "M5 5h14v14H5z",
  rektangel: "M3 8h18v8H3z",
};

const noSubscribe = () => () => {};
/** Servern vet inte plattformen, så den visar ⌘ och klienten rättar efter hydreringen. */
const useModKey = () => useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl"), () => "⌘");

const shortcuts = (MOD: string): [string[], string][] => [
  [["⌫"], "Ta bort valt tryck"],
  [[MOD, "Z"], "Ångra"],
  [["⇧", MOD, "Z"], "Gör om"],
  [[MOD, "D"], "Duplicera trycket"],
  [["←", "→", "↑", "↓"], "Flytta trycket (⇧ = längre); på kläder och termosflaskan: byt tryckyta"],
  [["+", "−"], "Större / mindre"],
  [["[", "]"], "Föregående / nästa tryck"],
  [["N"], "Ny tryckposition"],
  [["M"], "Byt märkmetod"],
  [["F"], "Byt form"],
  [["R"], "Vrid fram valt tryck"],
  [["V"], "Spela in ett 3D-klipp"],
  [[MOD, "S"], "Spara design"],
  [["?"], "Visa kortkommandon"],
  [["Esc"], "Stäng"],
];

type Toast = { id: number; text: string; undo?: boolean };


const VIEWS: { id: View; label: string }[] = [
  { id: "fram", label: "Fram" },
  { id: "bak", label: "Bak" },
  { id: "3d", label: "3D" },
];

function DeliveryNote({ product, design, needBy }: { product: NwProduct; design: Design; needBy?: string }) {
  const [today] = useState(() => new Date());
  const est = estimate(product, design, today);
  const by = METHOD_INFO[est.method].label.toLowerCase();
  if (!needBy)
    return (
      <p className="delivery">
        <span className="delivery-dot" aria-hidden /> Levereras ca {fmtWeekday(est.date)} med {by}
      </p>
    );
  if (est.date <= needBy)
    return (
      <p className="delivery ok">
        <span className="delivery-dot" aria-hidden /> Hinner till {fmtWeekday(needBy)} – levereras ca {fmtWeekday(est.date)}
      </p>
    );
  const faster = fasterOption(product, design, needBy, today);
  return (
    <p className="delivery late">
      <span className="delivery-dot" aria-hidden /> Hinner inte till {fmtWeekday(needBy)} (ca {fmtWeekday(est.date)}).
      {faster ? ` Med ${METHOD_INFO[faster.method].label.toLowerCase()} levereras den ca ${fmtWeekday(faster.date)}.` : " Kontakta oss för expressproduktion."}
    </p>
  );
}

export function DesignStudio({
  product,
  initial,
  color: initialColor,
  qty,
  art: base,
  brandColor,
  needBy,
  price: priceRows,
  onSave,
  onClose,
  picker,
  brand,
  wordmarkClub,
  onWordmarkCollection,
  aside,
  fill,
  saveLabel = "Spara design",
}: {
  product: NwProduct;
  initial: Design;
  color: string;
  /** Antal i beställningen; saknas när produkten säljs styckvis i en butik. */
  qty?: number;
  art: StudioArt;
  brandColor?: string;
  needBy?: string;
  /** Egna prisrader, t.ex. styckpriset i butiken; annars visas märkningens pris. */
  price?: (d: Design, units: number) => [string, string][];
  onSave: (r: StudioResult) => void | Promise<void>;
  /** Utan den bäddas studion in i sidan i stället för att öppnas som dialog. */
  onClose?: () => void;
  picker?: ReactNode;
  /** Varumärkesverktyget (brandbook, webbadress, färger och logga) när studion används fristående. */
  brand?: ReactNode;
  /** Klubben som wordmarken förhandsvisas med; utan den visas inga wordmarks. */
  wordmarkClub?: { id: string; name: string; logo?: string };
  /** Ett mallpaket med wordmarks för hela sortimentet. */
  onWordmarkCollection?: (id: string) => void;
  /** Högerkolumn bredvid produkten, t.ex. fler produkter i samma design. */
  aside?: ReactNode;
  /** Fyll föräldern i stället för fönsterhöjden. */
  fill?: boolean;
  saveLabel?: string;
}) {
  const embedded = !onClose;
  const MOD = useModKey();
  const [design, setDesignNow] = useState<Design>(() => fitDesign(product, initial));
  const [history, setHistory] = useState<{ past: Design[]; future: Design[] }>({ past: [], future: [] });
  const lastChange = useRef(0);
  const latest = useRef(design);
  /** Produkten snurrar tills designen ändras första gången; sedan står den still mot trycket. */
  const [edited, setEdited] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const say = (text: string, undo = false) => setToast({ id: Date.now(), text, undo });
  /** Varje ändring går hit; snabba ändringar i följd (drag, reglage) blir ett ångra-steg. */
  const setDesign = (next: Design | ((d: Design) => Design)) => {
    const d = latest.current;
    const value = typeof next === "function" ? next(d) : next;
    if (value === d) return;
    latest.current = value;
    const now = Date.now();
    if (now - lastChange.current > 600) setHistory((h) => ({ past: [...h.past.slice(-79), d], future: [] }));
    lastChange.current = now;
    setDesignNow(value);
    setEdited(true);
    // En avisering från en tidigare åtgärd beskriver inte längre det som syns; en ny i samma åtgärd får stå kvar.
    setToast((t) => (t && now - t.id > 400 ? null : t));
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);
  const [help, setHelp] = useState(false);
  const panel = useRef<HTMLElement>(null);
  /** Scrollar panelen till sektionen och blinkar den. */
  const openAt = (to: string) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = panel.current?.querySelector<HTMLElement>(`[data-sec="${to}"]`);
        const box = panel.current;
        if (!el || !box) return;
        if (box.scrollHeight > box.clientHeight + 1) box.scrollTo({ top: box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top - 12, behavior: "smooth" });
        else el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.remove("is-flash");
        void el.offsetWidth;
        el.classList.add("is-flash");
      }),
    );
  };
  const [color, setColor] = useState(initialColor.toUpperCase());
  const [arts, setArts] = useState<Record<string, LogoArt>>({});
  const [active, setActive] = useState("main");
  const [namesText, setNamesText] = useState(initial.names?.list.join("\n") ?? "");
  const [modelUrl, setModelUrl] = useState<string | null | undefined>(product.model ? undefined : null);
  const [logoSite, setLogoSite] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const api = useRef<SceneApi | null>(null);
  const zones = useMemo(() => zonesFor(product), [product]);
  const nameSpots = useMemo(() => nameZones(product), [product]);
  /** Bilaga 2: trycket sitter bara i ytorna, med ytans metoder och mått. */
  const locked = isLocked(product);
  const extraIndex = active.startsWith("x") ? Number(active.slice(1)) : -1;
  const onNames = active === "names" && Boolean(design.names);
  const curKey = extraIndex >= 0 && design.extra?.[extraIndex] ? `x${extraIndex}` : "main";
  const cur: Placement = extraIndex >= 0 && design.extra?.[extraIndex] ? design.extra[extraIndex] : design;
  const methods = zoneMethods(product, cur.zone);
  const info = METHOD_INFO[cur.method];
  const units = Math.max(qty ?? 1, design.names?.list.length ?? 0);
  const marking = markingPrice(design, units);
  const darkProduct = isDark(color);
  // Wordmarket ritas per tryckstorlek: små tryck (bröst, ärm) får mallens lilla version.
  const logoFor = (sizeCm: number) =>
    design.wordmark && wordmarkClub
      ? wordmarkUrl(design.wordmark, wordmarkClub.id, darkProduct ? "dark" : "light", 1200, "png", sizeCm)
      : design.logo
        ? (darkProduct && design.logoDark) || design.logo
        : (darkProduct && base.dark) || base.light;
  const logo = logoFor(design.sizeCm);
  const customColor = !suggestions(brandColor).some((s) => s.hex.toUpperCase() === color);
  const set = (patch: Partial<Design>) => setDesign((d) => ({ ...d, ...patch }));
  const aspectOf = (key: string) => arts[key]?.aspect ?? 1;
  const maxCm = (key: string, zone: string) => maxCmIn(product, zone, key === "names" ? 4 : aspectOf(key));
  /** Ändrar ett tryck och håller det inom zonens metoder och mått. */
  const setLayer = (key: string, patch: Partial<Placement>) =>
    setDesign((d) => {
      if (key === "names") return d.names ? { ...d, names: fitNames(product, { ...d.names, ...patch }) } : d;
      const i = key.startsWith("x") ? Number(key.slice(1)) : -1;
      if (i >= 0 && d.extra?.[i]) return { ...d, extra: d.extra.map((p, k) => (k === i ? fitPlacement(product, { ...p, ...patch }, aspectOf(key)) : p)) };
      return fitPlacement(product, { ...d, ...patch }, aspectOf("main"));
    });
  const setCur = (patch: Partial<Placement>) => setLayer(curKey, patch);
  const zoneRule = (id: string) => {
    const box = zones.find((z) => z.id === id)?.maxCm;
    const cm = (n: number) => n.toLocaleString("sv-SE");
    return box ? `Enligt Bilaga 2: högst ${cm(box[0])} × ${cm(box[1])} cm, ${zoneMethods(product, id).map((m) => METHOD_INFO[m].label.toLowerCase()).join(" eller ")}.` : null;
  };
  const setNames = (patch: Partial<NonNullable<Design["names"]>>) => setLayer("names", patch);
  /** Trycket som kameran vänds mot när dess nya läge är ritat. */
  const frameAfter = useRef<string | null>(null);
  /** Flyttar trycket till zonen; byter metod och storlek när zonen kräver det, och säger till. Från panelen vänds kameran dit. */
  const moveTo = (key: string, z: Zone, face = true) => {
    const d = latest.current;
    const i = key.startsWith("x") ? Number(key.slice(1)) : -1;
    const from: Placement | undefined = key === "names" ? undefined : i >= 0 ? d.extra?.[i] : d;
    if (key === "names" ? d.names?.zone === z.id : from?.zone === z.id) return false;
    setLayer(key, { zone: z.id, point: undefined, normal: undefined, ...(z.sizeCm && key !== "names" ? { sizeCm: z.sizeCm } : {}) });
    if (face) frameAfter.current = key;
    const allowed = zoneMethods(product, z.id);
    const strict = Boolean(from && !allowed.includes(from.method));
    if (strict) say(`${z.label}: ${allowed.map((m) => METHOD_INFO[m].label.toLowerCase()).join(" eller ")} enligt Bilaga 2`);
    return strict;
  };
  const zoneLabel = (id: string) => (id === "egen" ? "Egen" : (zones.find((z) => z.id === id)?.label ?? id));
  const activeLabel = onNames && design.names ? `Namn · ${zoneLabel(design.names.zone)}` : extraIndex >= 0 ? `Tryck ${extraIndex + 2} · ${zoneLabel(cur.zone)}` : `Tryck · ${zoneLabel(design.zone)}`;

  const placed = [design, ...(design.extra ?? []), ...(design.names ? [design.names] : [])];
  const spots = [
    { key: "main", label: `Tryck · ${zoneLabel(design.zone)}`, zone: design.zone, sizeCm: design.sizeCm },
    ...(design.extra ?? []).map((p, i) => ({ key: `x${i}`, label: `Tryck ${i + 2} · ${zoneLabel(p.zone)}`, zone: p.zone, sizeCm: p.sizeCm })),
    ...(design.names ? [{ key: "names", label: `Namn · ${zoneLabel(design.names.zone)}`, zone: design.names.zone, sizeCm: design.names.sizeCm }] : []),
  ];
  const activeSpot = spots.find((s) => s.key === active);
  const clash = activeSpot ? spots.find((s) => s.key !== active && zonesClash(product, activeSpot, s)) : undefined;
  const clashNote = clash ? <p className="cz-warn">Krockar med {clash.label.toLowerCase()} – välj en annan placering eller gör trycket mindre.</p> : null;
  /** Bilaga 2-produkter har fasta tryckytor; när alla är använda finns ingen plats för ett tryck till. */
  const full = locked && zones.every((z) => placed.some((s) => s.zone === z.id));
  const canAdd = (design.extra?.length ?? 0) < 3 && !full;
  const noRoom = () => say(full ? "Alla tryckytor enligt Bilaga 2 är använda" : "Max fyra tryck per produkt");
  const addPosition = () => {
    if (!canAdd) return noRoom();
    const zone = freeZone(product, placed);
    const next = fitPlacement(product, { method: design.method, colors: design.colors, shape: "original", zone: zone.id, sizeCm: zone.sizeCm ?? design.sizeCm });
    const extra = [...(design.extra ?? []), next];
    set({ extra });
    setActive(`x${extra.length - 1}`);
  };
  const removePosition = (i: number) => {
    const extra = (design.extra ?? []).filter((_, k) => k !== i);
    set({ extra: extra.length ? extra : undefined });
    setActive("main");
  };

  const restore = (to: Design) => {
    latest.current = to;
    setDesignNow(to);
    lastChange.current = 0;
    setNamesText(to.names?.list.join("\n") ?? "");
    setActive((a) => (a === "names" && !to.names ? "main" : a.startsWith("x") && !to.extra?.[Number(a.slice(1))] ? "main" : a));
  };
  const undo = () => {
    const prev = history.past.at(-1);
    if (!prev) return say("Inget att ångra");
    setHistory({ past: history.past.slice(0, -1), future: [design, ...history.future] });
    restore(prev);
    setToast(null);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return say("Inget att göra om");
    setHistory({ past: [...history.past, design], future: history.future.slice(1) });
    restore(next);
  };

  /** Ta bort valt tryck. Huvudtrycket lämnar sin plats till nästa tryck, om det finns ett. */
  const removeActive = () => {
    if (active === "names" && design.names) {
      set({ names: undefined });
      setActive("main");
      return say("Namntrycket borttaget", true);
    }
    if (extraIndex >= 0) {
      removePosition(extraIndex);
      return say(`Tryck ${extraIndex + 2} borttaget`, true);
    }
    const [first, ...rest] = design.extra ?? [];
    if (!first) return say("Minst ett tryck behövs – byt motivet eller placeringen i stället");
    setDesign((d) => ({ ...d, ...first, logo: d.logo, logoDark: d.logoDark, extra: rest.length ? rest : undefined }));
    setActive("main");
    say("Trycket borttaget", true);
  };

  const duplicate = () => {
    if (onNames) return;
    if (!canAdd) return noRoom();
    const zone = freeZone(product, placed);
    const copy = fitPlacement(product, { method: cur.method, colors: cur.colors, shape: cur.shape, sizeCm: cur.sizeCm, zone: zone.id }, aspectOf(curKey));
    const extra = [...(design.extra ?? []), copy];
    set({ extra });
    setActive(`x${extra.length - 1}`);
    say(`Duplicerat till ${zone.label.toLowerCase()}`);
  };

  const resize = (by: number) => {
    const names = onNames ? design.names : undefined;
    const max = maxCm(names ? "names" : curKey, names ? names.zone : cur.zone);
    const now = names ? names.sizeCm : cur.sizeCm;
    if (by > 0 && now >= max) return say(`${zoneLabel(names ? names.zone : cur.zone)} rymmer högst ${cmText(max)}`);
    const sizeCm = Math.min(max, Math.max(2, now + by));
    if (names) return setNames({ sizeCm });
    setCur({ sizeCm });
  };

  const cycleMethod = () => {
    if (onNames) return;
    const m = methods[(methods.indexOf(cur.method) + 1) % methods.length];
    setCur({ method: m, colors: METHOD_INFO[m].fixedColors ?? Math.min(cur.colors, METHOD_INFO[m].maxColors) });
    say(METHOD_INFO[m].label);
  };

  const cycleShape = () => {
    if (onNames) return;
    const s = SHAPES[(SHAPES.indexOf(cur.shape) + 1) % SHAPES.length];
    setCur({ shape: s });
    say(`Form: ${SHAPE_LABEL[s]}`);
  };
  const addNames = () => {
    const zone = freeZone(product, placed, "rygg");
    set({ names: fitNames(product, { list: [], zone: zone.id, sizeCm: Math.max(4, Math.round(sizeCmFor(product) * 0.33)) }) });
    setNamesText("");
    setActive("names");
  };

  useEffect(() => {
    const url = product.model;
    if (!url) return;
    let live = true;
    fetch(url, { method: "HEAD" })
      .then((r) => live && setModelUrl(r.ok ? url : null))
      .catch(() => live && setModelUrl(null));
    return () => {
      live = false;
    };
  }, [product.model]);

  // Tryckbilden ändras bara med motiv, metod, antal färger, form och ljus/mörk produkt – inte med varje färgval.
  const specKey = JSON.stringify([design, ...(design.extra ?? [])].map((p) => [p.method, p.colors, p.shape, logoFor(p.sizeCm)]));
  useEffect(() => {
    let live = true;
    const specs = JSON.parse(specKey) as [Placement["method"], number, Shape, string][];
    Promise.all(specs.map(([method, colors, shape, src]) => buildLogoArt(src, { method, colors, shape }, darkProduct ? "#111111" : "#FFFFFF"))).then((list) => {
      if (!live) return;
      const next: Record<string, LogoArt> = Object.fromEntries(list.map((a, i) => [i === 0 ? "main" : `x${i - 1}`, a]));
      setArts(next);
      // Ett högre motiv kan bli för högt för zonen i samma bredd.
      const d = latest.current;
      const fitted = { ...fitPlacement(product, d, next.main?.aspect ?? 1), extra: d.extra?.map((x, i) => fitPlacement(product, x, next[`x${i}`]?.aspect ?? 1)) };
      if (fitted.sizeCm !== d.sizeCm || fitted.extra?.some((x, i) => x.sizeCm !== d.extra?.[i]?.sizeCm)) {
        latest.current = fitted;
        setDesignNow(fitted);
      }
    });
    return () => {
      live = false;
    };
  }, [specKey, darkProduct, product]);
  const art = arts.main ?? null;

  // En ny design trycks i loggans egna färger tills kunden väljer antal själv, så att den ser ut som loggan.
  const colorsChosen = useRef(Boolean(initial.extra || initial.names || initial.colors !== 1));
  useEffect(() => {
    if (!logo || colorsChosen.current) return;
    let live = true;
    logoColors(logo).then((n) => {
      if (!live || colorsChosen.current) return;
      const d = latest.current;
      const max = METHOD_INFO[d.method];
      const colors = max.fixedColors ?? Math.min(n, max.maxColors);
      if (colors === d.colors) return;
      latest.current = { ...d, colors };
      setDesignNow(latest.current);
    });
    return () => {
      live = false;
    };
  }, [logo]);
  const curArt = onNames ? null : ((extraIndex >= 0 ? arts[`x${extraIndex}`] : art) ?? null);
  // Under ~1,8 försvinner trycket i tyget – en mörk logga på marinblått eller grön på grönt.
  const lowContrast = useMemo(() => {
    if (!curArt || cur.method === "gravyr") return null;
    if (inkContrast(curArt, color) >= 1.8) return null;
    const better = suggestions(brandColor)
      .map((s) => ({ ...s, hex: s.hex.toUpperCase(), score: inkContrast(curArt, s.hex) }))
      .filter((s) => s.hex !== color)
      .sort((a, b) => b.score - a.score)[0];
    return better && better.score >= 3 ? better : { hex: "", name: "", score: 0 };
  }, [curArt, color, brandColor, cur.method]);
  const firstName = design.names?.list[0] ?? "";
  const nameArt = useMemo(() => (design.names ? buildNameArt(firstName, color) : null), [design.names, firstName, color]);

  const layers: Layer[] = [
    { key: "main", zone: design.zone, point: design.point, normal: design.normal, sizeCm: design.sizeCm, method: design.method, art },
    ...(design.extra ?? []).map((p, i) => ({ key: `x${i}`, zone: p.zone, point: p.point, normal: p.normal, sizeCm: p.sizeCm, method: p.method, art: arts[`x${i}`] ?? null })),
    ...(design.names ? [{ key: "names", zone: design.names.zone, point: design.names.point, normal: design.names.normal, sizeCm: design.names.sizeCm, method: "transfer" as const, art: nameArt }] : []),
  ];

  const placeLayer = (key: string, p: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } }) => {
    if (locked) {
      const among = key === "names" ? nameSpots : zones;
      const id = api.current?.zoneAt([p.point.x, p.point.y, p.point.z], [p.normal.x, p.normal.y, p.normal.z], among);
      const z = among.find((x) => x.id === id);
      if (z) moveTo(key, z, false);
      return;
    }
    const at = { zone: "egen", point: [p.point.x, p.point.y, p.point.z] as [number, number, number], normal: [p.normal.x, p.normal.y, p.normal.z] as [number, number, number] };
    setDesign((d) => {
      if (key === "names") return d.names ? { ...d, names: { ...d.names, ...at } } : d;
      const i = key.startsWith("x") ? Number(key.slice(1)) : -1;
      if (i >= 0 && d.extra?.[i]) return { ...d, extra: d.extra.map((x, k) => (k === i ? { ...x, ...at } : x)) };
      return { ...d, ...at };
    });
  };

  const result = (): StudioResult => {
    const preview = api.current?.capture() ?? "";
    const labelOf = (key: string) => {
      if (key === "names" && design.names) return `Namn · ${zoneLabel(design.names.zone)}`;
      const i = key.startsWith("x") ? Number(key.slice(1)) : -1;
      const p = i >= 0 ? design.extra?.[i] : design;
      return `${i >= 0 ? `Tryck ${i + 2}` : "Tryck"} · ${p ? zoneLabel(p.zone) : ""}`;
    };
    const keep = design.names?.list.length ? design : { ...design, names: undefined };
    const proofs = (api.current?.captureAll() ?? []).filter((s) => s.key !== "names" || keep.names).map((s) => ({ label: labelOf(s.key), image: s.image }));
    return { design: keep, color, preview, proofs };
  };
  const save = async () => {
    if (saving || !art) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(result());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Kunde inte spara designen.");
    } finally {
      setSaving(false);
    }
  };
  const download = () => {
    const shot = api.current?.capture();
    if (!shot) return;
    const a = document.createElement("a");
    a.href = shot;
    a.download = `${product.name.replace(/\s+/g, "-")}.jpg`;
    a.click();
  };

  const [recording, setRecording] = useState(false);
  const recordSpin = async () => {
    if (recording || !api.current) return;
    setRecording(true);
    const clip = await api.current.recordSpin(4).catch(() => null);
    setRecording(false);
    if (!clip) return say("Webbläsaren kan inte spela in – prova Chrome eller Safari");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(clip.blob);
    a.download = `${product.name.replace(/\s+/g, "-")}-3D.${clip.ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say("3D-klippet är sparat – dela det i chatten eller i ett inlägg");
  };

  const layerKeys = layers.map((l) => l.key);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const wrap = useRef<HTMLDivElement>(null);
  /** Inbäddad tar studion bara kortkommandon när man senast klickade eller fokuserade i den. */
  const engaged = useRef(false);
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (embedded && !engaged.current) return;
      const el = e.target as HTMLElement | null;
      const typing = el?.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "Escape") {
        e.preventDefault();
        if (help) setHelp(false);
        else if (typing) (el as HTMLElement).blur();
        else onClose?.();
        return;
      }
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (mod && k === "z") return run(e.shiftKey ? redo : undo);
      if (mod && k === "y") return run(redo);
      if (mod && k === "d") return run(duplicate);
      if (mod && k === "s") return run(() => void save());
      if (mod) return;
      if (e.key === "Backspace" || e.key === "Delete" || e.key === "\\") return run(removeActive);
      if (e.key === "?" || (e.shiftKey && e.key === "/")) return run(() => setHelp((h) => !h));
      if (locked && e.key.startsWith("Arrow")) {
        const among = active === "names" ? nameSpots : zones;
        const at = among.findIndex((z) => z.id === (active === "names" ? design.names?.zone : cur.zone));
        const by = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
        return run(() => {
          const z = among[(at + by + among.length) % among.length];
          if (!moveTo(active, z)) say(z.label);
        });
      }
      const step = e.shiftKey ? 0.1 : 0.03;
      if (e.key === "ArrowLeft") return run(() => api.current?.nudge(active, -step, 0));
      if (e.key === "ArrowRight") return run(() => api.current?.nudge(active, step, 0));
      if (e.key === "ArrowUp") return run(() => api.current?.nudge(active, 0, step));
      if (e.key === "ArrowDown") return run(() => api.current?.nudge(active, 0, -step));
      if (e.key === "+" || e.key === "=") return run(() => resize(e.shiftKey ? 2 : 1));
      if (e.key === "-" || e.key === "_") return run(() => resize(e.shiftKey ? -2 : -1));
      if (e.key === "[" || e.key === "]") {
        return run(() => {
          const i = layerKeys.indexOf(active);
          const n = layerKeys.length;
          setActive(layerKeys[(i + (e.key === "]" ? 1 : n - 1)) % n]);
        });
      }
      if (k === "n") return run(addPosition);
      if (k === "m") return run(cycleMethod);
      if (k === "f") return run(cycleShape);
      if (k === "r") return run(() => api.current?.frame(active));
      if (k === "v") return run(() => void recordSpin());
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    const track = (e: Event) => {
      engaged.current = Boolean(wrap.current?.contains(e.target as Node));
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", track);
    document.addEventListener("focusin", track);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", track);
      document.removeEventListener("focusin", track);
    };
  }, []);

  const onReady = useCallback((a: SceneApi) => {
    api.current = a;
  }, []);
  const [view, setView] = useState<View | null>(null);
  const turn = (v: View) => {
    setView(v);
    api.current?.view(v);
  };
  // Ett nytt motiv (uppladdning, wordmark, metod) ritas där det syns: kameran vänds mot det valda trycket.
  const shownArt = useRef<LogoArt | null>(null);
  useEffect(() => {
    const before = shownArt.current;
    shownArt.current = art;
    if (!before || !art || before === art) return;
    const id = requestAnimationFrame(() => api.current?.frame(active));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bara när motivet byts, inte när ett annat tryck väljs
  }, [art]);
  // Flyttas trycket till andra sidan vänds produkten först när den nya tryckbilden är på plats.
  const faceAfter = useRef<View | null>(null);
  useEffect(() => {
    const key = frameAfter.current;
    if (!key) return;
    frameAfter.current = null;
    const id = requestAnimationFrame(() => api.current?.frame(key));
    return () => cancelAnimationFrame(id);
  }, [design]);
  useEffect(() => {
    const v = faceAfter.current;
    if (!v || !art) return;
    faceAfter.current = null;
    setView(v);
    api.current?.view(v);
  }, [art]);

  const [dropping, setDropping] = useState<"panel" | "stage" | null>(null);
  const [uploadError, setUploadError] = useState("");

  /** Uppladdade och hämtade loggor rensas på servern och kommer tillbaka i ljust och mörkt utförande. */
  const fetchLogo = async (body: { url: string } | { dataUrl: string; name: string }) => {
    setFetching(true);
    setUploadError("");
    try {
      const res = await fetch("/api/v1/logo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { light?: string; dark?: string; error?: string };
      if (!res.ok || !data.light) throw new Error(data.error ?? "Kunde inte hämta loggan.");
      set({ logo: data.light, logoDark: data.dark, wordmark: undefined });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Kunde inte läsa filen.");
    } finally {
      setFetching(false);
    }
  };
  const upload = async (file: File | undefined) => {
    setDropping(null);
    if (!file) return;
    try {
      await fetchLogo({ dataUrl: await readLogoUpload(file), name: file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Kunde inte läsa filen.");
    }
  };

  const dropTarget = (where: "panel" | "stage") => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (dropping !== where) setDropping(where);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(null);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      void upload(e.dataTransfer.files?.[0]);
    },
  });

  const rows: [string, string][] = priceRows
    ? priceRows(design, units)
    : [
        ["Märkning", `${sek(marking.perUnit)}/st`],
        ["Startkostnad", sek(marking.setup)],
        [`Märkning för ${units} st`, sek(marking.perUnit * units + marking.setup)],
      ];


  return (
    <div
      ref={wrap}
      className={`cz-wrap${embedded ? " is-embedded" : ""}${fill ? " is-fill" : ""}`}
      {...(embedded ? { "aria-label": `Designstudio för ${product.name}` } : { role: "dialog", "aria-modal": true, "aria-label": `Designstudio: ${product.name}` })}
    >
      {embedded ? null : <button type="button" className="drawer-veil" aria-label="Stäng" onClick={onClose} />}
      <div className={`cz${aside ? " has-aside" : ""}`}>
        <div className={`cz-stage${dropping === "stage" ? " is-dropping" : ""}`} onPointerDown={() => setView(null)} {...dropTarget("stage")}>
          {dropping === "stage" ? <div className="cz-drop-veil">Släpp för att lägga loggan på produkten</div> : null}
          {modelUrl === undefined ? null : (
            <ProductScene
              modelUrl={modelUrl}
              fallback={fallbackKind(product)}
              color={color}
              layers={layers}
              active={active}
              zones={zones}
              sizeCm={sizeCmFor(product)}
              onReady={onReady}
              onSelect={setActive}
              onPlace={placeLayer}
              still={edited}
            />
          )}
          <div className="cz-tools" role="toolbar" aria-label="Verktyg för valt tryck">
            <span className="cz-tools-name">{activeLabel}</span>
            {clash ? (
              <span className="cz-tools-warn" title={`Krockar med ${clash.label.toLowerCase()}`}>
                Krockar
              </span>
            ) : null}
            {lowContrast ? (
              <button type="button" className="cz-tools-warn is-btn" title="Trycket syns dåligt på den här färgen" onClick={() => openAt("product")}>
                Låg kontrast
              </button>
            ) : null}
            <span className="cz-tools-sep" aria-hidden />
            <button type="button" title="Mindre (−)" aria-label="Mindre" onClick={() => resize(-1)}>
              −
            </button>
            <span className="cz-tools-size">{cmText(onNames && design.names ? design.names.sizeCm : cur.sizeCm)}</span>
            <button type="button" title="Större (+)" aria-label="Större" onClick={() => resize(1)}>
              +
            </button>
            <span className="cz-tools-sep" aria-hidden />
            <button type="button" title={`Duplicera (${MOD}D)`} aria-label="Duplicera" onClick={duplicate} disabled={onNames}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="8" y="8" width="12" height="12" rx="2.5" />
                <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
              </svg>
            </button>
            <button type="button" className="is-danger" title="Ta bort (⌫)" aria-label="Ta bort valt tryck" onClick={removeActive}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
              </svg>
            </button>
            <span className="cz-tools-sep" aria-hidden />
            <button type="button" title={`Ångra (${MOD}Z)`} aria-label="Ångra" onClick={undo} disabled={!history.past.length}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />
              </svg>
            </button>
            <button type="button" title={`Gör om (⇧${MOD}Z)`} aria-label="Gör om" onClick={redo} disabled={!history.future.length}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />
              </svg>
            </button>
            <span className="cz-tools-sep" aria-hidden />
            <button type="button" className={recording ? "is-rec" : ""} title="Spela in ett snurrande 3D-klipp (V)" aria-label="Spela in ett 3D-klipp" onClick={() => void recordSpin()} disabled={recording || !art}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <rect x="3" y="6" width="13" height="12" rx="2.5" />
                <path d="M16 10.5l5-3v9l-5-3z" />
              </svg>
            </button>
            <button type="button" className={help ? "is-on" : ""} title="Kortkommandon (?)" aria-label="Kortkommandon" aria-expanded={help} onClick={() => setHelp((h) => !h)}>
              ?
            </button>
          </div>

          {help ? (
            <div className="cz-help" role="dialog" aria-label="Kortkommandon">
              <div className="cz-help-head">
                <b>Kortkommandon</b>
                <button type="button" onClick={() => setHelp(false)} aria-label="Stäng">
                  ×
                </button>
              </div>
              <ul>
                {shortcuts(MOD).map(([keys, what]) => (
                  <li key={what}>
                    <span>{what}</span>
                    <span className="cz-keys">
                      {keys.map((k) => (
                        <kbd key={k}>{k}</kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {recording ? (
            <div className="cz-rec" role="status">
              <span aria-hidden /> Spelar in 3D-klipp…
            </div>
          ) : null}

          {toast ? (
            <div key={toast.id} className="cz-toast" role="status">
              <span>{toast.text}</span>
              {toast.undo ? (
                <button type="button" onClick={undo}>
                  Ångra
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="cz-views" role="group" aria-label="Vy">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onPointerDown={(e) => e.stopPropagation()} onClick={() => turn(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <aside ref={panel} className="cz-panel" aria-label="Inställningar">
              <div className="drawer-head cz-head">
                <div>
                  <p className="kicker">Designstudio</p>
                  <h2>{product.name}</h2>
                </div>
                {onClose ? (
                  <button type="button" className="drawer-x" onClick={onClose} aria-label="Stäng">
                    ×
                  </button>
                ) : null}
              </div>

              {picker ? (
                <section className="cz-sec">
                  {picker}
                </section>
              ) : null}

              {brand ? (
                <section className="cz-sec">
                  {brand}
                </section>
              ) : null}

              {wordmarkClub ? (
                <section className="cz-sec" data-sec="wordmark">
                  <WordmarkPicker
                    club={wordmarkClub}
                    value={design.wordmark}
                    dark={darkProduct}
                    onChange={(wordmark, how) => {
                      const to = how?.side === "back" ? zones.find((z) => z.id === "rygg") : how?.side === "front" && design.zone === "rygg" ? zones[0] : undefined;
                      const move = to && to.id !== design.zone ? to : undefined;
                      const moved = move ? { zone: move.id, point: undefined, normal: undefined, ...(move.sizeCm ? { sizeCm: move.sizeCm } : {}) } : {};
                      setDesign((d) => fitPlacement(product, { ...d, ...(wordmark ? { wordmark, logo: undefined, logoDark: undefined, ...moved } : { wordmark: undefined }) }, aspectOf("main")));
                      if (move) faceAfter.current = how?.side === "back" ? "bak" : "fram";
                    }}
                    onCollection={onWordmarkCollection}
                  />
                </section>
              ) : null}

              <section className="cz-sec">
                <p className="drawer-label">Tryckpositioner</p>
                <div className="cz-tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={active === "main"} onClick={() => setActive("main")}>
                    Tryck · {zoneLabel(design.zone)}
                  </button>
                  {(design.extra ?? []).map((p, i) => (
                    <span key={i} className="cz-tab">
                      <button type="button" role="tab" aria-selected={active === `x${i}`} onClick={() => setActive(`x${i}`)}>
                        Tryck {i + 2} · {zoneLabel(p.zone)}
                      </button>
                      <button type="button" className="cz-tab-x" aria-label={`Ta bort tryck ${i + 2}`} onClick={() => removePosition(i)}>
                        ×
                      </button>
                    </span>
                  ))}
                  {design.names ? (
                    <span className="cz-tab">
                      <button type="button" role="tab" aria-selected={active === "names"} onClick={() => setActive("names")}>
                        Namn · {design.names.list.length} st
                      </button>
                      <button
                        type="button"
                        className="cz-tab-x"
                        aria-label="Ta bort namntrycket"
                        onClick={() => {
                          set({ names: undefined });
                          setActive("main");
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ) : null}
                  {canAdd ? (
                    <button type="button" className="cz-tab-add" onClick={addPosition}>
                      + Position
                    </button>
                  ) : null}
                  {!design.names && nameSpots.length ? (
                    <button type="button" className="cz-tab-add" onClick={addNames}>
                      + Namn per plagg
                    </button>
                  ) : null}
                </div>
              </section>

              {onNames && design.names ? (
                <>
                  <section className="cz-sec">
                    <p className="drawer-label">
                      Namn <span>{design.names.list.length ? `${design.names.list.length} st · ${sek(NAME_UNIT)}/st` : "ett per rad"}</span>
                    </p>
                    <textarea
                      className="cz-names"
                      rows={6}
                      value={namesText}
                      placeholder={"Anna\nErik\nSara\n\nKlistra in en kolumn från Excel"}
                      onChange={(e) => {
                        setNamesText(e.target.value);
                        setNames({ list: e.target.value.split(/[\n,;\t]+/).map((n) => n.trim().slice(0, 30)).filter(Boolean).slice(0, 2000) });
                      }}
                    />
                    {qty && design.names.list.length && design.names.list.length !== qty ? (
                      <p className="cz-note">
                        {design.names.list.length > qty
                          ? `${design.names.list.length} namn – antalet höjs från ${qty} till ${design.names.list.length} st när du sparar.`
                          : `${design.names.list.length} namn på ${qty} st – resten trycks utan namn.`}
                      </p>
                    ) : null}
                  </section>
                  <section className="cz-sec">
                    <p className="drawer-label">Placering</p>
                    <div className="cz-chips">
                      {nameSpots.map((z) => (
                        <button key={z.id} type="button" aria-pressed={design.names!.zone === z.id} onClick={() => moveTo("names", z)}>
                          {z.label}
                        </button>
                      ))}
                      {design.names.zone === "egen" ? (
                        <button type="button" aria-pressed>
                          Egen placering
                        </button>
                      ) : null}
                    </div>
                    {locked ? <p className="cz-note">Namnen trycks med transfer, så de får sitta där Bilaga 2 tillåter transfer.</p> : null}
                    {clashNote}
                  </section>
                  <section className="cz-sec">
                    <label className="insp-range">
                      <span className="drawer-label">
                        Storlek <span>{cmText(design.names.sizeCm)} bred</span>
                      </span>
                      <input type="range" min={2} max={maxCm("names", design.names.zone)} step={maxCm("names", design.names.zone) % 1 ? 0.1 : 1} value={design.names.sizeCm} onChange={(e) => setNames({ sizeCm: Number(e.target.value) })} />
                    </label>
                  </section>
                </>
              ) : (
                <>
                  <section className="cz-sec">
                    <p className="drawer-label">Motiv</p>
                    <label className={`cz-drop${dropping === "panel" ? " is-dropping" : ""}`} {...dropTarget("panel")}>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={(e) => {
                          void upload(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element -- canvas data URL */}
                      <span className={`cz-logo-thumb${darkProduct ? " is-dark" : ""}`}>{art ? <img src={art.canvas.toDataURL()} alt="Motivet som det trycks" /> : null}</span>
                      <span className="cz-drop-text">
                        <b>{fetching ? "Hämtar loggan…" : dropping === "panel" ? "Släpp loggan här" : "Ladda upp egen logga"}</b>
                        <small>{design.wordmark ? "Just nu: wordmark" : design.logo ? "Egen logga" : `Just nu: ${base.label}`}. PNG, JPG, WebP eller SVG – vi tar bort bakgrunden och gör en ljus och en mörk variant.</small>
                      </span>
                    </label>
                    {uploadError ? <p className="brandbar-err">{uploadError}</p> : null}
                    <div className="cz-logo">
                      <div className="cz-logo-actions">
                        <form
                          className="cz-site"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const url = logoSite.trim();
                            if (url.length >= 3 && !fetching) void fetchLogo({ url });
                          }}
                        >
                          <input value={logoSite} onChange={(e) => setLogoSite(e.target.value)} placeholder="eller hämta från webbadress" aria-label="Webbadress för logga" disabled={fetching} />
                        </form>
                        {design.logo || design.wordmark ? (
                          <button type="button" className="cz-link" onClick={() => set({ logo: undefined, logoDark: undefined, wordmark: undefined })}>
                            Återställ till {base.label}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <section className="cz-sec">
                    <p className="drawer-label">Form</p>
                    <div className="cz-chips">
                      {SHAPES.map((s) => (
                        <button key={s} type="button" aria-pressed={cur.shape === s} onClick={() => setCur({ shape: s })}>
                          <svg viewBox="0 0 24 24" aria-hidden>
                            <path d={SHAPE_ICON[s]} />
                          </svg>
                          {SHAPE_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="cz-sec">
                    <p className="drawer-label">Märkmetod</p>
                    <div className="cz-methods">
                      {methods.map((m) => (
                        <button key={m} type="button" aria-pressed={cur.method === m} onClick={() => setCur({ method: m, colors: METHOD_INFO[m].fixedColors ?? Math.min(cur.colors, METHOD_INFO[m].maxColors) })}>
                          <b>{METHOD_INFO[m].label}</b>
                          <small>{METHOD_INFO[m].blurb}</small>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="cz-sec">
                    <p className="drawer-label">
                      Antal färger <span>{colorText(cur)}</span>
                    </p>
                    <div className="seg">
                      {[1, 2, 3, 4].map((n) => (
                        <button key={n} type="button" aria-pressed={colorsOf(cur) === n} disabled={Boolean(info.fixedColors) || n > info.maxColors} onClick={() => {
                            colorsChosen.current = true;
                            setCur({ colors: n });
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="cz-sec">
                    <p className="drawer-label">Placering</p>
                    <div className="cz-chips">
                      {zones.map((z) => (
                        <button key={z.id} type="button" aria-pressed={cur.zone === z.id} onClick={() => moveTo(curKey, z)}>
                          {z.label}
                        </button>
                      ))}
                      {cur.zone === "egen" ? (
                        <button type="button" aria-pressed>
                          Egen placering
                        </button>
                      ) : null}
                    </div>
                    {locked ? <p className="cz-note">{zoneRule(cur.zone)}</p> : null}
                    {clashNote}
                  </section>

                  <section className="cz-sec">
                    <label className="insp-range">
                      <span className="drawer-label">
                        Storlek <span>{cmText(cur.sizeCm)} bred</span>
                      </span>
                      <input type="range" min={2} max={maxCm(curKey, cur.zone)} step={maxCm(curKey, cur.zone) % 1 ? 0.1 : 1} value={cur.sizeCm} onChange={(e) => setCur({ sizeCm: Number(e.target.value) })} />
                    </label>
                  </section>
                </>
              )}

              <section className="cz-sec" data-sec="product">
                <p className="drawer-label">
                  Produktfärg <span>{colorName(color)}</span>
                </p>
                <div className="swatches">
                  {suggestions(brandColor).map((s) => (
                    <button key={s.hex} type="button" className="swatch" title={s.name} aria-label={s.name} aria-pressed={color === s.hex.toUpperCase()} style={{ background: s.hex }} onClick={() => setColor(s.hex.toUpperCase())} />
                  ))}
                  <label className={`swatch swatch-custom${customColor ? " is-on" : ""}`} title="Välj egen färg" style={customColor ? { background: color } : undefined}>
                    <input type="color" value={color.toLowerCase()} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Välj egen färg" />
                  </label>
                </div>
                {lowContrast ? (
                  <div className="cz-warn cz-contrast">
                    <span>Trycket syns dåligt på {colorName(color).toLowerCase()}.</span>
                    {lowContrast.hex ? (
                      <button type="button" onClick={() => setColor(lowContrast.hex)}>
                        <i style={{ background: lowContrast.hex }} aria-hidden /> Byt till {lowContrast.name.toLowerCase()}
                      </button>
                    ) : (
                      <span>Prova en ljusare eller mörkare produktfärg, eller färre färger i trycket.</span>
                    )}
                  </div>
                ) : null}
              </section>

              <div className="cz-price">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
                <DeliveryNote product={product} design={design} needBy={needBy} />
              </div>

              <div className="cz-foot">
                {saveError ? <p className="brandbar-err">{saveError}</p> : null}
                <button type="button" className="drawer-save" onClick={() => void save()} disabled={!art || saving}>
                  {saving ? "Sparar…" : saveLabel}
                </button>
                <button type="button" className="cz-export" onClick={download} disabled={!art}>
                  Ladda ner bild
                </button>
              </div>
        </aside>

        {aside ? <aside className="cz-aside">{aside}</aside> : null}
      </div>
    </div>
  );
}
