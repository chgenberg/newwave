import { z } from "zod";

export const ConceptSchema = z.object({
  id: z.string(),
  signal: z.string(),
  mode: z.enum(["standard", "satir"]).default("standard"),
  title: z.string(),
  slogan: z.string(),
  story: z.string(),
  style: z.string(),
  artDirection: z.string(),
  palette: z.array(z.string()),
  products: z.array(z.string()),
});

export const SignalSchema = z.object({
  id: z.string(),
  kind: z.enum(["occasion", "season", "trend", "news", "custom", "match", "club", "social", "podcast", "search", "weather"]),
  title: z.string().min(2).max(120),
  detail: z.string().max(600),
  date: z.string().optional(),
  daysUntil: z.number().optional(),
  source: z.object({ name: z.string(), url: z.string(), published: z.string() }).optional(),
});

export const fileUrl = z.string().regex(/^\/api\/v1\/files\/[0-9a-f-]{36}\.(png|svg|jpg|json|mp4|webm)$/);
