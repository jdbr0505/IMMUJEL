/**
 * setup-leyes.ts – Crea el bucket "leyes" en Supabase Storage y sube los PDFs.
 *
 * Uso:
 *   $env:SUPABASE_SERVICE_KEY="eyJ..."   (PowerShell)
 *   deno run --allow-net --allow-read --allow-env scripts/setup-leyes.ts ./pdfs
 *
 * Los PDFs deben estar en la carpeta indicada con exactamente estos nombres:
 *   crbv-1999.pdf
 *   ley-vida-libre-violencia.pdf
 *   lopnna.pdf
 *   codigo-penal.pdf
 *   ley-igualdad-oportunidades.pdf
 *   ley-proteccion-familias.pdf
 *   ley-consejos-comunales.pdf
 *   cedaw.pdf
 *   belem-do-para.pdf
 *   ordenanza-immujel.pdf
 */

const SUPABASE_URL = "https://vhgfyqodiieblhfwbama.supabase.co";
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
const PDF_DIR      = Deno.args[0] ?? "./pdfs";

const EXPECTED = [
  "crbv-1999.pdf",
  "ley-vida-libre-violencia.pdf",
  "lopnna.pdf",
  "codigo-penal.pdf",
  "ley-igualdad-oportunidades.pdf",
  "ley-proteccion-familias.pdf",
  "ley-consejos-comunales.pdf",
  "cedaw.pdf",
  "belem-do-para.pdf",
  "ordenanza-immujel.pdf",
];

if (!SERVICE_KEY) {
  console.error("❌  Falta la variable SUPABASE_SERVICE_KEY.");
  console.error("   Obtén la service_role key en:");
  console.error("   Supabase Dashboard → Settings → API → service_role\n");
  Deno.exit(1);
}

const headers = {
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

// ── 1. Crear bucket "leyes" (público) ─────────────────────────────────────────
console.log("\n📦  Creando bucket \"leyes\"...");
const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ id: "leyes", name: "leyes", public: true }),
});
const bucketBody = await bucketRes.json();

if (bucketRes.ok) {
  console.log("✅  Bucket \"leyes\" creado correctamente.");
} else if (bucketBody?.error === "Duplicate" || bucketBody?.message?.includes("already exists")) {
  console.log("ℹ️   El bucket \"leyes\" ya existía — continuando.");
} else {
  console.error("❌  No se pudo crear el bucket:", JSON.stringify(bucketBody));
  Deno.exit(1);
}

// ── 2. Subir PDFs ──────────────────────────────────────────────────────────────
console.log(`\n📂  Leyendo PDFs desde: ${PDF_DIR}\n`);

let ok = 0, skipped = 0, failed = 0;

for (const name of EXPECTED) {
  const path = `${PDF_DIR}/${name}`;

  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(path);
  } catch {
    console.warn(`⚠️   No encontrado (omitido): ${name}`);
    skipped++;
    continue;
  }

  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/leyes/${name}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
      body: bytes,
    }
  );

  if (uploadRes.ok) {
    console.log(`✅  Subido: ${name}`);
    ok++;
  } else {
    const err = await uploadRes.json().catch(() => ({}));
    console.error(`❌  Error al subir ${name}:`, JSON.stringify(err));
    failed++;
  }
}

// ── 3. Resumen ─────────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────");
console.log(`Resultado: ${ok} subidos · ${skipped} omitidos · ${failed} con error`);
if (ok > 0) {
  console.log("\n🌐  Los PDFs ya son accesibles en:");
  console.log(`   ${SUPABASE_URL}/storage/v1/object/public/leyes/<nombre>.pdf`);
}
console.log("─────────────────────────────────────\n");
