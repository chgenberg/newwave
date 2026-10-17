import { StudioHome } from "@/components/newwave/home/StudioHome";
import { HubFooter } from "@/components/newwave/HubFooter";
import { HeroFilm } from "@/components/newwave/landing/HeroFilm";
import { HERO_VIDEO } from "@/lib/newwave/hub";

export default function NewWaveHome() {
  return (
    <>
      <main>
        <HeroFilm
          src={HERO_VIDEO.src}
          poster={HERO_VIDEO.poster}
          title="Next Wave Studio"
          next="#studio"
        />
        <section
          id="studio"
          aria-label="Designstudio"
          className="scroll-mt-0 bg-[#E9E9E5] p-2 min-[900px]:p-6"
        >
          <div className="mx-auto max-w-[1680px]">
            <StudioHome />
          </div>
        </section>
      </main>
      <HubFooter />
    </>
  );
}
