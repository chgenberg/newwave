import { MerchStudio } from "@/components/MerchStudio";
import { CLUB_COPY } from "@/lib/copy";

export default function Home() {
  return <MerchStudio copy={CLUB_COPY} defaultClubId="ifk-goteborg" />;
}
