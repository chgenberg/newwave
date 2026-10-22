/** Klubbmärke och bild som skrapningen sparat för en klubb i klubbregistret; `at` gör att en ny hämtning slår igenom. */
export const registryAsset = (id: string, at: string | undefined, file: "logo.png" | "bild.jpg") => `/api/v1/newwave/registry/${id}/${file}?v=${encodeURIComponent(at ?? "")}`;
