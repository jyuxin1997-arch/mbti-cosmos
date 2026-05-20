// === 实时赛况数据服务 ===
(function() {
  var config = window.AppConfig;
  var pollTimer = null;

  function getCached() {
    try {
      var raw = localStorage.getItem(config.CACHE_KEY_LIVE);
      if (!raw) return null;
      var cache = JSON.parse(raw);
      // 检查是否过期
      if (Date.now() - cache.timestamp > config.API_CACHE_TTL) {
        return cache.stale ? cache : null; // stale 数据可用但不新鲜
      }
      return cache;
    } catch(e) { return null; }
  }

  function setCached(data, stale) {
    var cache = { data: data, timestamp: Date.now(), stale: !!stale };
    localStorage.setItem(config.CACHE_KEY_LIVE, JSON.stringify(cache));
  }

  async function fetchFromAPI() {
    var token = config.FOOTBALL_API_TOKEN;
    if (!token) {
      console.warn('[LiveData] FOOTBALL_API_TOKEN 未配置，无法获取实时数据');
      return null;
    }

    try {
      var resp = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
        headers: { 'X-Auth-Token': token }
      });
      if (!resp.ok) throw new Error('API 返回 ' + resp.status);
      var data = await resp.json();
      setCached(data, false);
      return data;
    } catch(e) {
      console.error('[LiveData] API 请求失败:', e);
      // 尝试使用过期缓存
      var cached = getCached();
      if (cached) {
        setCached(cached.data, true);
        return cached.data;
      }
      return null;
    }
  }

  async function getLiveMatches() {
    var cached = getCached();
    if (cached && !cached.stale) return cached.data;
    return await fetchFromAPI();
  }

  function startPolling(interval) {
    if (pollTimer) clearInterval(pollTimer);
    // 立即执行一次
    fetchFromAPI().then(function(data) {
      if (data && window.LiveApp && window.LiveApp.renderLiveData) {
        window.LiveApp.renderLiveData(data);
      }
    });
    // 定时轮询
    pollTimer = setInterval(async function() {
      var data = await fetchFromAPI();
      if (data && window.LiveApp && window.LiveApp.renderLiveData) {
        window.LiveApp.renderLiveData(data);
      }
    }, interval || config.API_POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  window.LiveDataService = {
    getLiveMatches: getLiveMatches,
    fetchFromAPI: fetchFromAPI,
    getCached: getCached,
    setCached: setCached,
    startPolling: startPolling,
    stopPolling: stopPolling
  };
})();
