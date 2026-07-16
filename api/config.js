// Las URLs/keys de Supabase deben ser ASCII puro: se usan como valores de
// headers HTTP (apikey, Authorization) y el navegador rechaza cualquier
// carácter fuera de ISO-8859-1 con "Failed to read the 'headers' property
// from 'RequestInit'". Un copy/paste desde Slack/Word/Notion puede colar
// comillas tipográficas o espacios invisibles en la variable de entorno.
function sanitize(value) {
  return (value || '').replace(/[^\x20-\x7E]/g, '').trim();
}

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.json({
    url: sanitize(process.env.SUPABASE_URL),
    anonKey: sanitize(process.env.SUPABASE_ANON_KEY),
  });
};
