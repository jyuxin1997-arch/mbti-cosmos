// === Supabase 客户端单例 ===
(function() {
  var config = window.AppConfig;
  var instance = null;

  function getInstance() {
    if (instance) return instance;
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      console.warn('[Supabase] 未配置 SUPABASE_URL 或 SUPABASE_ANON_KEY，后端功能不可用');
      return null;
    }
    instance = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    return instance;
  }

  function isReady() {
    return !!(config.SUPABASE_URL && config.SUPABASE_ANON_KEY && getInstance());
  }

  window.SupabaseClient = { getInstance: getInstance, isReady: isReady };
})();
