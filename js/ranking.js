// === 夺冠热榜模块（ranking.html 专属） ===
(function() {
  var $ = window.Utils.$;

  var teams = [];

  // ========== DATA LOADING ==========
  async function loadData() {
    try {
      var r = await fetch('data/teams.json');
      if (!r.ok) throw new Error();
      teams = await r.json();
    } catch(e) {
      teams = [];
    }
    if (!teams.length) return;
    renderRanking();
  }

  // ========== RENDER ==========
  function renderRanking() {
    var sorted = teams.slice().sort(function(a, b) { return b.rating - a.rating; });
    var tiers = [
      { label: '冠军热门', cls: 'tier-1', teams: sorted.slice(0, 5) },
      { label: '强力竞争', cls: 'tier-2', teams: sorted.slice(5, 12) },
      { label: '中游力量', cls: 'tier-3', teams: sorted.slice(12, 28) },
      { label: '黑马潜力', cls: 'tier-4', teams: sorted.slice(28) }
    ];
    $('rankingGrid').innerHTML = tiers.map(function(t) {
      return '<div class="ranking-card ' + t.cls + '">'
        + '<div class="tier"><span class="dot"></span>' + t.label + '</div>'
        + t.teams.map(function(tm) {
          return '<div class="rank-line" data-team="' + tm.cn + '"><div class="rank-team"><span>' + tm.flag + '</span><span>' + tm.cn + '</span></div><span class="rank-score">' + tm.rating + '</span></div>';
        }).join('')
        + '</div>';
    }).join('');

    // 绑定球队行项点击事件
    var rankLines = document.querySelectorAll('.rank-line');
    for (var i = 0; i < rankLines.length; i++) {
      (function(line) {
        line.addEventListener('click', function() {
          var name = line.dataset.team;
          // 跳转到首页预测器
          window.location.href = 'index.html?a=' + encodeURIComponent(name);
        });
      })(rankLines[i]);
    }
  }

  // ========== INIT ==========
  function init() {
    loadData();
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ========== 公开接口 ==========
  window.RankingApp = {
    init: init
  };
})();
