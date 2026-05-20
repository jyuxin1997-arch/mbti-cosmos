// === 全局配置 ===
window.AppConfig = {
  SUPABASE_URL: '',  // 用户在 Supabase 控制台创建后填入
  SUPABASE_ANON_KEY: '',  // 用户在 Supabase 控制台创建后填入
  FOOTBALL_API_TOKEN: '',  // 用户在 football-data.org 注册后填入
  SITE_URL: 'https://jyuxin1997-arch.github.io/mbti-cosmos/',
  API_POLL_INTERVAL: 300000, // 5分钟轮询
  API_CACHE_TTL: 300000,    // 5分钟缓存
  CACHE_KEY_LIVE: 'wc_live_cache',
  CACHE_KEY_USER: 'wc_user',
  POSTS_PER_PAGE: 20,
  MATCH_KEY_SEPARATOR: '_vs_'
};
