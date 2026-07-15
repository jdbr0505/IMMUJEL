module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.json({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  });
};
