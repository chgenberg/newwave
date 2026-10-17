export async function call<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Fel ${res.status}`);
  return json as T;
}

/** Laddar upp en bild från studion och ger tillbaka fil-URL:en, så att bara länken sparas. */
export async function upload(dataUrl: string) {
  const { url } = await call<{ url?: string }>("/api/v1/files", { dataUrl });
  if (!url) throw new Error("Kunde inte spara bilden.");
  return url;
}

export const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Kunde inte läsa filen"));
    r.readAsDataURL(file);
  });
