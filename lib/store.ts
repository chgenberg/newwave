import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DIR = path.join(process.cwd(), ".data", "files");
const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  json: "application/json",
  mp4: "video/mp4",
  webm: "video/webm",
};

export async function saveFile(data: Buffer | string, ext: keyof typeof TYPES) {
  await mkdir(DIR, { recursive: true });
  const id = `${randomUUID()}.${ext}`;
  await writeFile(path.join(DIR, id), data);
  return { id, url: `/api/v1/files/${id}` };
}

export async function loadFile(id: string) {
  if (!/^[0-9a-f-]{36}\.(png|jpg|svg|json|mp4|webm)$/.test(id)) return null;
  try {
    const data = await readFile(path.join(DIR, id));
    return { data, type: TYPES[id.split(".").pop()!] };
  } catch {
    return null;
  }
}
