/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

export type CollageTile = { id: string; name: string; priceSek: number; url: string };
export type CollagePhoto = { id: string; label: string; url: string; review: { sales: number } | null };

type Slot = { cls: string; inner?: string; render: () => ReactNode };

function Box({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative h-full overflow-hidden rounded-[28px] ${className}`}>{children}</div>;
}

function ProductBox({ tile }: { tile?: CollageTile }) {
  if (!tile) return null;
  return (
    <Box className="group bg-[#F5F5F7]">
      <img src={tile.url} alt={tile.name} className="h-full w-full object-contain p-3 mix-blend-multiply transition duration-500 group-hover:scale-[1.04]" />
      <p className="absolute bottom-3 left-4 right-3 text-[12px] text-[#6E6E73] md:bottom-4 md:left-5 md:right-auto">
        <span className="font-medium text-[#1D1D1F]">{tile.name}</span> · {tile.priceSek} kr
      </p>
    </Box>
  );
}

function PhotoBox({ photo, label, pending }: { photo?: CollagePhoto; label: string; pending: boolean }) {
  return (
    <Box className="bg-[#F5F5F7]">
      {photo ? (
        <>
          <img src={photo.url} alt={photo.label} className="h-full w-full object-cover" />
          <span className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium backdrop-blur">
            {photo.label}
            {photo.review ? ` · ${photo.review.sales}/10` : ""}
          </span>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-[#86868B]">
          {pending ? (
            <>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#86868B] border-t-transparent" />
              Fotograferar {label.toLowerCase()}…
            </>
          ) : (
            "Fotot blev inte godkänt"
          )}
        </div>
      )}
    </Box>
  );
}

export function MerchCollage(props: {
  slogan: string;
  signal: string;
  story: string;
  printUrl: string;
  primary: string;
  tiles: CollageTile[];
  photos: CollagePhoto[] | null;
  blanketLabel?: string;
}) {
  const tile = (id: string) => props.tiles.find((t) => t.id === id);
  const photo = (id: string) => props.photos?.find((p) => p.id === id);
  const pending = props.photos === null;
  const p = (id: string, cls: string, inner?: string): Slot => ({ cls, inner, render: () => <ProductBox tile={tile(id)} /> });

  const slots: Slot[] = [
    { cls: "col-span-2 md:col-span-5 row-span-6", render: () => <PhotoBox photo={photo("livsstil")} label="Livsstil" pending={pending} /> },
    {
      cls: "col-span-2 row-span-3 md:col-span-7 md:row-span-2",
      render: () => (
        <Box className="flex flex-col justify-between p-5 text-white md:p-7" >
          <div className="absolute inset-0" style={{ background: props.primary }} />
          <div className="ifk-stripes absolute inset-y-0 right-0 w-1/3 opacity-15" />
          <p className="relative text-xs uppercase tracking-wider text-white/70">{props.signal}</p>
          <div className="relative">
            <p className="font-display text-3xl uppercase leading-none [overflow-wrap:anywhere] md:text-4xl">{props.slogan}</p>
            <p className="mt-2 max-w-md text-[13px] leading-snug text-white/75">{props.story}</p>
          </div>
        </Box>
      ),
    },
    p("tee", "row-span-2 md:col-span-4 md:row-span-4"),
    p("termos", "row-span-2 md:col-span-3 md:row-span-4", "md:pt-8"),
    p("hoodie", "row-span-2 md:col-span-4 md:row-span-3"),
    { cls: "col-span-2 md:col-span-4 row-span-6", render: () => <PhotoBox photo={photo("filt")} label={props.blanketLabel ?? "Filten i soffan"} pending={pending} /> },
    p("yeti", "row-span-2 md:col-span-4 md:row-span-3"),
    {
      cls: "row-span-2 md:col-span-4 md:row-span-3",
      inner: "md:pr-12",
      render: () => (
        <Box className="bg-white ring-1 ring-[#E8E8ED]">
          <img src={props.printUrl} alt="Trycket" className="h-full w-full object-contain p-6" />
          <p className="absolute bottom-4 left-5 text-[12px] font-medium">Trycket · 300 dpi</p>
        </Box>
      ),
    },
    p("kaffekopp", "row-span-2 md:col-span-4 md:row-span-3", "md:pl-12"),
    p("emaljmugg", "row-span-2 md:col-span-3 md:row-span-4"),
    p("keps", "row-span-2 md:col-span-3 md:row-span-4", "md:pt-10"),
    p("dricksglas", "row-span-2 md:col-span-3 md:row-span-4", "md:pb-10"),
    p("anteckningsbok", "row-span-2 md:col-span-3 md:row-span-4"),
    p("filt", "row-span-2 md:col-span-4 md:row-span-4", "md:pb-10"),
    p("powerbank", "row-span-2 md:col-span-4 md:row-span-4"),
    p("isskrapa", "row-span-2 md:col-span-4 md:row-span-4", "md:pt-10"),
  ];

  return (
    <div className="grid grid-flow-dense auto-rows-[84px] grid-cols-2 gap-4 md:grid-cols-12">
      {slots.map((s, i) => (
        <div key={i} className={`${s.cls} min-h-0`}>
          <div className={`h-full ${s.inner ?? ""}`}>{s.render()}</div>
        </div>
      ))}
    </div>
  );
}
