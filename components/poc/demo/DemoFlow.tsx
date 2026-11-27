"use client";

import { useEffect, useMemo, useState } from "react";
import { wordmarkUrl } from "@/lib/newwave/wordmark/spec";

type Club = { id: string; name: string; municipality: string; sport: string; colors: string[]; logo: string };
type Template = { id: string; name: string };
type Sku = { sku: string; name: string };
type Design = { kind: "mall"; template: string; name: string } | { kind: "fil"; designId: string; art: string; name: string };
type PreviewItem = { clubId: string; sku: string; title: string; mockupUrl: string; priceSek: number };
type Published = { designId: string; clubs: { clubId: string; products: { id: string; title: string; sku: string; priceSek: number; mockupUrl: string }[] }[] };
type Job = { producer: "tryckeri" | "stickeri"; status: string; tracking: string | null; files: { name: string; label: string; url: string }[] };
type Status = { status: string; erpRef: string | null; lines: { title: string; size: string | null; qty: number; unitSek: number }[]; totalSek: number; jobs: Job[] };
type Order = Status & { orderId: string; number: string; statusPath: string };

const STATUS: Record<string, string> = { ny: "Ny", accepterad: "Accepterad", "i produktion": "I produktion", skickad: "Skickad", fel: "Problem", mottagen: "Mottagen", bekräftad: "Bekräftad", "delvis skickad": "Delvis skickad", avbruten: "Avbruten" };
const NEXT: Record<string, string | null> = { ny: "Acceptera", accepterad: "Starta produktionen", "i produktion": "Markera som skickad", skickad: null, fel: null };
const PRODUCER = { tryckeri: { name: "Tryckeriet", text: "Plaggen: tryckfiler per färg, korrektur och arbetsorder." }, stickeri: { name: "Stickeriet", text: "Halsduken: stickfilen i stickeriets format, med stickorder." } };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/v1/poc/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Steget gick inte att göra.");
  return json as T;
}

/** Filens namn utan klubbens: "Linghems Sportklubb T-shirt: Korrektur" blir "T-shirt: Korrektur". */
const shortLabel = (label: string) => label.replace(/^.*?\b(T-shirt|Hoodie|Sweatshirt|Joggingbyxor|Softshelljacka|Halsduk)\b/, "$1");

/** Designen för en klubb, som den trycks: ordmallen med klubbens namn, eller filen i klubbens färger med märket. */
const artFor = (d: Design, clubId: string, size = 800) => (d.kind === "mall" ? wordmarkUrl({ template: d.template, icon: true, ornament: true }, clubId, "light", size) : `/api/v1/craft/designs/${d.designId}/art?c=${encodeURIComponent(clubId)}`);

