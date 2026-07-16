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

// ---- Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) -----------------------
// La API legacy "fcm.googleapis.com/fcm/send" fue apagada por Google en 2024
// y de todas formas exigía un payload cifrado que antes nunca se generaba.
// Estas funciones implementan el protocolo Web Push real con Web Crypto,
// enviando cada mensaje directamente al `endpoint` propio de cada suscripción.

function base64UrlToBytes(b64url) {
  const padded = b64url + "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

async function hmacSha256(key, data) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

async function hkdfExpand16Bytes(prk, info, length) {
  return (await hmacSha256(prk, concatBytes([info, new Uint8Array([1])]))).slice(0, length);
}

// Cifra el payload según RFC 8291 usando las claves p256dh/auth del suscriptor.
async function encryptWebPushPayload(payloadBytes, p256dhB64, authB64) {
  const clientPublicKeyBytes = base64UrlToBytes(p256dhB64);
  const authSecret = base64UrlToBytes(authB64);

  const clientPublicKey = await crypto.subtle.importKey(
    "raw", clientPublicKeyBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const serverPublicKeyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: clientPublicKey }, serverKeyPair.privateKey, 256)
  );

  const authInfo = concatBytes([
    new TextEncoder().encode("WebPush: info"),
    new Uint8Array([0]),
    clientPublicKeyBytes,
    serverPublicKeyBytes,
  ]);

  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hkdfExpand16Bytes(prkKey, authInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);

  const cek = await hkdfExpand16Bytes(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand16Bytes(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const paddedPlaintext = concatBytes([payloadBytes, new Uint8Array([2])]); // delimitador de último registro

  const cekKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cekKey, paddedPlaintext)
  );

  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, 4096, false);
  const header = concatBytes([salt, rsBytes, new Uint8Array([serverPublicKeyBytes.length]), serverPublicKeyBytes]);

  return concatBytes([header, ciphertext]);
}

// Firma un JWT VAPID (RFC 8292) para autenticar el envío ante el push service.
async function buildVapidAuthHeader(endpoint, vapidPublicKeyB64, vapidPrivateKeyB64, subject) {
  const { origin } = new URL(endpoint);
  const encoder = new TextEncoder();

  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })));
  const unsigned = `${headerB64}.${payloadB64}`;

  const privateKeyBytes = base64UrlToBytes(vapidPrivateKeyB64);
  const publicKeyBytes = base64UrlToBytes(vapidPublicKeyB64);

  const signingKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      d: bytesToBase64Url(privateKeyBytes),
      x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, encoder.encode(unsigned))
  );

  return `vapid t=${unsigned}.${bytesToBase64Url(signature)}, k=${vapidPublicKeyB64}`;
}

async function sendWebPush(sub, payloadObj) {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
  const body = await encryptWebPushPayload(payloadBytes, sub.p256dh, sub.auth);
  const authHeader = await buildVapidAuthHeader(sub.endpoint, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, `mailto:${SMTP_USER}`);

  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
      "Authorization": authHeader,
    },
    body,
  });
}

async function deleteExpiredSubscription(endpoint) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
  } catch {}
}

