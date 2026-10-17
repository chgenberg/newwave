export type MailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

/** `contentId` bäddar in bilden i mejlet, så att den syns via `cid:` utan att hämtas från servern. */
export type MailAttachment = { filename: string; content: Buffer; contentId?: string };

export type Mail = { from: string; to: string; subject: string; text: string; html?: string; bcc?: string; attachments?: MailAttachment[] };

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Skickar via Resends REST-API; utan RESEND_API_KEY skickas inget och anroparen säger det. */
export async function sendMail(m: Mail): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        from: m.from,
        to: [m.to],
        ...(m.bcc ? { bcc: [m.bcc] } : {}),
        subject: m.subject,
        text: m.text,
        ...(m.html ? { html: m.html } : {}),
        ...(m.attachments?.length
          ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64"), ...(a.contentId ? { content_id: a.contentId } : {}) })) }
          : {}),
      }),
    });
    return res.ok ? { sent: true } : { sent: false, reason: "failed" };
  } catch {
    return { sent: false, reason: "failed" };
  }
}
