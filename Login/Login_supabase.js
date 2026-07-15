// Login_supabase.js
window.supabaseReady = fetch('/api/config')
  .then(function(r) { return r.json(); })
  .then(function(cfg) {
    window.supabase = supabase.createClient(cfg.url, cfg.anonKey);
    return window.supabase;
  });
