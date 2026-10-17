// ActionRegister: sends one queued email (a new row in public.ar_outbox) through Microsoft 365 (Microsoft Graph).
//
// Called by a Supabase Database Webhook on INSERT into public.ar_outbox (see SETUP.md). The database writes the
// rows: assignment and extension emails when projects are saved, and the 8:00 daily reminder digests.
//
// It uses the same Edge Function secrets as Flexo Todo's notify-email (they're shared by every function in the
// project), so nothing new needs adding: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MAIL_FROM, WEBHOOK_SECRET.

type OutboxRow = { id: number; to_email: string; subject: string; body: string };

const env = (name: string, fallback = "") => Deno.env.get(name) ?? fallback;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// The database writes plain text ending in "Open it here: <link>"; turn that line into a button.
function toHtml(body: string) {
  const m = body.match(/\n*(?:Open it here|Approve or decline it here): (\S+)\s*$/);
  const text = m ? body.slice(0, m.index) : body;
  const link = m ? m[1] : "";
  return `
  <div style="font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#15223B">
    <div style="background:#1C3F73;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:700">ActionRegister</div>
    <div style="border:1px solid #D5DBE5;border-top:none;border-radius:0 0 8px 8px;padding:18px">
      <div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</div>
      ${link ? `<p style="margin:18px 0 0"><a href="${escapeHtml(link)}"
         style="background:#1C3F73;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;display:inline-block">Open ActionRegister</a></p>` : ""}
    </div>
  </div>`;
}

// App-only access token for Microsoft Graph, reused until shortly before it expires.
let cachedToken: { value: string; expires: number } | null = null;
async function graphToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch(`https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("MS_CLIENT_ID"),
      client_secret: env("MS_CLIENT_SECRET"),
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Microsoft sign-in failed: ${data.error_description || data.error || res.status}`);
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function sendMail(to: string, subject: string, html: string) {
  const from = env("MAIL_FROM");
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: true,
    }),
  });
  if (res.status !== 202) {
    const text = await res.text();
    throw new Error(`Microsoft 365 refused to send (${res.status}): ${text.slice(0, 400)}`);
  }
}

Deno.serve(async (req) => {
  // Only the database webhook (which knows the shared secret) may trigger emails.
  const secret = env("WEBHOOK_SECRET");
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  let payload: { type?: string; table?: string; record?: OutboxRow };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const row = payload.record;
  if (payload.type !== "INSERT" || payload.table !== "ar_outbox" || !row || !row.to_email) {
    return new Response("Skipped", { status: 200 });
  }
  if (/\.(local|test)$/i.test(row.to_email)) return new Response("Skipped (test address)", { status: 200 });
  try {
    await sendMail(row.to_email, row.subject, toHtml(row.body));
    return new Response("Sent", { status: 200 });
  } catch (err) {
    console.error("Email failed:", err);
    return new Response("Email failed: " + (err instanceof Error ? err.message : String(err)), { status: 502 });
  }
});
