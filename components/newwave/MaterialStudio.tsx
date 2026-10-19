"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLoader } from "@/components/IFKLoader";
import { ClubLoader } from "@/components/newwave/ClubLoader";
import { MerchGrid } from "@/components/newwave/MerchGrid";
import { type PackClub, PackView } from "@/components/newwave/PackView";
import type { Saved } from "@/components/newwave/studio/StudioButton";
import { type Made, makeAssets, makeMaterial, post, takePhotos } from "@/lib/newwave/buildPack";
import { NW_CATALOG, nwProduct } from "@/lib/newwave/catalog";
import type { Customized } from "@/lib/newwave/marking";
import { genitive } from "@/lib/newwave/newsletterHtml";
import type { PackAssets, PackPhoto } from "@/lib/newwave/store";
import type { Concept, RuleCheck, Signal } from "@/lib/types";

type Suggestion = Concept & { checks: RuleCheck[] };

const fmtDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00Z`));

function Steps({ stage }: { stage: number }) {
  const labels = ["Tillfälle", "Motiv", "Tryckfil och inlägg", "Godkännande"];
  return (
    <ol className="grid grid-cols-4 gap-2">
      {labels.map((l, i) => (
        <li key={l} className="min-w-0">
          <div className={`h-1 rounded-full ${i <= stage ? "bg-[var(--club)]" : "bg-[var(--nw-soft-2)]"}`} />
          <p className={`mt-2 truncate text-[12px] ${i === stage ? "font-medium text-[var(--nw-ink)]" : "text-[var(--nw-faint)]"}`}>{l}</p>
        </li>
      ))}
    </ol>
  );
}

export function MaterialStudio({
  clubId,
  clubName,
  footer,
  primary,
  pack,
  shopName,
  occasions,
  initialId,
  loaderLines,
  loaderDone,
  from,
  approveBase = "/newwave/klubb/godkann",
}: {
  clubId: string;
  clubName: string;
  footer: string;
  primary: string;
  /** Klubbens konton och färger, för att visa inläggen som de publiceras. */
  pack: PackClub;
  shopName: string;
  occasions: Signal[];
  initialId?: string;
  loaderLines?: string[];
  loaderDone?: string;
  /** Avsändare när någon annan än klubben skapar materialet, t.ex. "Craft". */
  from?: string;
  /** Var klubbens godkännandesida ligger; null när klubben saknar dashboard i hubben. */
  approveBase?: string | null;
}) {
  const loader = useLoader();
  const router = useRouter();
  const [signal, setSignal] = useState<Signal | null>(() => occasions.find((o) => o.id === initialId) ?? null);
  const [custom, setCustom] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [made, setMade] = useState<Made | null>(null);
  /** Produkter som anpassats i designstudion innan materialet skickats. */
  const [customized, setCustomized] = useState<Record<string, Omit<Customized, "mockupUrl">>>({});
  const [assets, setAssets] = useState<PackAssets | null>(null);
  const [photos, setPhotos] = useState<PackPhoto[] | null>(null);
  const [assetError, setAssetError] = useState(false);
  const runId = useRef(0);
  const assetRun = useRef(0);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<null | "concepts" | "making" | "sending">(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const started = useRef(false);

  const stage = sent ? 3 : made ? 2 : suggestions.length || busy === "concepts" ? 1 : 0;

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      if (kind !== "sending") loader.done();
    } catch (e) {
      loader.fail();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const suggest = (s: Signal) =>
    run("concepts", async () => {
      setSignal(s);
      setSuggestions([]);
      setMade(null);
      setSent(null);
      loader.start(`Tar fram motiv till ${s.title}`, 92, 22000);
      const res = await post<{ concepts: Suggestion[] }>("/api/v1/concepts", { clubId, signals: [s], count: 3, hub: true });
      setSuggestions(res.concepts);
    });

  useEffect(() => {
    if (started.current || !signal) return;
    started.current = true;
    void suggest(signal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const make = (concept: Concept, note?: string) =>
    run("making", async () => {
      if (!signal) return;
      const id = ++runId.current;
      setAssets(null);
      setPhotos(null);
      setAssetError(false);
      loader.start("Designagenten ritar motivet", 58, 45000);
      const result = await makeMaterial({ clubId, concept, signal, footer, primary, note, stage: loader.stage });
      setMade(result);
      setCustomized({});
      setFeedback("");
      buildAssets(result);
      takePhotos(clubId, concept, result.printFiles).then((p) => runId.current === id && setPhotos(p));
    });

  const buildAssets = (m: Made) => {
    const id = ++assetRun.current;
    const mine = () => assetRun.current === id;
    makeAssets({ made: m, primary, accent: pack.colors.accent, shopName })
      .then((a) => mine() && setAssets(a))
      .catch(() => mine() && setAssetError(true));
  };

  /** En produkt har anpassats i designstudion: ny bild i rutnätet, i kanalbilderna och i det som skickas. */
  const customize = (productId: string, s: Saved) => {
    if (!made) return;
    const next = { ...made, photos: { ...made.photos, [productId]: s.mockupUrl }, mockups: { ...made.mockups, [productId]: s.mockupUrl } };
    setMade(next);
    setCustomized((c) => ({ ...c, [productId]: { design: s.design, color: s.color } }));
    if (sent) return;
    setAssets(null);
    setAssetError(false);
    buildAssets(next);
  };

  const send = () =>
    run("sending", async () => {
      if (!made) return;
      const { approval } = await post<{ approval: { id: string } }>("/api/v1/newwave/approvals", {
        clubId,
        concept: made.concept,
        previewUrl: made.printFiles.light,
        printFiles: made.printFiles,
        mockups: made.mockups,
        designs: customized,
        from,
        content: { instagram: made.content.instagram, facebook: made.content.facebook, newsletter: made.content.newsletter, banner: made.content.banner, tiktok: made.content.tiktok, plan: made.content.plan },
        assets: assets ?? undefined,
        photos: photos ?? undefined,
        shopUrl: made.shopUrl,
      });
      setSent(approval.id);
      router.refresh();
    });

  const addCustom = () => {
    const title = custom.trim();
    if (title.length < 2) return;
    void suggest({ id: `custom-${Date.now()}`, kind: "custom", title, detail: title });
  };

  return (
    <div>
      <ClubLoader state={loader.state} crestUrl={`/api/v1/brand/${clubId}/skold-farg.png`} lines={loaderLines} doneLine={loaderDone} wide />
      <Steps stage={stage} />

      <section className="mt-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {occasions.slice(0, 8).map((o) => {
            const on = signal?.id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={busy !== null}
                onClick={() => suggest(o)}
                aria-pressed={on}
                title={o.title}
                className={`nw-chip h-[52px] w-full min-w-0 flex-col justify-center gap-0.5 rounded-2xl px-3 text-[13.5px] leading-tight transition-colors disabled:opacity-50 ${on ? "border-[var(--club)] bg-[var(--club)] text-white" : "hover:border-[var(--nw-ink)]"}`}
              >
                <span className="max-w-full truncate">{o.title.split(" – ")[0]}</span>
                {o.date ? <span className={`text-[11.5px] font-normal ${on ? "text-white/60" : "text-[var(--nw-faint)]"}`}>{fmtDay(o.date)}</span> : null}
              </button>
            );
          })}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Något eget? T.ex. Åsa Cupen 2026"
            aria-label="Eget tillfälle"
            className="h-11 min-w-0 flex-1 rounded-full bg-[var(--nw-soft)] px-5 text-[16px] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]"
          />
          <button type="submit" className="nw-btn shrink-0" disabled={busy !== null || custom.trim().length < 2}>
            Föreslå
          </button>
        </form>
      </section>

      {error ? <p className="mt-5 rounded-2xl bg-[#FEF3F2] p-4 text-[14px] text-[#B42318]">{error}</p> : null}


      {suggestions.length && !made ? (
        <section className="mt-8">
          <h2 className="nw-club-heading text-[18px] text-[var(--club)]">Välj motiv</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {suggestions.map((s) => {
              const ok = s.checks.every((c) => c.ok);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy !== null || !ok}
                  onClick={() => make(s)}
                  className="group flex min-w-0 flex-col rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-5 text-left transition-colors hover:border-[var(--club)] disabled:opacity-60"
                >
                  <p className="nw-club-heading text-[22px] leading-[1.05] text-[var(--club)] [overflow-wrap:anywhere]">{s.slogan}</p>
                  <p className="mt-3 flex-1 text-[13.5px] text-[var(--nw-muted)]">{s.story}</p>
                  <p className="mt-4 text-[12px] text-[var(--nw-faint)]">
                    {s.products.map((id) => NW_CATALOG.find((p) => p.id === id)?.name).filter(Boolean).join(" · ")}
                  </p>
                  <span className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-[var(--nw-soft)] text-[13px] font-medium text-[var(--nw-ink)] transition-colors group-hover:bg-[var(--club)] group-hover:text-white">
                    {ok ? "Gör tryckfil" : "Bryter mot regelboken"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}


      {made ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="nw-club-heading text-[18px] text-[var(--club)]">{made.concept.slogan}</h2>
            <p className="text-[12.5px] text-[var(--nw-muted)]">
              {made.artwork.passed ? "✓ Godkänd mot regelboken" : "Granskaren hade anmärkningar"} · {made.artwork.attempts} försök
            </p>
          </div>
          <div className="mt-3">
            <MerchGrid
              title={made.concept.slogan}
              printUrl={made.preview.light}
              art={made.preview}
              products={made.concept.products.flatMap((id) => {
                const p = nwProduct(id);
                return p && made.photos[id] ? [{ id, name: p.name.split(",")[0], priceSek: p.priceSek, mockupUrl: made.photos[id], custom: customized[id] }] : [];
              })}
              target={sent ? { kind: "approval", clubId, approvalId: sent } : undefined}
              onSaved={customize}
            />
          </div>

          <PackView
            club={pack}
            slogan={made.concept.slogan}
            content={made.content}
            assets={assets}
            photos={photos}
            products={made.concept.products.flatMap((id) => {
              const p = nwProduct(id);
              return p && made.mockups[id] ? [{ name: p.name.split(",")[0], priceSek: p.priceSek, mockupUrl: made.mockups[id] }] : [];
            })}
            shopUrl={made.shopUrl}
            printUrl={made.printFiles.light}
          />
          {assetError ? <p className="mt-3 text-[13px] text-[#B42318]">Kanalbilderna kunde inte byggas – texterna och produktbilderna går ändå att skicka.</p> : null}

          {sent ? (
            <div className="mt-5 rounded-[var(--nw-radius)] bg-[var(--club)] p-5 text-white">
              <p className="nw-club-heading text-[18px]">Skickat för godkännande</p>
              <p className="mt-1 text-[14px] text-white/70">
                {from ? `${genitive(clubName)} kansli ser det under Att godkänna.` : "Kansliet ser det under Att godkänna."} När det godkänns läggs produkterna i butiken.
              </p>
              {approveBase ? (
                <Link href={`${approveBase}/${sent}`} className="nw-btn nw-club-btn mt-4">
                  {from ? "Se det som klubben ser det" : "Granska nu"}
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="nw-btn nw-club-btn justify-center" disabled={busy !== null || photos === null || (!assets && !assetError)} onClick={send}>
                {busy === "sending" ? "Skickar…" : photos === null || (!assets && !assetError) ? "Fotografen jobbar…" : "Skicka för godkännande"}
              </button>
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (feedback.trim().length > 2) void make(made.concept, feedback.trim());
                }}
              >
                <input
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Ändra något? T.ex. större boll"
                  aria-label="Feedback till Designagenten"
                  className="h-[42px] min-w-0 flex-1 rounded-full bg-[var(--nw-soft)] px-4 text-[16px] outline-none focus:ring-2 focus:ring-[var(--club)] sm:text-[14px]"
                />
                <button type="submit" className="nw-btn nw-btn-ghost shrink-0" disabled={busy !== null || feedback.trim().length < 3}>
                  Gör om
                </button>
              </form>
            </div>
          )}
          {!sent ? (
            <button type="button" className="mt-4 text-[13px] text-[var(--nw-muted)] underline underline-offset-4" onClick={() => setMade(null)} disabled={busy !== null}>
              ← Välj ett annat motiv
            </button>
          ) : null}
        </section>
      ) : null}

      {!signal && !busy ? (
        <p className="mt-8 text-[13.5px] text-[var(--nw-faint)]">{genitive(clubName)} kalender ligger överst – klicka på ett tillfälle för att börja.</p>
      ) : null}
    </div>
  );
}
