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
  const logo    = `${SITE_URL}/Images/LOGO%20IMMUJEL.png`;
  const head    = `${SITE_URL}/Images/HEAD.svg`;
  const url     = `${SITE_URL}/NavBar's/publicacion.html?id=${id}`;
  const isS     = label === "Semanario Institucional";
  const icon    = isS ? "&#128240;" : "&#128226;";
  const badgeBg = isS
    ? "background:linear-gradient(135deg,#A506AD,#4190EB)"
    : "background:linear-gradient(135deg,#0362CF,#4190EB)";

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${label} &#8211; IMMUJEL</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
  style="background:linear-gradient(135deg,#F5F0FF 0%,#F0F5FF 60%,#F8F0FF 100%);">
<tr><td align="center" style="padding:36px 16px 52px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- Logo sobre la tarjeta -->
<tr><td align="center" style="padding-bottom:20px;">
<a href="${SITE_URL}" style="text-decoration:none;">
<img src="${logo}" alt="IMMUJEL" width="130" style="display:block;width:130px;height:auto;margin:0 auto;">
</a>
</td></tr>

<!-- Tarjeta -->
<tr><td style="background:#ffffff;border-radius:24px;border-top:4px solid #A506AD;overflow:hidden;
               box-shadow:0 12px 40px rgba(165,6,173,0.11),0 2px 12px rgba(3,98,207,0.07);">

