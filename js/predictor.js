// === 预测器模块（首页专属） ===
(function() {
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;
  var showToast = window.Utils.showToast;

  // ========== STATE ==========
  var state = {
    teamA: '',
    teamB: '',
    formA: 0,
    formB: 0,
    tempo: 0,
    venue: 'neutral',
    mode: 'group'
  };

  var teams = [];
  var h2hData = [];
  var fixtures = [];

  // ========== UTILITY ==========
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function derived(team) {
    var atk = 46 + (team.rating - 1500) / 18;
    var def = 46 + (team.rating - 1500) / 20;
    if (team.style.indexOf('高压') !== -1 || team.style.indexOf('前场压制') !== -1) atk += 4;
    if (team.style.indexOf('低位防守') !== -1 || team.style.indexOf('纪律防守') !== -1) def += 4;
    if (team.style.indexOf('速度反击') !== -1 || team.style.indexOf('快速转换') !== -1) atk += 3;
    if (team.style.indexOf('强硬防线') !== -1 || team.style.indexOf('紧凑防守') !== -1) def += 3;
    return { atk: clamp(atk, 46, 98), def: clamp(def, 46, 98) };
  }

  function poisson(lambda, k) {
    var f = 1;
    for (var i = 1; i <= k; i++) f *= i;
    return Math.pow(lambda, k) * Math.exp(-lambda) / f;
  }

  function scoreProjection(lA, lB) {
    var best = { s: '0 - 0', p: 0 };
    for (var a = 0; a <= 5; a++)
      for (var b = 0; b <= 5; b++) {
        var p = poisson(lA, a) * poisson(lB, b);
        if (p > best.p) best = { s: a + ' - ' + b, p: p };
      }
    return best.s;
  }

  // ========== PREDICTION ALGORITHM ==========
  function calculate() {
    var tA = teams.find(function(t) { return t.cn === state.teamA; });
    var tB = teams.find(function(t) { return t.cn === state.teamB; });
    if (!tA || !tB) return null;
    var dA = derived(tA), dB = derived(tB);
    var homeBoost = 0;
    if (state.venue === 'homeA') homeBoost = 65;
    else if (state.venue === 'homeB') homeBoost = -65;
    var diff = tA.rating + state.formA * 7 + homeBoost - tB.rating - state.formB * 7;
    var expectedA = 1 / (1 + Math.pow(10, -diff / 420));
    var drawP = clamp(0.285 - Math.abs(diff) / 3300 - state.tempo * 0.012, 0.11, 0.31);
    var winA = (1 - drawP) * expectedA;
    var winB = 1 - winA - drawP;
    var lA = Math.max(0.3, (dA.atk - dB.def) / 28 * 1.5 + 0.9 + state.tempo * 0.15);
    var lB = Math.max(0.3, (dB.atk - dA.def) / 28 * 1.5 + 0.9 - state.tempo * 0.08);
    var score = scoreProjection(lA, lB);
    var advanceA = winA, advanceB = winB;
    if (state.mode === 'knockout') {
      var koWinA = winA + drawP * 0.55;
      var koWinB = 1 - koWinA;
      advanceA = koWinA;
      advanceB = koWinB;
    }
    return { winA: winA * 100, drawP: drawP * 100, winB: winB * 100, advanceA: advanceA * 100, advanceB: advanceB * 100, score: score, lA: lA, lB: lB };
  }

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
    h2hData = await tryFetch('data/h2h.json', []);
    if (!teams.length) return;
    populateSelectors();
    renderPrediction();
    applyUrlParams();
  }

  // ========== POPULATE SELECTORS ==========
  function populateSelectors() {
    var selA = $('teamA'), selB = $('teamB');
    selA.innerHTML = selB.innerHTML = '';
    teams.forEach(function(t) {
      selA.innerHTML += '<option value="' + t.cn + '">' + t.flag + ' ' + t.cn + '</option>';
      selB.innerHTML += '<option value="' + t.cn + '">' + t.flag + ' ' + t.cn + '</option>';
    });
    state.teamA = teams[0].cn;
    state.teamB = teams.length > 1 ? teams[1].cn : teams[0].cn;
    selB.selectedIndex = 1;
  }

  // ========== RENDER ==========
  function renderPrediction() {
    var result = calculate();
    if (!result) return;
    var tA = teams.find(function(t) { return t.cn === state.teamA; });
    var tB = teams.find(function(t) { return t.cn === state.teamB; });
    $('resultTeams').innerHTML =
      '<div class="team-badge"><span class="flag">' + (tA ? tA.flag : '') + '</span><span class="name">' + state.teamA + '</span></div>'
      + '<div class="center-ball">VS</div>'
      + '<div class="team-badge"><span class="flag">' + (tB ? tB.flag : '') + '</span><span class="name">' + state.teamB + '</span></div>';
    var isKnockout = state.mode === 'knockout';
    var rows = [
      { label: state.teamA, pct: result.winA, cls: 'win-a' },
      { label: '平局', pct: result.drawP, cls: 'draw' },
      { label: state.teamB, pct: result.winB, cls: 'win-b' }
    ];
    var probHtml = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      probHtml += '<div class="prob-row">'
        + '<span class="prob-label">' + r.label + '</span>'
        + '<div class="prob-bar-wrap"><div class="prob-bar ' + r.cls + '" style="width:' + r.pct.toFixed(1) + '%"></div><span class="prob-pct">' + r.pct.toFixed(1) + '%</span></div>'
        + '</div>';
    }
    if (isKnockout) {
      probHtml += '<div class="prob-row" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line)">'
        + '<span class="prob-label" style="color:var(--green)">晋级</span>'
        + '<div class="prob-bar-wrap"><div class="prob-bar win-a" style="width:' + result.advanceA.toFixed(1) + '%"></div><span class="prob-pct">' + state.teamA + ' ' + result.advanceA.toFixed(1) + '%</span></div>'
        + '</div>'
        + '<div class="prob-row">'
        + '<span class="prob-label" style="color:var(--blue)">晋级</span>'
        + '<div class="prob-bar-wrap"><div class="prob-bar win-b" style="width:' + result.advanceB.toFixed(1) + '%"></div><span class="prob-pct">' + state.teamB + ' ' + result.advanceB.toFixed(1) + '%</span></div>'
        + '</div>';
    }
    $('probList').innerHTML = probHtml;
    $('insights').innerHTML =
      '<div class="insight-card"><div class="label">预计比分</div><div class="value">' + result.score + '</div></div>'
      + '<div class="insight-card"><div class="label">比赛倾向</div><div class="value">' + (result.winA > result.winB ? state.teamA + ' 优势' : result.winB > result.winA ? state.teamB + ' 优势' : '势均力敌') + '</div></div>';
    var fav = result.advanceA > result.advanceB ? state.teamA : state.teamB;
    var pct = Math.max(result.advanceA, result.advanceB);
    $('verdict').textContent = isKnockout ? fav + ' 晋级概率 ' + pct.toFixed(1) + '%' : fav + ' 胜率 ' + pct.toFixed(1) + '%';
    renderH2H();
    updateDiscussLink();
  }

  function renderH2H() {
    var match = h2hData.find(function(h) {
      return (h.teams[0] === state.teamA && h.teams[1] === state.teamB) || (h.teams[0] === state.teamB && h.teams[1] === state.teamA);
    });
    if (!match || !match.summary.total) { $('h2hArea').innerHTML = ''; return; }
    var w = match.summary.wins;
    $('h2hArea').innerHTML =
      '<div class="h2h-box">'
      + '<h4>历史交锋（' + match.summary.total + ' 场）</h4>'
      + '<div class="h2h-stats">'
      + '<div class="h2h-stat"><div class="num" style="color:var(--green)">' + w[0] + '</div><div class="lbl">' + match.teams[0] + '胜</div></div>'
      + '<div class="h2h-stat"><div class="num" style="color:var(--gold)">' + w[2] + '</div><div class="lbl">平局</div></div>'
      + '<div class="h2h-stat"><div class="num" style="color:var(--blue)">' + w[1] + '</div><div class="lbl">' + match.teams[1] + '胜</div></div>'
      + '</div>'
      + '<table class="h2h-table"><thead><tr><th>年份</th><th>赛事</th><th>比分</th></tr></thead><tbody>'
      + match.matches.map(function(m) { return '<tr><td>' + m.year + '</td><td>' + m.comp + '</td><td>' + m.score + '</td></tr>'; }).join('')
      + '</tbody></table></div>';
  }

  // ========== COUNTDOWN ==========
  function updateCountdown() {
    var now = new Date();
    var liveClock = document.getElementById('liveClock');
    if (liveClock) liveClock.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!fixtures.length) return;
    var target = new Date(fixtures[0].date);
    var diff = target - now;
    if (diff <= 0) {
      var cdDays = $('cdDays'), cdHours = $('cdHours'), cdMins = $('cdMins'), cdSecs = $('cdSecs');
      if (cdDays) cdDays.textContent = '0';
      if (cdHours) cdHours.textContent = '0';
      if (cdMins) cdMins.textContent = '0';
      if (cdSecs) cdSecs.textContent = '0';
      return;
    }
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var mins = Math.floor((diff % 3600000) / 60000);
    var secs = Math.floor((diff % 60000) / 1000);
    if ($('cdDays')) $('cdDays').textContent = days;
    if ($('cdHours')) $('cdHours').textContent = hours;
    if ($('cdMins')) $('cdMins').textContent = mins;
    if ($('cdSecs')) $('cdSecs').textContent = secs;
  }

  // ========== URL PARAMS ==========
  function applyUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var a = params.get('a'), b = params.get('b'), m = params.get('mode');
    if (a) { state.teamA = a; $('teamA').value = a; }
    if (b) { state.teamB = b; $('teamB').value = b; }
    if (m === 'knockout') { state.mode = 'knockout'; setSegmented('modeSeg', 'knockout'); }
    if (a || b || m) renderPrediction();
  }

  function buildShareUrl() {
    var base = window.location.origin + window.location.pathname;
    var params = new URLSearchParams();
    if (state.teamA) params.set('a', state.teamA);
    if (state.teamB) params.set('b', state.teamB);
    if (state.mode === 'knockout') params.set('mode', 'knockout');
    return base + '?' + params.toString();
  }

  // ========== 讨论区链接 ==========
  function getMatchKey() {
    if (!state.teamA || !state.teamB) return '';
    return [state.teamA, state.teamB].sort().join('_vs_');
  }

  function updateDiscussLink() {
    var key = getMatchKey();
    if (!key) {
      $('discussList').innerHTML = "<p style='color:var(--muted);font-size:12px'>选择两支球队后即可查看讨论</p>";
      return;
    }
    $('discussList').innerHTML =
      '<div style="text-align:center;padding:16px">'
      + '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">💬 想讨论 ' + escapeHtml(state.teamA) + ' VS ' + escapeHtml(state.teamB) + '？</p>'
      + '<button id="goToCommunity" style="background:var(--green);color:var(--ink);padding:8px 20px;border-radius:8px;font-weight:600;cursor:pointer">前往社区讨论 →</button>'
      + '</div>';

    var goBtn = document.getElementById('goToCommunity');
    if (goBtn) {
      goBtn.addEventListener('click', function() {
        window.location.href = 'community.html?match_key=' + encodeURIComponent(key);
      });
    }
  }

  // ========== SEGMENTED CONTROL HELPER ==========
  function setSegmented(id, value) {
    var buttons = document.querySelectorAll('#' + id + ' button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].dataset.v === value);
    }
  }

  // ========== SHARE EVENTS ==========
  function setupShareEvents() {
    // 自动从 AuthService 获取用户昵称预填输入框
    if (window.AuthService && window.AuthService.getCurrentUser) {
      var user = window.AuthService.getCurrentUser();
      if (user && user.nickname) {
        var userIdEl = $('user-id-input');
        if (userIdEl && !userIdEl.value.trim()) {
          userIdEl.value = user.nickname;
        }
      }
      // 监听登录状态变化，自动更新
      window.AuthService.onAuthChange(function(u) {
        if (u && u.nickname) {
          var el = $('user-id-input');
          if (el && !el.value.trim()) {
            el.value = u.nickname;
          }
        }
      });
    }

    $('shareBtn').addEventListener('click', function() {
      var tA = teams.find(function(t) { return t.cn === state.teamA; });
      var tB = teams.find(function(t) { return t.cn === state.teamB; });
      var result = calculate();
      if (!tA || !tB || !result) {
        showToast('请先选择两支球队');
        return;
      }

      // 读取用户输入的抖音号/昵称（优先用输入框，其次用登录昵称）
      var userIdEl = $('user-id-input');
      var userId = userIdEl ? userIdEl.value.trim() : '';
      if (!userId && window.AuthService && window.AuthService.getCurrentUser) {
        var user = window.AuthService.getCurrentUser();
        if (user && user.nickname) userId = user.nickname;
      }
      if (!userId) {
        userId = window.prompt('输入你的抖音号或球迷昵称，生成专属神单：');
        if (!userId || !userId.trim()) userId = '匿名老球迷';
        userId = userId.trim();
        // 回填到输入框
        if (userIdEl) userIdEl.value = userId;
      }

      var prediction = {
        winA: result.winA,
        drawP: result.drawP,
        winB: result.winB,
        advanceA: result.advanceA,
        advanceB: result.advanceB,
        score: result.score,
        mode: state.mode
      };
      var dataUrl = window.PredictionCardService.generateCard(tA, tB, prediction, userId);
      window.PredictionCardService.showCardModal(dataUrl);
    });
  }

  // ========== EVENT HANDLERS ==========
  function setupEventHandlers() {
    $('teamA').addEventListener('change', function(e) { state.teamA = e.target.value; renderPrediction(); });
    $('teamB').addEventListener('change', function(e) { state.teamB = e.target.value; renderPrediction(); });
    $('formA').addEventListener('input', function(e) { state.formA = +e.target.value; $('formAVal').textContent = state.formA > 0 ? '+' + state.formA : state.formA; renderPrediction(); });
    $('formB').addEventListener('input', function(e) { state.formB = +e.target.value; $('formBVal').textContent = state.formB > 0 ? '+' + state.formB : state.formB; renderPrediction(); });

    $('tempoSeg').addEventListener('click', function(e) {
      if (!e.target.dataset.v) return;
      state.tempo = +e.target.dataset.v;
      setSegmented('tempoSeg', e.target.dataset.v);
      renderPrediction();
    });
    $('venueRow').addEventListener('click', function(e) {
      if (!e.target.dataset.v) return;
      state.venue = e.target.dataset.v;
      var buttons = document.querySelectorAll('#venueRow button');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.toggle('active', buttons[i].dataset.v === state.venue);
      }
      renderPrediction();
    });
    $('modeSeg').addEventListener('click', function(e) {
      if (!e.target.dataset.v) return;
      state.mode = e.target.dataset.v;
      setSegmented('modeSeg', e.target.dataset.v);
      renderPrediction();
    });
  }

  // ========== INIT ==========
  function init() {
    loadData();
    updateCountdown();
    setInterval(updateCountdown, 1000);
    setupShareEvents();
    setupEventHandlers();

    // 初始化预测卡片模块
    if (window.PredictionCardService) {
      window.PredictionCardService.init();
    }
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ========== 公开接口 ==========
  window.PredictorApp = {
    calculate: calculate,
    buildShareUrl: buildShareUrl,
    getState: function() { return state; }
  };
})();
