"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COLLECTIONS } from "@/lib/newwave/wordmark/collections";
import { type WordmarkNames, type WordmarkSpec, wordmarkUrl } from "@/lib/newwave/wordmark/spec";

type Listed = { id: string; name: string; style: string; source: string; score: number };
const FIRST = 8;
const k3 = (x: Extra) => JSON.stringify([x.team ?? "", x.player ?? "", x.number ?? ""]);

type Extra = Pick<WordmarkSpec, "team" | "player" | "number">;
const EXTRA_KEYS = ["team", "player", "number"] as const;

/**
 * Wordmarks i designstudion. Förhandsvisningen ritas med en klubb, men designen sparar bara mall och val –
 * varje klubb som får kollektionen får wordmarket med sitt eget namn, sina färger och sitt märke. Med `onCollection`
 * kan hela sortimentet få ett mallpaket i samma stil.
 */
export function WordmarkPicker({
  club,
  value,
  dark,
  onChange,
  onCollection,
}: {
  club: { id: string; name: string; logo?: string };
  value?: WordmarkSpec;
  dark: boolean;
  /** `side` säger att trycket hör hemma på ryggen (ryggtryck) eller fram igen efter ett ryggtryck. */
  onChange: (spec: WordmarkSpec | undefined, how?: { side?: "back" | "front" }) => void;
  onCollection?: (id: string) => void;
}) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [auto, setAuto] = useState<WordmarkNames>({});
  const [all, setAll] = useState(false);
  const own = value?.names?.[club.id];
  const [draft, setDraft] = useState<WordmarkNames>(own ?? {});
  const [extra, setExtra] = useState<Extra>({ team: value?.team, player: value?.player, number: value?.number });
  const [prevClub, setPrevClub] = useState(club.id);
  if (prevClub !== club.id) {
    setPrevClub(club.id);
    setDraft(value?.names?.[club.id] ?? {});
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/v1/newwave/wordmark/templates?c=${encodeURIComponent(club.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { templates: Listed[]; names: WordmarkNames | null } | null) => {
        if (!live || !d) return;
        setList(d.templates);
        setAuto(d.names ?? {});
      })
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [club.id]);

  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });
  // Namnen skrivs in i designen när man slutat skriva, så att förhandsvisningarna inte ritas om för varje tecken.
  useEffect(() => {
    const t = setTimeout(() => {
      const { value: v, onChange: change } = latest.current;
      if (!v) return;
      const n: WordmarkNames = { name1: draft.name1?.trim() || undefined, name2: draft.name2?.trim() || undefined };
      const cur = v.names?.[club.id];
      if ((cur?.name1 ?? "") === (n.name1 ?? "") && (cur?.name2 ?? "") === (n.name2 ?? "")) return;
      const names = { ...v.names };
      if (n.name1 || n.name2) names[club.id] = n;
      else delete names[club.id];
      change({ ...v, names: Object.keys(names).length ? names : undefined });
    }, 450);
    return () => clearTimeout(t);
  }, [draft, club.id]);
  useEffect(() => {
    const t = setTimeout(() => {
      const { value: v, onChange: change } = latest.current;
      if (!v) return;
      const next: Extra = {};
      for (const k of EXTRA_KEYS) next[k] = extra[k]?.trim() || undefined;
      if (k3(next) === k3(v)) return;
      change({ ...v, ...next });
    }, 450);
    return () => clearTimeout(t);
  }, [extra]);

  const variant = dark ? "dark" : "light";
  const isBack = (id?: string) => list?.find((t) => t.id === id)?.style === "Rygg";
  const back = isBack(value?.template);
  const pick = (template: string) => {
    const side = isBack(template) ? "back" : back ? "front" : undefined;
    onChange({ ...value, template, icon: value?.icon ?? true, ornament: value?.ornament ?? true }, { side });
    void fetch("/api/v1/newwave/wordmark/stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template }) }).catch(() => {});
  };
  const shown = list ? (all || !list.length ? list : list.slice(0, FIRST)) : [];
  const chosenHidden = value && list && !all && !shown.some((t) => t.id === value.template) ? list.find((t) => t.id === value.template) : undefined;
  const tiles = chosenHidden ? [...shown, chosenHidden] : shown;

  return (
    <div className="cz-wm">
      <p className="drawer-label">
        Wordmarks <span>visas med {club.name}</span>
      </p>
      <div className={`cz-wm-grid${dark ? " is-dark" : ""}`} role="radiogroup" aria-label="Wordmark">
        <button type="button" role="radio" aria-checked={!value} className="cz-wm-tile is-logo" onClick={() => onChange(undefined)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- klubbens märke */}
          {club.logo ? <img src={club.logo} alt="" /> : <span aria-hidden />}
          <small>Klubbens logga</small>
        </button>
        {list === null
          ? Array.from({ length: 5 }, (_, i) => <span key={i} className="cz-wm-tile is-loading" aria-hidden />)
          : tiles.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={value?.template === t.id} className="cz-wm-tile" title={t.score < 0.5 ? `${t.name} – gjord för kortare namn` : t.name} onClick={() => pick(t.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern per klubb */}
                <img src={wordmarkUrl({ ...value, template: t.id, icon: value?.icon ?? true, ornament: value?.ornament ?? true }, club.id, variant, 240)} alt="" loading="lazy" />
                <small>
                  {t.name}
                  {t.source !== "inbyggd" ? " · egen" : ""}
                </small>
              </button>
            ))}
      </div>
      <div className="cz-wm-links">
        {list && list.length > FIRST ? (
          <button type="button" className="cz-link" onClick={() => setAll((a) => !a)}>
            {all ? "Visa färre" : `Visa alla ${list.length}`}
          </button>
        ) : null}
        <Link href="/newwave/craft/designa/ordmarken" className="cz-link">
          Lägg till mall
        </Link>
      </div>

      {value ? (
        <div className="cz-wm-opts">
          <div className="cz-wm-names">
            <label>
              <span>Namn 1</span>
              <input value={draft.name1 ?? ""} maxLength={30} placeholder={auto.name1 || "—"} onChange={(e) => setDraft((d) => ({ ...d, name1: e.target.value }))} />
            </label>
            <label>
              <span>Namn 2</span>
              <input value={draft.name2 ?? ""} maxLength={30} placeholder={auto.name2 || "—"} onChange={(e) => setDraft((d) => ({ ...d, name2: e.target.value }))} />
            </label>
            <label>
              <span>Lag eller sektion</span>
              <input value={extra.team ?? ""} maxLength={30} placeholder="T.ex. Dam, P-12" onChange={(e) => setExtra((x) => ({ ...x, team: e.target.value }))} />
            </label>
            {back ? (
              <>
                <label>
                  <span>Namn på ryggen</span>
                  <input value={extra.player ?? ""} maxLength={30} placeholder="Namn" onChange={(e) => setExtra((x) => ({ ...x, player: e.target.value }))} />
                </label>
                <label>
                  <span>Nummer</span>
                  <input value={extra.number ?? ""} inputMode="numeric" maxLength={2} placeholder="10" onChange={(e) => setExtra((x) => ({ ...x, number: e.target.value.replace(/\D/g, "") }))} />
                </label>
              </>
            ) : null}
          </div>
          <div className="cz-chips">
            <button type="button" aria-pressed={value.icon} onClick={() => onChange({ ...value, icon: !value.icon })}>
              Klubbmärke
            </button>
            <button type="button" aria-pressed={value.ornament} onClick={() => onChange({ ...value, ornament: !value.ornament })}>
              Ornament
            </button>
            <button type="button" aria-pressed={!!value.worn} onClick={() => onChange({ ...value, worn: !value.worn || undefined })}>
              Slitet tryck
            </button>
          </div>
          <p className="cz-wm-help">
            Namn 1 skrivs alltid med versaler. Tomt fält = klubbens eget namn. Lag eller sektion ersätter sporten. Varje klubb får wordmarket med sitt namn, sina färger och sitt märke.
          </p>
        </div>
      ) : null}

      {onCollection ? (
        <div className="cz-wm-sets">
          <p className="drawer-label">
            Kollektioner <span>5 produkter i samma stil</span>
          </p>
          <div className="cz-wm-grid">
            {COLLECTIONS.map((c) => (
              <button key={c.id} type="button" className="cz-wm-tile" title={`${c.items.length} produkter: ${c.blurb}`} onClick={() => onCollection(c.id)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ritas av servern per klubb */}
                <img src={wordmarkUrl({ template: c.items[0].template, icon: true, ornament: true, worn: c.worn }, club.id, variant, 240)} alt="" loading="lazy" />
                <small>{c.name}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
