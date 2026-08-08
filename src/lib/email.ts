import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM ?? "ClearToWork <alerts@example.com>";

let client: Resend | null = null;

function resend() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    // Local/dev without a key: log instead of sending.
    console.log(`[email:dry-run] to=${opts.to} subject=${opts.subject}`);
    return { id: "dry-run" };
  }
  const { data, error } = await resend().emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data!;
}
