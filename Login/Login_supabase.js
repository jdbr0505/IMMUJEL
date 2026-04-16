// Login_supabase.js
const supabaseUrl = 'https://vhgfyqodiieblhfwbama.supabase.co'; // Tu URL
const supabaseAnonKey = 'sb_publishable_UeGzzEedQ6XNCQCxzANvKw_JgYYV1QS'; // Tu anon key

window.supabase = supabase.createClient(supabaseUrl, supabaseAnonKey);