<!-- Barra tricolor -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:3px;background:linear-gradient(90deg,#F66EFD,#A506AD,#0362CF);font-size:0;line-height:0;">&nbsp;</td></tr>
</table>

<!-- Badge de tipo -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:30px 32px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
<tr><td align="center" style="${badgeBg};border-radius:50px;padding:7px 24px;">
<span style="color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.3px;white-space:nowrap;">
${icon}&nbsp; ${label}
</span>
</td></tr>
</table>
</td></tr>
</table>

<!-- Contenido -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:28px 44px 36px;">
<h1 style="font-size:22px;font-weight:800;color:#02162E;margin:0 0 16px;line-height:1.35;letter-spacing:-0.3px;text-align:center;">${titulo}</h1>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;">
<tr>
<td width="14" height="3" style="background:#F66EFD;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
<td width="6" style="font-size:0;">&nbsp;</td>
<td width="26" height="3" style="background:#A506AD;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
<td width="6" style="font-size:0;">&nbsp;</td>
<td width="14" height="3" style="background:#0362CF;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
</tr>
</table>
${resumen ? `<p style="font-size:15px;line-height:1.75;color:#4B5563;margin:0 0 6px;text-align:center;">${resumen}</p>` : ""}
<p style="font-size:12px;color:#9CA3AF;margin:16px 0 32px;text-transform:uppercase;letter-spacing:.6px;text-align:center;">Publicado el ${fecha}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
<tr><td align="center" style="background:linear-gradient(135deg,#A506AD,#0362CF);border-radius:50px;box-shadow:0 8px 24px rgba(165,6,173,0.28),0 2px 8px rgba(3,98,207,0.15);">
<a href="${url}" style="display:block;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:.3px;padding:14px 42px;border-radius:50px;white-space:nowrap;">Leer publicaci&#xF3;n completa &nbsp;&#8594;</a>
</td></tr>
</table>
</td></tr>
</table>

<!-- Divisor -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td width="32" style="font-size:0;">&nbsp;</td>
<td style="height:1px;background:linear-gradient(90deg,transparent,rgba(165,6,173,0.15) 30%,rgba(3,98,207,0.15) 70%,transparent);font-size:0;line-height:0;">&nbsp;</td>
<td width="32" style="font-size:0;">&nbsp;</td>
</tr>
</table>

<!-- Tres pilares -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFE;">
<tr>
<td width="33%" align="center" valign="top" style="padding:20px 12px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 10px;">
<tr><td width="36" height="36" align="center" valign="middle"
  style="width:36px;height:36px;border-radius:50%;background:rgba(165,6,173,0.08);border:1px solid rgba(165,6,173,0.18);font-size:15px;text-align:center;line-height:36px;">&#9878;&#65039;</td></tr>
</table>
<p style="color:#A506AD;font-size:12px;font-weight:700;margin:0 0 4px;text-align:center;">Gratuidad</p>
<p style="color:#6B7280;font-size:11px;line-height:1.5;margin:0;text-align:center;">Servicios sin costo<br>para todas las mujeres</p>
</td>
<td width="1" style="background:rgba(165,6,173,0.08);font-size:0;">&nbsp;</td>
<td width="33%" align="center" valign="top" style="padding:20px 12px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 10px;">
<tr><td width="36" height="36" align="center" valign="middle"
  style="width:36px;height:36px;border-radius:50%;background:rgba(3,98,207,0.08);border:1px solid rgba(3,98,207,0.18);font-size:15px;text-align:center;line-height:36px;">&#128274;</td></tr>
</table>
<p style="color:#0362CF;font-size:12px;font-weight:700;margin:0 0 4px;text-align:center;">Confidencialidad</p>
<p style="color:#6B7280;font-size:11px;line-height:1.5;margin:0;text-align:center;">Atenci&#xF3;n completamente<br>privada</p>
</td>
<td width="1" style="background:rgba(165,6,173,0.08);font-size:0;">&nbsp;</td>
<td width="33%" align="center" valign="top" style="padding:20px 12px 18px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 10px;">
<tr><td width="36" height="36" align="center" valign="middle"
  style="width:36px;height:36px;border-radius:50%;background:rgba(246,110,253,0.08);border:1px solid rgba(246,110,253,0.22);font-size:15px;text-align:center;line-height:36px;">&#9792;&#65039;</td></tr>
</table>
<p style="color:#A506AD;font-size:12px;font-weight:700;margin:0 0 4px;text-align:center;">Equidad</p>
<p style="color:#6B7280;font-size:11px;line-height:1.5;margin:0;text-align:center;">Con perspectiva<br>de g&#xE9;nero</p>
</td>
</tr>
</table>

<!-- Footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="border-top:1px solid rgba(165,6,173,0.08);background:#F7F0FF;">
<tr><td align="center" style="padding:26px 36px 28px;">
<img src="${head}" alt="" width="48" style="display:block;width:48px;height:auto;margin:0 auto 12px;opacity:0.18;">
<p style="font-size:13px;font-weight:700;color:#3B1C5A;margin:0 0 3px;text-align:center;">Instituto Municipal de la Mujer de Lagunillas</p>
<p style="font-size:11px;color:#9CA3AF;margin:0 0 16px;line-height:1.6;text-align:center;">Calle Vargas, esq. Calle Piar, Casa N.&#xB0; 218 &#xB7; Ciudad Ojeda, Edo. Zulia</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 16px;">
<tr>
<td align="center" style="padding:0 10px;"><a href="https://www.instagram.com/immujellags_/" style="color:#A506AD;text-decoration:none;font-size:12px;font-weight:600;">Instagram</a></td>
<td style="color:#D1D5DB;font-size:8px;">&#9679;</td>
<td align="center" style="padding:0 10px;"><a href="https://api.whatsapp.com/send?phone=584246540241" style="color:#A506AD;text-decoration:none;font-size:12px;font-weight:600;">WhatsApp</a></td>
<td style="color:#D1D5DB;font-size:8px;">&#9679;</td>
<td align="center" style="padding:0 10px;"><a href="https://www.facebook.com/profile.php?id=100094636431215" style="color:#A506AD;text-decoration:none;font-size:12px;font-weight:600;">Facebook</a></td>
</tr>
</table>
<p style="font-size:10px;color:#C4B5D4;margin:0 0 2px;text-align:center;">Recibiste este correo porque est&#xE1;s registrada en IMMUJEL.</p>
<p style="font-size:10px;color:#C4B5D4;margin:0;text-align:center;">&#xA9; 2026 IMMUJEL &#xB7; Todos los derechos reservados</p>
</td></tr>
</table>

</td></tr><!-- FIN TARJETA -->
</table><!-- FIN CONTENEDOR -->
</td></tr>
</table>
</body>
</html>`;
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
    const { record, old_record } = await req.json();
    if (!record?.publicado) return json({ ok: false });
    // Evitar duplicados: solo notificar cuando publicado pasa de false→true (no en ediciones de artículos ya publicados)
    if (old_record?.publicado === true) return json({ ok: false, reason: "already_published" });

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