function buildEmailHtml(id, titulo, resumen, label, fecha) {
  const logo       = `${SITE_URL}/Images/LOGO%20IMMUJEL.png`;
  const head       = `${SITE_URL}/Images/HEAD.svg`;
  const url        = `${SITE_URL}/NavBar's/publicacion.html?id=${id}`;
  const isSemanario = label === "Semanario Institucional";
  const badgeBg    = isSemanario ? "#0362CF,#4190EB" : "#A506AD,#F66EFD";
  const typeIcon   = isSemanario ? "&#128240;" : "&#128226;";

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${label} &#8211; IMMUJEL</title></head>
<body style="margin:0;padding:24px;background-color:#F0F5FF;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;">
<table align="center" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 40px rgba(165,6,173,0.12),0 4px 20px rgba(3,98,207,0.08);">

<div style="background:linear-gradient(135deg,#A506AD 0%,#0362CF 60%,#02162E 100%);padding:40px 20px 35px;text-align:center;">
<img src="${head}" alt="" style="display:block;width:140px;height:auto;margin:0 auto 10px;opacity:0.1;">
<img src="${logo}" alt="IMMUJEL" style="display:block;max-width:140px;height:auto;margin:-80px auto 0;position:relative;">
</div>

<div style="height:4px;background:linear-gradient(90deg,#F66EFD,#A506AD,#0362CF);"></div>

<div style="padding:44px 36px 36px;text-align:center;">
<div style="display:inline-block;background:linear-gradient(135deg,${badgeBg});color:#ffffff;padding:6px 18px;border-radius:50px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:24px;">${typeIcon} ${label}</div>
<h1 style="font-size:24px;font-weight:800;color:#02162E;margin:0 0 12px;letter-spacing:-0.3px;line-height:1.3;">${titulo}</h1>
<div style="width:50px;height:4px;background:linear-gradient(90deg,#A506AD,#0362CF);border-radius:2px;margin:0 auto 20px;"></div>
${resumen ? `<p style="font-size:15px;line-height:1.7;color:#4B5563;margin:0 0 24px;">${resumen}</p>` : ""}
<p style="font-size:13px;color:#9CA3AF;margin:0 0 28px;">Publicado el ${fecha}</p>
<a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#A506AD,#0362CF);color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:15px 38px;border-radius:50px;box-shadow:0 6px 20px rgba(165,6,173,0.3);">Leer publicaci&#xF3;n completa</a>
</div>

<div style="background:#FAFAFE;padding:20px 36px;border-top:1px solid rgba(165,6,173,0.06);">
<table width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="33%" style="text-align:center;padding:8px;font-size:12px;color:#6B7280;"><strong style="color:#A506AD;display:block;font-size:13px;margin-bottom:2px;">Gratuidad</strong>Todos nuestros servicios son gratuitos</td>
<td width="33%" style="text-align:center;padding:8px;font-size:12px;color:#6B7280;border-left:1px solid rgba(165,6,173,0.08);border-right:1px solid rgba(165,6,173,0.08);"><strong style="color:#0362CF;display:block;font-size:13px;margin-bottom:2px;">Confidencialidad</strong>Atenci&#xF3;n completamente privada</td>
<td width="33%" style="text-align:center;padding:8px;font-size:12px;color:#6B7280;"><strong style="color:#A506AD;display:block;font-size:13px;margin-bottom:2px;">Equidad</strong>Con perspectiva de g&#xE9;nero</td>
</tr></table>
</div>

<div style="background-color:#F5F0FF;padding:28px 24px;text-align:center;font-size:12px;color:#9CA3AF;border-top:1px solid rgba(165,6,173,0.08);">
<img src="${head}" alt="" style="max-width:80px;height:auto;margin-bottom:12px;opacity:0.25;">
<p style="margin:4px 0;color:#6B7280;font-weight:600;">Instituto Municipal de la Mujer de Lagunillas</p>
<p style="margin:4px 0;">Calle Vargas, esquina Calle Piar, Casa N. 218, Ciudad Ojeda, Edo. Zulia</p>
<div style="margin:14px 0;">
<a href="https://www.instagram.com/immujellags_/" style="color:#A506AD;text-decoration:none;font-weight:500;margin:0 10px;">Instagram</a>
<span style="color:#D1D5DB;">|</span>
<a href="https://api.whatsapp.com/send?phone=584246540241" style="color:#A506AD;text-decoration:none;font-weight:500;margin:0 10px;">WhatsApp</a>
<span style="color:#D1D5DB;">|</span>
<a href="https://www.facebook.com/profile.php?id=100094636431215" style="color:#A506AD;text-decoration:none;font-weight:500;margin:0 10px;">Facebook</a>
</div>
<p style="margin:8px 0 0;font-size:11px;color:#B0B7C3;">Recibiste este correo porque est&#xE1;s registrada en IMMUJEL.</p>
<p style="margin:4px 0 0;font-size:11px;color:#B0B7C3;">&#xA9; 2026 IMMUJEL &middot; Todos los derechos reservados</p>
</div>

</div>
</td></tr></table>
</body></html>`;
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
      results.push_debug = { subs_fetched: 0, subs_sent: 0, subs_expired: 0 };
      const subs = await fetchPushSubscriptions();
      results.push_debug.subs_fetched = subs.length;
      const payload = { titulo: label, cuerpo: titulo, url: `${SITE_URL}/NavBar's/publicacion.html?id=${id}` };
      for (const sub of subs) {
        try {
          const res = await sendWebPush(sub, payload);
          if (res.ok) {
            results.push++;
            results.push_debug.subs_sent++;
          } else if (res.status === 404 || res.status === 410) {
            await deleteExpiredSubscription(sub.endpoint);
            results.push_debug.subs_expired++;
          } else {
            results.push_debug.last_error = `${res.status} ${await res.text()}`;
          }
        } catch (e) {
          results.push_debug.last_error = e.message;
        }
      }
    }

    return json({ ok: true, ...results });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});