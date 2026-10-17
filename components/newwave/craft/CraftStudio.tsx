"use client";

import { useState } from "react";
import type { Signal } from "@/lib/types";
import { MaterialStudio } from "../MaterialStudio";
import { Crest } from "./parts";

export type StudioClub = {
  id: string;
  name: string;
  logo?: string;
  colors: [string, string];
  footer: string;
  website: string;
  handle: string;
  shopName: string;
  theme: { primary: string; accent: string; onAccent: string; soft: string };
  occasions: Signal[];
  loaderLines?: string[];
  loaderDone?: string;
  approveBase: string | null;
};

export function CraftStudio({ clubs, preselect }: { clubs: StudioClub[]; preselect?: string }) {
  const [id, setId] = useState(clubs.find((c) => c.id === preselect)?.id ?? clubs[0].id);
  const club = clubs.find((c) => c.id === id)!;

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Klubb">
        {clubs.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setId(c.id)}
            aria-pressed={c.id === id}
            className={`inline-flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-[14px] font-medium transition-colors ${c.id === id ? "border-[var(--nw-ink)] bg-[var(--nw-soft)] text-[var(--nw-ink)]" : "border-[var(--nw-line)] text-[var(--nw-muted)] hover:border-[var(--nw-ink)]"}`}
          >
            <Crest name={c.name} logo={c.logo} colors={c.colors} size={28} />
            {c.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13.5px] text-[var(--nw-muted)]">
        Materialet görs i {club.name}s färger och ton och skickas till klubben för godkännande, märkt ”från Craft”.
      </p>
      <div
        key={club.id}
        className="mt-5"
        style={
          {
            "--club": club.theme.primary,
            "--club-accent": club.theme.accent,
            "--club-on-accent": club.theme.onAccent,
            "--club-soft": club.theme.soft,
          } as React.CSSProperties
        }
      >
        <MaterialStudio
          clubId={club.id}
          clubName={club.name}
          footer={club.footer}
          primary={club.theme.primary}
          pack={{ name: club.name, handle: club.handle, logo: club.logo ?? `/api/v1/brand/${club.id}/skold-farg.png`, website: club.website, colors: club.theme }}
          shopName={club.shopName}
          occasions={club.occasions}
          loaderLines={club.loaderLines}
          loaderDone={club.loaderDone}
          from="Craft"
          approveBase={club.approveBase}
        />
      </div>
    </div>
  );
}