/** Den guidade demon: tre klubbar, tre designer (eller en egen), och hela vägen till kunden. */
export function DemoFlow({ loggedIn, clubs, templates, skus }: { loggedIn: boolean; clubs: Club[]; templates: Template[]; skus: Sku[] }) {
  const [authed, setAuthed] = useState(loggedIn);
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>(clubs.map((c) => c.id));
  const [design, setDesign] = useState<Design | null>(null);
  const [preview, setPreview] = useState<{ key: string; items: PreviewItem[] } | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [buyer, setBuyer] = useState<string>(clubs[0]?.id ?? "");
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const chosen = clubs.filter((c) => picked.includes(c.id));
  const designKey = design ? (design.kind === "mall" ? `t:${design.template}` : `d:${design.designId}`) : "";
  const previewKey = `${designKey}|${picked.join(",")}`;
  const byId = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  // Förhandsvisningen: samma titlar, plaggfärger och bilder som publiceringen ger, för de valda klubbarna.
  useEffect(() => {
    if (!design || !picked.length) return;
    let live = true;
    const key = `${design.kind === "mall" ? `t:${design.template}` : `d:${design.designId}`}|${picked.join(",")}`;
    void fetch("/api/v1/craft/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(design.kind === "mall" ? { template: design.template } : { designId: design.designId }), clubIds: picked, skus: skus.map((s) => s.sku) }),
    })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items: PreviewItem[] }) => live && setPreview({ key, items: j.items }));
    return () => {
      live = false;
    };
  }, [design, picked, skus]);

  /** En ändring av klubbarna eller designen börjar om från publiceringen. */
  const reset = () => {
    setPublished(null);
    setOrder(null);
    setError("");
  };

  async function run<T>(what: string, fn: () => Promise<T>) {
    setBusy(what);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Steget gick inte att göra.");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File) {
    await run("upload", async () => {
      const form = new FormData();
      form.set("name", `Egen design ${new Date().toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      form.set("file", file);
      const res = await fetch("/api/v1/craft/designs", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Bilden gick inte att ladda upp.");
      reset();
      setDesign({ kind: "fil", designId: json.design.id, art: json.design.art, name: "Egen design" });
    });
  }

  if (!authed)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("start", async () => {
            await call({ action: "start", password });
            setAuthed(true);
          });
        }}
        className="mt-8 flex max-w-[520px] flex-col gap-2.5 sm:flex-row"
      >
        <label className="flex-1">
          <span className="sr-only">Crafts lösenord</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Crafts lösenord" className="h-12 w-full rounded-full bg-[#F2F1EE] px-5 text-[15px] outline-none ring-[#111] focus:ring-2" />
        </label>
        <button type="submit" disabled={busy === "start"} className="h-12 rounded-full bg-[#111] px-6 text-[15px] font-semibold text-white transition hover:bg-[#333] disabled:opacity-60">
          {busy === "start" ? "Startar …" : "Starta demon"}
        </button>
        {error && <p className="self-center text-[13.5px] text-[#9B1C1C]">{error}</p>}
      </form>
    );

  const items = preview?.key === previewKey ? preview.items : null;
  const jobs = order?.jobs ?? [];
  const allShipped = jobs.length > 0 && jobs.every((j) => j.status === "skickad");

  return (
    <div className="mt-10 flex flex-col gap-4">
      {error && <p className="sticky top-3 z-10 rounded-2xl bg-[#FDF2F2] px-4 py-3 text-[14px] text-[#9B1C1C] shadow">{error}</p>}

      <Step n={1} title="Välj klubbar" text="Tre föreningar i Linköping. Designen görs till varje klubbs egen – med klubbens namn, färger och märke.">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {clubs.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? picked.filter((x) => x !== c.id) : clubs.map((x) => x.id).filter((x) => x === c.id || picked.includes(x));
                  if (!next.length) return;
                  reset();
                  setPicked(next);
                  if (!next.includes(buyer)) setBuyer(next[0]);
                }}
                className={`flex items-center gap-3 rounded-2xl p-3 text-left transition ${on ? "bg-white shadow-[0_0_0_2px_#111]" : "bg-[#F7F6F3] opacity-60 hover:opacity-100"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logo} alt="" className="h-14 w-14 shrink-0 object-contain" />
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold">{c.name}</span>
                  <span className="block truncate text-[12.5px] text-[#6F6B63]">{[c.municipality, c.sport].filter(Boolean).join(" · ")}</span>
                  <span className="mt-1 flex gap-1">
                    {c.colors.slice(0, 3).map((hex) => (
                      <span key={hex} className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ background: hex }} />
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Step>

      <Step n={2} title="Välj en design – eller ladda upp en egen" text={`Craft gör designen en gång. Visas här med ${chosen[0]?.name ?? "den första klubben"}.`}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {templates.map((t) => {
            const on = design?.kind === "mall" && design.template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  reset();
                  setDesign({ kind: "mall", template: t.id, name: t.name });
                }}
                className={`overflow-hidden rounded-2xl text-left transition ${on ? "shadow-[0_0_0_2px_#111]" : "shadow-[0_0_0_1px_rgba(17,17,17,0.1)] hover:shadow-[0_0_0_1px_rgba(17,17,17,0.35)]"}`}
              >
                <span className="relative block aspect-[4/3] bg-[#F2F1EE]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={wordmarkUrl({ template: t.id, icon: true, ornament: true }, chosen[0]?.id ?? clubs[0].id, "light", 480)} alt="" className="absolute inset-0 h-full w-full object-contain p-[10%]" />
                </span>
                <span className="block px-3 py-2 text-[13.5px] font-semibold">{t.name}</span>
              </button>
            );
          })}
          <label className={`flex cursor-pointer flex-col overflow-hidden rounded-2xl transition ${design?.kind === "fil" ? "shadow-[0_0_0_2px_#111]" : "shadow-[0_0_0_1px_rgba(17,17,17,0.1)] hover:shadow-[0_0_0_1px_rgba(17,17,17,0.35)]"}`}>
            <span className="relative grid aspect-[4/3] place-items-center bg-[#F2F1EE]">
              {design?.kind === "fil" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={design.art} alt="" className="absolute inset-0 h-full w-full object-contain p-[10%]" />
              ) : (
                <span className="text-center text-[13px] text-[#6F6B63]">{busy === "upload" ? "Laddar upp …" : "+ PNG, JPG eller SVG"}</span>
              )}
            </span>
            <span className="block px-3 py-2 text-[13.5px] font-semibold">Egen design</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </Step>

      <Step n={3} title="Samma design – för varje klubb" text="Plattformen gör designen till varje klubbs egen och ritar den på plaggen och halsduken, i den plaggfärg där trycket syns bäst." disabled={!design}>
        {design && (
          <div className="grid gap-4 lg:grid-cols-3">
            {chosen.map((c) => (
              <div key={c.id} className="rounded-2xl bg-[#F7F6F3] p-3">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.logo} alt="" className="h-7 w-7 object-contain" />
                  <span className="truncate text-[14px] font-semibold">{c.name}</span>
                </div>
                <div className="relative mt-2 aspect-[4/3] rounded-xl bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={artFor(design, c.id)} alt={`${design.name} för ${c.name}`} className="absolute inset-0 h-full w-full object-contain p-[8%]" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {skus.map((s) => {
                    const item = items?.find((i) => i.clubId === c.id && i.sku === s.sku);
                    return (
                      <div key={s.sku} className="overflow-hidden rounded-xl bg-white">
                        <div className="relative aspect-square">
                          {item ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.mockupUrl} alt={item.title} loading="lazy" className="absolute inset-0 h-full w-full object-contain" />
                          ) : (
                            <div className="absolute inset-0 animate-pulse bg-[#EFEDE8]" />
                          )}
                        </div>
                        <p className="truncate px-2 pb-1.5 text-[11.5px] text-[#4A4740]">
                          {s.name}
                          {item ? ` · ${item.priceSek} kr` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Step>

      <Step n={4} title="Publicera i klubbarnas shoppar" text="Ett klick lägger ut produkterna i varje klubbs Intersport-shop." disabled={!design}>
        {published ? (
          <ul className="grid gap-2 sm:grid-cols-3">
            {published.clubs.map((p) => (
              <li key={p.clubId} className="flex items-center justify-between gap-2 rounded-2xl bg-[#F7F6F3] px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold">{byId.get(p.clubId)?.name}</span>
                  <span className="block text-[12.5px] text-[#6F6B63]">{p.products.length} produkter i shoppen</span>
                </span>
                <a href={`/intersport/${p.clubId}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium shadow-[inset_0_0_0_1px_rgba(17,17,17,0.2)] hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.5)]">
                  Öppna shoppen ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <Primary
            busy={busy === "publicera"}
            onClick={() =>
              design &&
              void run("publicera", async () => {
                const r = await call<Published>({ action: "publicera", ...(design.kind === "mall" ? { template: design.template } : { designId: design.designId }), clubIds: picked });
                setPublished(r);
              })
            }
          >
            Publicera i {picked.length === 1 ? "klubbens shop" : `de ${picked.length} klubbarnas shoppar`}
          </Primary>
        )}
      </Step>

      <Step n={5} title="En kund handlar" text="I shoppen väljer kunden storlek och betalar. Provordern: t-shirt, hoodie, softshelljacka och halsduk, hämtas i butik. Ordern går till Crafts affärssystem, som bekräftar den." disabled={!published}>
        {order ? (
          <div className="rounded-2xl bg-[#F7F6F3] p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[16px] font-semibold">{order.number}</span>
              <Pill status={order.status} />
              {order.erpRef && <span className="text-[13px] text-[#6F6B63]">Affärssystemets nummer {order.erpRef}</span>}
            </div>
            <ul className="mt-2 text-[13.5px] text-[#4A4740]">
              {order.lines.map((l) => (
                <li key={l.title}>
                  {l.qty} × {l.title}
                  {l.size ? `, ${l.size}` : ""} – {l.unitSek} kr
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[13.5px] font-semibold">Totalt {order.totalSek} kr</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {published && published.clubs.length > 1 && (
              <select value={buyer} onChange={(e) => setBuyer(e.target.value)} aria-label="Klubbens shop" className="h-11 rounded-full bg-[#F2F1EE] px-4 text-[14px]">
                {published.clubs.map((p) => (
                  <option key={p.clubId} value={p.clubId}>
                    {byId.get(p.clubId)?.name}
                  </option>
                ))}
              </select>
            )}
            <Primary
              busy={busy === "order"}
              onClick={() =>
                published &&
                void run("order", async () => {
                  const club = published.clubs.some((p) => p.clubId === buyer) ? buyer : published.clubs[0].clubId;
                  setOrder(await call<Order>({ action: "order", clubId: club, designId: published.designId }));
                })
              }
            >
              Lägg provordern
            </Primary>
          </div>
        )}
      </Step>

      <Step n={6} title="Tryckeriet och stickeriet" text="Ordern delas: plaggen till tryckeriet och halsduken till stickeriet, var och en med sina filer. Producenten för jobbet framåt – här med knappen." disabled={!order}>
        <div className="grid gap-3 md:grid-cols-2">
          {(["tryckeri", "stickeri"] as const).map((p) => {
            const job = jobs.find((j) => j.producer === p);
            const proof = job?.files.find((f) => /korrektur/i.test(f.name) && /\.png$/i.test(f.name));
            const next = job ? NEXT[job.status] : null;
            return (
              <div key={p} className="rounded-2xl bg-[#F7F6F3] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold">{PRODUCER[p].name}</span>
                  {job && <Pill status={job.status} />}
                </div>
                <p className="mt-0.5 text-[12.5px] text-[#6F6B63]">{PRODUCER[p].text}</p>
                {job ? (
                  <>
                    {proof && (
                      <a href={proof.url} target="_blank" rel="noreferrer" className="relative mt-3 block aspect-[16/10] overflow-hidden rounded-xl bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proof.url} alt={proof.label} className="absolute inset-0 h-full w-full object-contain" />
                      </a>
                    )}
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {job.files.slice(0, 6).map((f) => (
                        <li key={f.name}>
                          <a href={f.url} target="_blank" rel="noreferrer" className="inline-block max-w-[240px] truncate rounded-full bg-white px-2.5 py-1 text-[12px] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)] hover:shadow-[inset_0_0_0_1px_rgba(17,17,17,0.4)]">
                            ↓ {shortLabel(f.label)}
                          </a>
                        </li>
                      ))}
                      {job.files.length > 6 && <li className="px-1 py-1 text-[12px] text-[#6F6B63]">+ {job.files.length - 6} filer till</li>}
                    </ul>
                    <div className="mt-3 flex items-center gap-3">
                      {next ? (
                        <Primary
                          busy={busy === p}
                          onClick={() =>
                            order &&
                            void run(p, async () => {
                              const s = await call<Status>({ action: "producent", orderId: order.orderId, producer: p });
                              setOrder({ ...order, ...s });
                            })
                          }
                        >
                          {next}
                        </Primary>
                      ) : (
                        <span className="text-[13.5px] text-[#166534]">Skickad{job.tracking ? ` · spårning ${job.tracking}` : ""}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-[13px] text-[#6F6B63]">{order ? "Väntar på affärssystemet …" : "Inget jobb än."}</p>
                )}
              </div>
            );
          })}
        </div>
      </Step>

      <Step n={7} title="Kunden ser sin order" text="Kundens statussida följer ordern: bekräftad, i produktion och skickad med spårningsnummer." disabled={!order}>
        {order && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[14.5px]">
              {allShipped ? "Ordern är skickad – kunden ser spårningsnumren." : `Ordern är ${(STATUS[order.status] ?? order.status).toLowerCase()}.`}
            </span>
            <a href={order.statusPath} target="_blank" rel="noreferrer" className="rounded-full bg-[#111] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#333]">
              Kundens statussida ↗
            </a>
          </div>
        )}
      </Step>

      {(published || order) && (
        <button
          type="button"
          onClick={() => {
            reset();
            setDesign(null);
            setPicked(clubs.map((c) => c.id));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="self-start rounded-full px-4 py-2 text-[13.5px] font-medium text-[#6F6B63] hover:text-[#111]"
        >
          Börja om
        </button>
      )}
    </div>
  );
}

function Step({ n, title, text, disabled, children }: { n: number; title: string; text: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-[24px] p-5 shadow-[0_0_0_1px_rgba(17,17,17,0.08)] transition sm:p-6 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex gap-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#111] text-[14px] font-semibold text-white">{n}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-semibold leading-tight tracking-[-0.01em]">{title}</h2>
          <p className="mt-1 max-w-[720px] text-[13.5px] leading-relaxed text-[#6F6B63]">{text}</p>
          {!disabled && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </section>
  );
}

function Primary({ busy, onClick, children }: { busy?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="h-11 rounded-full bg-[#111] px-5 text-[14px] font-semibold text-white transition hover:bg-[#333] disabled:opacity-60">
      {busy ? "Arbetar …" : children}
    </button>
  );
}

function Pill({ status }: { status: string }) {
  const done = status === "skickad";
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${done ? "bg-[#DCFCE7] text-[#166534]" : "bg-white text-[#4A4740] shadow-[inset_0_0_0_1px_rgba(17,17,17,0.1)]"}`}>{STATUS[status] ?? status}</span>;
}
