// === 实时赛况模块（live.html 专属） ===
(function() {
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;

  var teams = [];
  var fixtures = [];
  var feedItems = [];

  // ========== DATA LOADING ==========
  async function loadData() {
    var tryFetch = async function(path, fallback) {
      try {
        var r = await fetch(path);
        if (!r.ok) throw new Error();
        return await r.json();
      } catch(e) { return fallback; }
    };
    teams = await tryFetch('data/teams.json', []);
    fixtures = await tryFetch('data/fixtures.json', []);
    feedItems = await tryFetch('data/feed.json', []);
    renderFixtures();
    renderFeed();
  }

  // ========== RENDER ==========
  function renderFixtures() {
    if (!fixtures.length) { $('fixtureList').innerHTML = "<p style='color:var(--muted);font-size:13px'>暂无赛程数据</p>"; return; }
    $('fixtureList').innerHTML = fixtures.map(function(f) {
      var d = new Date(f.date);
      var dateStr = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      var timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return '<div class="fixture-card"><div><div style="font-size:13px;font-weight:500">' + f.home + ' VS ' + f.away + '</div><div style="font-size:11px;color:var(--muted)">' + f.city + ' · ' + f.group + '组</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:600">' + dateStr + '</div><div style="font-size:11px;color:var(--muted)">' + timeStr + '</div></div></div>';
    }).join('');
  }

  function renderFeed() {
    if (!feedItems.length) { $('feedList').innerHTML = "<p style='color:var(--muted);font-size:13px'>暂无资讯</p>"; return; }
    $('feedList').innerHTML = feedItems.map(function(f) {
      return '<div class="feed-item">'
        + '<div class="feed-tag">' + f.tag + '</div>'
        + '<div class="feed-title">' + f.title + '</div>'
        + '<div class="feed-text">' + f.text + '</div>'
        + '</div>';
    }).join('');
    $('lastUpdate').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * 渲染实时比赛数据（供 LiveDataService 回调）
   */
  function renderLiveData(data) {
    if (!data || !data.matches || !data.matches.length) return;
    var liveHtml = data.matches.map(function(m) {
      var home = m.homeTeam.shortName || m.homeTeam.name;
      var away = m.awayTeam.shortName || m.awayTeam.name;
      var score = m.score.fullTime || m.score.halfTime || { home: '-', away: '-' };
      var minute = m.minute || '--';
      return '<div class="fixture-card" style="border-left:3px solid var(--red)"><div><div style="font-size:13px;font-weight:500">' + home + ' ' + score.home + ' - ' + score.away + ' ' + away + '</div><div style="font-size:11px;color:var(--red)">⏱ ' + minute + "'</div></div></div>";
    }).join('');
    // 重新构建 feedList：实时比赛 + 原有资讯
    var existingFeed = feedItems.map(function(f) {
      return '<div class="feed-item"><div class="feed-tag">' + f.tag + '</div><div class="feed-title">' + f.title + '</div><div class="feed-text">' + f.text + '</div></div>';
    }).join('');
    $('feedList').innerHTML = '<div style="margin-bottom:12px"><div class="feed-tag" style="color:var(--red)">实时比赛</div>' + liveHtml + '</div>' + existingFeed;
    $('lastUpdate').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // ========== INIT ==========
  function init() {
    loadData();

    // 初始化实时数据轮询（如果配置了 API Token）
    if (window.AppConfig && window.AppConfig.FOOTBALL_API_TOKEN && window.LiveDataService) {
      window.LiveDataService.startPolling();
    }

    // 页面卸载时停止轮询
    window.addEventListener('beforeunload', function() {
      if (window.LiveDataService) {
        window.LiveDataService.stopPolling();
      }
    });
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ========== 公开接口 ==========
  window.LiveApp = {
    renderLiveData: renderLiveData
  };
})();
