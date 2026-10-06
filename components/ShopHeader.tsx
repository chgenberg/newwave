export function ShopHeader({ clubName }: { clubName: string }) {
  return (
    <>
      <div className="bg-[#FFF4E5] py-1.5 text-center text-xs text-[#8A4B00]">Simulerad Intersport-klubbshop för demo – produkterna publiceras hit via API av klubbagenten</div>
      <header className="border-b border-[#E5E5EA] bg-white text-[#1D1D1F]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/intersport-logo.svg" alt="Intersport" className="h-[18px] w-auto" />
          <nav className="flex gap-6 text-sm text-[#3A3A3C]">
            <span>Dam</span>
            <span>Herr</span>
            <span>Barn</span>
            <span className="font-semibold text-[#164194]">Klubbshop</span>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 pt-4 text-xs text-[#6E6E73]">
        Start / Klubbshop / <span className="text-[#1D1D1F]">{clubName}</span>
      </div>
    </>
  );
}
