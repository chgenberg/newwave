import { cookies } from "next/headers";
import { LANG_COOKIE, parseLang } from "@/lib/newwave/sportshop/i18n";

/** Butikens språk från cookien; tyska om inget är valt. */
export async function shopLang() {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}
