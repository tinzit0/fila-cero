(function(){
  const cfg = window.FC_CONFIG || {};
  const url = String(cfg.supabaseUrl || '').trim();
  const key = String(cfg.supabasePublishableKey || cfg.supabaseAnonKey || '').trim();

  if (!url || !key) {
    console.error('Fila Cero: faltan supabaseUrl o supabasePublishableKey en config.js');
    window.FC_SUPABASE = null;
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Fila Cero: no se pudo cargar @supabase/supabase-js.');
    window.FC_SUPABASE = null;
    return;
  }

  window.FC_SUPABASE = window.supabase.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
