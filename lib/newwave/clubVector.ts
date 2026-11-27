/**
 * Klubbmärkena som vektor: hur det gick när registrets märken ritades om (scripts/club-logos-vector.ts). Varje klubb i
 * registret hamnar i en grupp; ordningen här är ordningen på klubbregistrets sida, med de godkända överst.
 */
export const VECTOR_KINDS = ["godkand", "egen", "avvek", "granskning", "ritas", "liten", "felbild", "vantar", "ovrigt"] as const;
export type VectorKind = (typeof VECTOR_KINDS)[number];

/** `m` andelen av märket som skiljer sig från originalet, `n` antalet färger, `at` när vektorn ritades. */
export type VectorStatus = { k: VectorKind; m?: number; n?: number; at?: string };

export const VECTOR_LABEL: Record<VectorKind, { title: string; text: string }> = {
  godkand: { title: "Godkända som vektor", text: "Omritade som vektor och godkända i båda kontrollerna: avvikelsen mot originalet och bildgranskningen. Går att trycka i alla storlekar." },
  egen: { title: "Vektor från klubben", text: "Klubben har själv märket som vektor på sin webbplats. Inte omritade, och inte granskade som de omritade." },
  avvek: { title: "Avvek mer än 6 %", text: "Omritningen skilde sig från originalet i mer än 6 % av märkets yta. Behöver en större eller skarpare källbild." },
  granskning: { title: "Underkända i granskningen", text: "Låg avvikelse, men bildgranskningen hittade fel: förvrängd eller oläslig text, saknade delar, fläckar eller hål." },
  ritas: { title: "Gick inte att rita om", text: "För många små detaljer, foton eller toningar för att ritas om som vektor. Behöver klubbens egen fil." },
  liten: { title: "För liten bild", text: "Den största bild som gick att hitta är under 160 bildpunkter. Behöver en större bild från klubben." },
  felbild: { title: "Fel bild i registret", text: "Registrets bild är inte klubbens märke – en sponsor, ett företag eller en annan klubbs märke. Märket måste hämtas om." },
  vantar: { title: "Sajten svarade inte", text: "Klubbens webbplats svarade inte när märket skulle hämtas. Körs om." },
  ovrigt: { title: "Inte omritade än", text: "Har inte gått igenom omritningen." },
};

export const vectorRank = (k?: VectorKind) => (k ? VECTOR_KINDS.indexOf(k) : VECTOR_KINDS.length);

/** Den godkända vektorn: som bild för korten och som SVG att ladda ner. `at` gör att en ny omritning slår igenom. */
export const vectorAsset = (id: string, at: string | undefined, file: "vektor.png" | "vektor.svg") => `/api/v1/newwave/registry/${id}/${file}?v=${encodeURIComponent(at ?? "")}`;
