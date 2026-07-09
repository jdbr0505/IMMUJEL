const SUPABASE_URL = Deno.env.get("MY_SUPABASE_URL");
const SUPABASE_KEY = Deno.env.get("MY_SUPABASE_KEY");
const SMTP_USER = Deno.env.get("SMTP_USER");
const SMTP_PASS = Deno.env.get("SMTP_PASS");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");

if (!SUPABASE_URL || !SUPABASE_KEY || !SMTP_USER || !SMTP_PASS) {
  Deno.serve(() => new Response(JSON.stringify({ error: "Missing required env vars" }), { status: 500 }));
  throw new Error("Missing required environment variables");
}

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SITE_URL = "https://immujel.vercel.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function b64(s) { return btoa(unescape(encodeURIComponent(s))); }

function buildEmailHtml(id, titulo, resumen, label, fecha) {
  const logo = `${SITE_URL}/Images/LOGO%20IMMUJEL.png`;
  return [
    '<table cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background-color:rgba(255,255,255,0.92);border-top:4px solid #A506AD;border-radius:12px;overflow:hidden;box-shadow:0 15px 30px rgba(165,6,173,0.08);">',
    '<tr><td style="padding:30px 20px;text-align:center;">',
    `<img src="${logo}" alt="IMMUJEL" style="height:70px;margin-bottom:10px;">`,
    `<h1 style="color:#A506AD;margin:10px 0 0;font-size:22px;font-weight:600;">${label}</h1>`,
    "</td></tr>",
    '<tr><td style="padding:30px 25px;">',
    `<h2 style="color:#A506AD;margin:0 0 10px;font-size:20px;">${titulo}</h2>`,
    resumen ? `<p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 15px;">${resumen}</p>` : "",
    `<p style="color:#999;font-size:13px;margin:0 0 20px;">${fecha}</p>`,
    `<a href="${SITE_URL}/NavBar's/publicacion.html?id=${id}"`,
    ' style="display:inline-block;background:linear-gradient(135deg,#A506AD,#0362CF);color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">',
    "Leer m&aacute;s</a>",
    "</td></tr>",
    '<tr><td style="background:#f5f5f5;padding:15px 25px;text-align:center;font-size:12px;color:#888;">',
    "IMMUJEL &mdash; Instituto Municipal de la Mujer de Lagunillas",
    "</td></tr>",
    "</table>",
  ].join("\r\n");
}

function makeMime(to, subject, html) {
  return [
    `From: IMMUJEL <${SMTP_USER}>`, `To: ${to}`, `Subject: ${subject}`,
    "MIME-Version: 1.0", "Content-Type: text/html; charset=UTF-8", "", html,
  ].join("\r\n");
}

async function smtpCmd(writer, encoder, line) {
  await writer.write(encoder.encode(line + "\r\n"));
}

async function fetchUsers() {
  let all = [], offset = 0, limit = 1000;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/perfiles?select=email&not.is.email.null&limit=${limit}&offset=${offset}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const batch = await res.json();
    if (!batch || !batch.length) break;
    all = all.concat(batch);
    offset += limit;
  }
  return all;
}

async function fetchPushSubscriptions() {
  let all = [], offset = 0, limit = 1000;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,auth,p256dh&limit=${limit}&offset=${offset}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const batch = await res.json();
    if (!batch || !batch.length) break;
    all = all.concat(batch);
    offset += limit;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 200);
  try {
    const { record } = await req.json();
    if (!record?.publicado) return json({ ok: false });

    const { id, titulo, resumen, tipo, fecha_publicacion } = record;
    const label = tipo === "semanario" ? "Semanario Institucional" : "Noticiero";
    const fecha = fecha_publicacion || new Date().toLocaleDateString("es-VE");
    const subject = `Nuevo ${label}: ${titulo}`;
    const results = { smtp: 0, push: 0 };

    try {
      const users = await fetchUsers();
      results.smtp_debug = { users_fetched: users?.length || 0, users_sent: 0 };
      if (users?.length) {
        const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
        const writer = conn.writable.getWriter();
        const reader = conn.readable.getReader();
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        async function readln() {
          let buf = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value);
            if (buf.includes("\r\n") || buf.endsWith("\n")) break;
          }
          return buf.trim();
        }
        await readln();
        await smtpCmd(writer, enc, "EHLO immujel"); await readln();
        await smtpCmd(writer, enc, "AUTH LOGIN"); await readln();
        await smtpCmd(writer, enc, b64(SMTP_USER)); await readln();
        await smtpCmd(writer, enc, b64(SMTP_PASS));
        const authResp = await readln();
        if (authResp.includes("535")) { conn.close(); results.smtp_error = "SMTP auth failed"; }
        else {
          for (const u of users) {
            if (!u.email) continue;
            try {
              await smtpCmd(writer, enc, `MAIL FROM:<${SMTP_USER}>`); await readln();
              await smtpCmd(writer, enc, `RCPT TO:<${u.email}>`); await readln();
              await smtpCmd(writer, enc, "DATA"); await readln();
              await smtpCmd(writer, enc, makeMime(u.email, subject, buildEmailHtml(id, titulo, resumen, label, fecha)));
              await smtpCmd(writer, enc, "."); await readln();
              results.smtp++;
              results.smtp_debug.users_sent++;
            } catch {}
          }
          await smtpCmd(writer, enc, "QUIT");
        }
        conn.close();
      }
    } catch (smtpErr) { results.smtp_error = smtpErr.message; }

    if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      results.push_debug = { subs_fetched: 0, subs_sent: 0 };
      const subs = await fetchPushSubscriptions();
      results.push_debug.subs_fetched = subs.length;
      for (const sub of subs) {
        try {
          const p256dh = Uint8Array.from(atob(sub.p256dh), c => c.charCodeAt(0));
          const auth = Uint8Array.from(atob(sub.auth), c => c.charCodeAt(0));
          const payload = JSON.stringify({ titulo: label, cuerpo: titulo, url: `${SITE_URL}/NavBar's/publicacion.html?id=${id}` });
          const res = await fetch("https://fcm.googleapis.com/fcm/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `key=${VAPID_PUBLIC_KEY}`,
            },
            body: JSON.stringify({
              to: sub.endpoint,
              data: { titulo: label, cuerpo: titulo, url: `${SITE_URL}/NavBar's/publicacion.html?id=${id}` },
              notification: { title: label, body: titulo, icon: "/Images/LOGO IMMUJEL.png" },
            }),
          });
          if (res.ok) { results.push++; results.push_debug.subs_sent++; }
        } catch {}
      }
    }

    return json({ ok: true, ...results });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});