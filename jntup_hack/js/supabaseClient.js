/**
 * ResQ-AI — Supabase Client
 * Initialises the Supabase client singleton from config.js.
 * Falls back gracefully if credentials are missing.
 */
'use strict';

const SupabaseClient = (() => {
  let _client = null;
  let _ready  = false;

  function init() {
    const cfg = window.RESQ_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      console.warn('[ResQ-AI] Supabase credentials missing in config.js — running in local-only mode.');
      return;
    }

    try {
      // supabase global is loaded from CDN: @supabase/supabase-js v2
      const { createClient } = window.supabase;
      _client = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { 'X-App-Name': 'ResQ-AI' } },
      });
      _ready = true;
      console.log('[ResQ-AI] Supabase connected →', cfg.SUPABASE_URL);
    } catch (e) {
      console.error('[ResQ-AI] Supabase init failed:', e);
    }
  }

  function get()     { return _client; }
  function isReady() { return _ready; }

  return { init, get, isReady };
})();

window.SupabaseClient = SupabaseClient;
