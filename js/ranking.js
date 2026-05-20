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
          return '<div class="rank-line"><div class="rank-team" data-team="' + tm.cn + '" data-action="teams"><span>' + tm.flag + '</span><span>' + tm.cn + '</span></div><span class="rank-score" data-team="' + tm.cn + '" data-action="predictor">' + tm.rating + '</span></div>';
        }).join('')
        + '</div>';
    }).join('');

    // 绑定球队名称点击 → 球队百科详情
    var rankTeams = document.querySelectorAll('.rank-team[data-action="teams"]');
    for (var i = 0; i < rankTeams.length; i++) {
      (function(el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          var name = el.dataset.team;
          window.location.href = 'teams.html?highlight=' + encodeURIComponent(name);
        });
      })(rankTeams[i]);
    }

    // 绑定评分点击 → 预测器
    var rankScores = document.querySelectorAll('.rank-score[data-action="predictor"]');
    for (var j = 0; j < rankScores.length; j++) {
      (function(el) {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          var name = el.dataset.team;
          window.location.href = 'index.html?a=' + encodeURIComponent(name);
        });
      })(rankScores[j]);
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
