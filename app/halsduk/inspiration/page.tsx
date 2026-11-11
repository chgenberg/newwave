import type { Metadata } from "next";
import { ScarfBank } from "@/components/ScarfBank";
import { SCARF_BANK } from "@/lib/scarfBank";

export const metadata: Metadata = { title: "Inspirationsbanken – stickade halsdukar för tjugo klubbar" };

export default function ScarfBankPage() {
  return <ScarfBank bank={SCARF_BANK} />;
}
