import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/newwave/LoginScreen";
import { ACCESS_COOKIE, hasAccess, safeNext } from "@/lib/access";

export const metadata: Metadata = { title: "Logga in · Next Wave Production", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ till?: string }> }) {
  const next = safeNext((await searchParams).till);
  if (await hasAccess((await cookies()).get(ACCESS_COOKIE)?.value)) redirect(next);

  return <LoginScreen title="Välkommen" text="Demot är privat. Ange lösenordet du fått för att se filmen och prova själv." next={next} />;
}
