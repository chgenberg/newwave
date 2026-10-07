import { sek } from "./demoCatalog";
import { eventOf } from "./demoEvents";
import { type QuoteDoc, quotePdf } from "./demoPdf";

export type MailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Sends the quote PDF via Resend's REST API; without RESEND_API_KEY nothing is sent and the caller says so. */
export async function sendQuoteMail(q: QuoteDoc): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not_configured" };
  try {
    const pdf = await quotePdf(q);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from: process.env.DEMO_MAIL_FROM || "Offertförslag <onboarding@resend.dev>",
        to: [q.contact.email],
        ...(process.env.DEMO_MAIL_BCC ? { bcc: [process.env.DEMO_MAIL_BCC] } : {}),
        subject: `Er offert ${q.reference} – ${eventOf(q.eventId ?? q.event).title.toLowerCase()} för ${q.brand.name}`,
        text: [
          `Hej${q.contact.name ? ` ${q.contact.name}` : ""}!`,
          "",
          `Tack för er förfrågan. Offerten för ${q.brand.name} (${sek(q.totalSek)} exkl. moms) finns bifogad som PDF.`,
          "Er säljare återkommer inom 1 arbetsdag med korrektur och bekräftat leveransdatum.",
          "",
          "Korrektur innan tryck · Fast leveransdatum · Ändra fritt fram till korrektur",
        ].join("\n"),
        attachments: [{ filename: `Offert-${q.reference}.pdf`, content: pdf.toString("base64") }],
      }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}
