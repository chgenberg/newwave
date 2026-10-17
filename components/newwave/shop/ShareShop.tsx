"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { shopUrl, type Reseller } from "@/lib/newwave/reseller";
import { withDemo } from "@/lib/newwave/workspaceId";
import { TestAsCustomer } from "./ShopClient";

/**
 * Allt återförsäljaren behöver för att få ut butiken till sina företagskunder: länk, QR-kod, ett färdigt mejl och att
 * prova själv. Besökarens demomiljö följer med i länken (`ws`), så att en mobil som skannar QR-koden ser samma butik.
 */
export function ResellerShare({ shop, ws }: { shop: Pick<Reseller, "slug" | "name" | "texts">; ws: string | null }) {
  const name = shop.texts.shopName || shop.name;
  const path = shopUrl(shop);
  const mail = {
    subject: `Designa era profilprodukter själva hos ${name}`,
    body: (url: string) => `Hej!\n\nNu kan ni göra era profilprodukter själva i vår webbshop. Ladda upp loggan, se den på produkterna i 3D och beställ direkt:\n${url}\n\nVänliga hälsningar\n${name}`,
  };
  const [shared, setShared] = useState(path);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState<"" | "link" | "mail">("");

  useEffect(() => {
    const full = new URL(withDemo(path, ws), window.location.origin).href;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adressen finns först i webbläsaren
    setShared(full);
    QRCode.toDataURL(full, { margin: 1, width: 480, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(""));
  }, [path, ws]);

  const copy = (text: string, what: "link" | "mail") => {
    navigator.clipboard?.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1600);
  };
  const body = mail.body(shared);

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 rounded-[var(--nw-radius)] bg-[var(--nw-soft)] p-4">
        <p className="text-[12.5px] text-[var(--nw-muted)]">Länk till butiken</p>
        <p className="mt-1 break-all text-[14px] font-semibold text-[var(--nw-ink)]">{shared}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => copy(shared, "link")} className="nw-btn nw-club-btn">
            {copied === "link" ? "Kopierad" : "Kopiera länken"}
          </button>
          <TestAsCustomer slug={shop.slug} />
        </div>
        <div className="mt-4 border-t border-[var(--nw-line)] pt-4">
          <p className="text-[12.5px] text-[var(--nw-muted)]">Färdigt mejl till kunderna</p>
          <p className="mt-1 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-[var(--nw-ink)]">{body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`mailto:?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(body)}`} className="nw-btn nw-btn-ghost">
              Öppna i mejlen
            </a>
            <button type="button" onClick={() => copy(body, "mail")} className="nw-btn nw-btn-ghost">
              {copied === "mail" ? "Kopierat" : "Kopiera texten"}
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-row items-center gap-4 rounded-[var(--nw-radius)] border border-[var(--nw-line)] p-4 sm:w-[184px] sm:flex-col sm:items-stretch">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt={`QR-kod till ${name}`} className="aspect-square w-28 shrink-0 sm:w-full" />
        ) : (
          <span className="aspect-square w-28 shrink-0 animate-pulse rounded-xl bg-[var(--nw-soft)] sm:w-full" />
        )}
        <div className="min-w-0">
          <p className="text-[12.5px] leading-snug text-[var(--nw-muted)]">Till mässdisken, fakturan eller en affisch.</p>
          {qr ? (
            <a href={qr} download={`${name.toLowerCase().replace(/[^a-z0-9åäö]+/g, "-")}-qr.png`} className="nw-hit mt-1.5 inline-block text-[13px] font-medium text-[var(--nw-ink)] underline underline-offset-4">
              Ladda ner
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
