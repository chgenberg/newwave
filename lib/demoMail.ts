import { sek } from "./demoCatalog";
import { eventOf } from "./demoEvents";
import { type QuoteDoc, quotePdf } from "./demoPdf";
import { type MailResult, mailConfigured, sendMail } from "./mail";

/** Mejlar offerten som PDF; utan RESEND_API_KEY skickas inget och anroparen säger det. */
export async function sendQuoteMail(q: QuoteDoc): Promise<MailResult> {
  if (!mailConfigured()) return { sent: false, reason: "not_configured" };
  const pdf = await quotePdf(q).catch(() => null);
  if (!pdf) return { sent: false, reason: "failed" };
  return sendMail({
    from: process.env.DEMO_MAIL_FROM || "Offertförslag <onboarding@resend.dev>",
    to: q.contact.email,
    bcc: process.env.DEMO_MAIL_BCC,
    subject: `Er offert ${q.reference} – ${eventOf(q.eventId ?? q.event).title.toLowerCase()} för ${q.brand.name}`,
    text: [
      `Hej${q.contact.name ? ` ${q.contact.name}` : ""}!`,
      "",
      `Tack för er förfrågan. Offerten för ${q.brand.name} (${sek(q.totalSek)} exkl. moms) finns bifogad som PDF.`,
      "Er säljare återkommer inom 1 arbetsdag med korrektur och bekräftat leveransdatum.",
      "",
      "Korrektur innan tryck · Fast leveransdatum · Ändra fritt fram till korrektur",
    ].join("\n"),
    attachments: [{ filename: `Offert-${q.reference}.pdf`, content: pdf }],
  });
}
