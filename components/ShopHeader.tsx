export function ShopHeader({ clubName }: { clubName: string }) {
  return (
    <>
      <div className="bg-[#FFF4E5] py-1.5 text-center text-xs text-[#8A4B00]">Simulerad Intersport-klubbshop för demo – produkterna publiceras hit via API av klubbagenten</div>
      <header className="bg-[#0A2A6B] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="text-2xl font-black italic tracking-tight">
            INTERSPORT<span className="text-[#E30613]">.</span>
          </span>
          <nav className="flex gap-6 text-sm text-white/80">
            <span>Dam</span>
            <span>Herr</span>
            <span>Barn</span>
            <span className="font-semibold text-white">Klubbshop</span>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 pt-4 text-xs text-[#6E6E73]">
        Start / Klubbshop / <span className="text-[#1D1D1F]">{clubName}</span>
      </div>
    </>
  );
}
