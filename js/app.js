// === 应用主入口 ===
(function() {
  // ========== STATE ==========
  var state = {
    teamA: '',
    teamB: '',
    formA: 0,
    formB: 0,
    tempo: 0,
    venue: 'neutral',
    mode: 'group',
    user: null,
    unsubscribe: null
  };

  var teams = [];
  var fixtures = [];
  var feedItems = [];
  var h2hData = [];

  // ========== UTILITY ==========
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function showToast(msg) {
    var existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.className = 'toast-msg';
    el.textContent = msg;
    el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:var(--panel);border:1px solid var(--line);padding:10px 20px;border-radius:8px;z-index:999;font-size:14px;color:var(--text);box-shadow:0 4px 12px rgba(0,0,0,.3)';
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 3000);
  }

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
    h2hData = await tryFetch('data/h2h.json', []);
    if (!teams.length) return;
    populateSelectors();
    renderAll();
    applyUrlParams();
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

  // ========== RENDER FUNCTIONS ==========
  function renderAll() {
    renderPrediction();
    renderFixtures();
    renderFeed();
    renderTeams();
    renderRanking();
    renderAuth();
  }

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
    var gf = $('groupFilter'), cf = $('confedFilter');
    var groupsMap = {};
    var confedsMap = {};
    for (var i = 0; i < teams.length; i++) {
      groupsMap[teams[i].group] = true;
      confedsMap[teams[i].confed] = true;
    }
    var groups = Object.keys(groupsMap).sort();
    var confeds = Object.keys(confedsMap);
    groups.forEach(function(g) { gf.innerHTML += '<option value="' + g + '">' + g + '组</option>'; });
    confeds.forEach(function(c) { cf.innerHTML += '<option value="' + c + '">' + c + '</option>'; });
  }

  function renderPrediction() {
    var result = calculate();
    if (!result) return;
    var tA = teams.find(function(t) { return t.cn === state.teamA; });
    var tB = teams.find(function(t) { return t.cn === state.teamB; });
    $('resultTeams').innerHTML =
      '<div class="team-badge"><span class="flag">' + (tA ? tA.flag : '') + '</span><span class="name">' + state.teamA + '</span></div>'
      + '<div class="center-ball">' + (state.mode === 'knockout' ? 'VS' : 'VS') + '</div>'
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

  function renderTeams() {
    var search = ($('teamSearch').value || '').toLowerCase();
    var group = $('groupFilter').value;
    var confed = $('confedFilter').value;
    var filtered = teams.filter(function(t) {
      if (search && t.cn.toLowerCase().indexOf(search) === -1 && t.en.toLowerCase().indexOf(search) === -1) return false;
      if (group && t.group !== group) return false;
      if (confed && t.confed !== confed) return false;
      return true;
    });
    $('teamsGrid').innerHTML = filtered.map(function(t) {
      var d = derived(t);
      return '<div class="team-card" data-team="' + t.cn + '">'
        + '<div class="top"><span class="flag">' + t.flag + '</span><div class="info"><div class="cn">' + t.cn + '</div><div class="en">' + t.en + '</div><span class="group-tag">' + t.group + '组 · ' + t.confed + '</span></div></div>'
        + '<div class="meta-grid"><div class="meta-box"><div class="label">评分</div><div class="val">' + t.rating + '</div></div><div class="meta-box"><div class="label">攻击</div><div class="val">' + d.atk.toFixed(0) + '</div></div><div class="meta-box"><div class="label">防守</div><div class="val">' + d.def.toFixed(0) + '</div></div><div class="meta-box"><div class="label">足联</div><div class="val" style="font-size:11px">' + t.confed + '</div></div></div>'
        + '<div class="style-tags">' + t.style.map(function(s) { return '<span>' + s + '</span>'; }).join('') + '</div>'
        + '</div>';
    }).join('');
    var cards = document.querySelectorAll('.team-card');
    for (var i = 0; i < cards.length; i++) {
      (function(card) {
        card.addEventListener('click', function() {
          var name = card.dataset.team;
          if (!state.teamA || state.teamA === state.teamB) { state.teamA = name; $('teamA').value = name; }
          else { state.teamB = name; $('teamB').value = name; }
          renderPrediction();
          document.querySelector('#predictor').scrollIntoView({ behavior: 'smooth' });
        });
      })(cards[i]);
    }
  }

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
          return '<div class="rank-line"><div class="rank-team"><span>' + tm.flag + '</span><span>' + tm.cn + '</span></div><span class="rank-score">' + tm.rating + '</span></div>';
        }).join('')
        + '</div>';
    }).join('');
  }

  // ========== COUNTDOWN ==========
  function updateCountdown() {
    var now = new Date();
    $('liveClock').textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!fixtures.length) return;
    var target = new Date(fixtures[0].date);
    var diff = target - now;
    if (diff <= 0) {
      $('cdDays').textContent = '0'; $('cdHours').textContent = '0'; $('cdMins').textContent = '0'; $('cdSecs').textContent = '0';
      return;
    }
    var days = Math.floor(diff / 86400000);
    var hours = Math.floor((diff % 86400000) / 3600000);
    var mins = Math.floor((diff % 3600000) / 60000);
    var secs = Math.floor((diff % 60000) / 1000);
    $('cdDays').textContent = days;
    $('cdHours').textContent = hours;
    $('cdMins').textContent = mins;
    $('cdSecs').textContent = secs;
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

  // ========== AUTH (使用 AuthService) ==========
  function initAuth() {
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    renderAuthUI(user);
    updateDiscussLink();

    // 监听认证状态变更
    if (window.AuthService) {
      window.AuthService.onAuthChange(function(user) {
        renderAuthUI(user);
        updateDiscussLink();
      });
    }
  }

  function renderAuthUI(user) {
    var html = user
      ? '<div class="auth-user"><div class="avatar">' + (user.nickname || '?')[0] + '</div><span>' + escapeHtml(user.nickname) + '</span><span class="logout" id="logoutBtn">退出</span></div>'
      : '<button class="auth-login-btn" id="navLoginBtn">登录</button>';
    $('authArea').innerHTML = html;
    if ($('authAreaMobile')) $('authAreaMobile').innerHTML = html;
    var loginBtn = document.getElementById('navLoginBtn');
    var logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.addEventListener('click', function() { $('loginModal').classList.add('show'); });
    if (logoutBtn) logoutBtn.addEventListener('click', function() {
      if (window.AuthService) {
        window.AuthService.logout();
      }
    });
  }

  function setupLoginEvents() {
    $('closeLogin').addEventListener('click', function() { $('loginModal').classList.remove('show'); });
    $('loginModal').addEventListener('click', function(e) { if (e.target === $('loginModal')) $('loginModal').classList.remove('show'); });
    $('loginSubmitBtn').addEventListener('click', handleLogin);
    $('loginPhone').addEventListener('input', function(e) { e.target.value = e.target.value.replace(/\D/g, ''); });
  }

  function handleLogin() {
    var phone = $('loginPhone').value.trim();
    var nickname = $('loginNickname').value.trim();
    if (phone.length < 7) { showToast('请输入有效的手机号（至少7位）'); return; }
    if (!nickname) { showToast('请输入昵称'); return; }

    if (window.AuthService && window.SupabaseClient && window.SupabaseClient.isReady()) {
      // 使用 AuthService 登录
      $('loginSubmitBtn').disabled = true;
      $('loginSubmitBtn').textContent = '登录中...';
      window.AuthService.login(phone, nickname).then(function(user) {
        $('loginModal').classList.remove('show');
        $('loginPhone').value = '';
        $('loginNickname').value = '';
        $('loginSubmitBtn').disabled = false;
        $('loginSubmitBtn').textContent = '登录';
        showToast('登录成功！');
      }).catch(function(err) {
        showToast('登录失败: ' + (err.message || '未知错误'));
        $('loginSubmitBtn').disabled = false;
        $('loginSubmitBtn').textContent = '登录';
      });
    } else {
      // Supabase 未配置，降级为本地登录
      var maskedPhone = phone.slice(0, 3) + '****' + phone.slice(-4);
      var user = { phone: maskedPhone, nickname: nickname, loginAt: Date.now() };
      localStorage.setItem('wc_user', JSON.stringify(user));
      $('loginModal').classList.remove('show');
      $('loginPhone').value = '';
      $('loginNickname').value = '';
      renderAuthUI(user);
      updateDiscussLink();
      showToast('登录成功（本地模式）');
    }
  }

  // ========== 讨论区（改为社区链接） ==========
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
        if (window.CommunityService) {
          window.CommunityService.setMatchKey(key);
        }
        document.querySelector('#community').scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  // ========== 分享（改为预测卡片） ==========
  function setupShareEvents() {
    $('shareBtn').addEventListener('click', function() {
      var tA = teams.find(function(t) { return t.cn === state.teamA; });
      var tB = teams.find(function(t) { return t.cn === state.teamB; });
      var result = calculate();
      if (!tA || !tB || !result) {
        showToast('请先选择两支球队');
        return;
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
      var dataUrl = window.PredictionCardService.generateCard(tA, tB, prediction);
      window.PredictionCardService.showCardModal(dataUrl);
    });
  }

  // ========== 实时数据渲染（供 LiveDataService 回调） ==========
  function renderLiveData(data) {
    if (!data || !data.matches || !data.matches.length) return;
    var liveHtml = data.matches.map(function(m) {
      var home = m.homeTeam.shortName || m.homeTeam.name;
      var away = m.awayTeam.shortName || m.awayTeam.name;
      var score = m.score.fullTime || m.score.halfTime || { home: '-', away: '-' };
      var minute = m.minute || '--';
      return '<div class="fixture-card" style="border-left:3px solid var(--red)"><div><div style="font-size:13px;font-weight:500">' + home + ' ' + score.home + ' - ' + score.away + ' ' + away + '</div><div style="font-size:11px;color:var(--red)">⏱ ' + minute + "'</div></div></div>";
    }).join('');
    // 重新构建 feedList：实时比赛 + 原有资讯（避免重复 prepend）
    var existingFeed = feedItems.map(function(f) {
      return '<div class="feed-item"><div class="feed-tag">' + f.tag + '</div><div class="feed-title">' + f.title + '</div><div class="feed-text">' + f.text + '</div></div>';
    }).join('');
    $('feedList').innerHTML = '<div style="margin-bottom:12px"><div class="feed-tag" style="color:var(--red)">实时比赛</div>' + liveHtml + '</div>' + existingFeed;
    $('lastUpdate').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  // ========== SEGMENTED CONTROL HELPER ==========
  function setSegmented(id, value) {
    var buttons = document.querySelectorAll('#' + id + ' button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].dataset.v === value);
    }
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
    $('teamSearch').addEventListener('input', renderTeams);
    $('groupFilter').addEventListener('change', renderTeams);
    $('confedFilter').addEventListener('change', renderTeams);

    $('hamburger').addEventListener('click', function() { $('mobileNav').classList.toggle('show'); });
    var mobileLinks = document.querySelectorAll('#mobileNav a');
    for (var i = 0; i < mobileLinks.length; i++) {
      mobileLinks[i].addEventListener('click', function() { $('mobileNav').classList.remove('show'); });
    }
  }

  // ========== INIT ==========
  function init() {
    loadData();
    updateCountdown();
    setInterval(updateCountdown, 1000);
    initAuth();
    setupLoginEvents();
    setupShareEvents();
    setupEventHandlers();

    // 恢复用户会话
    if (window.AuthService) {
      window.AuthService.restoreSession().then(function(user) {
        if (user) {
          console.log('[App] 用户已恢复:', user.nickname);
        }
      });
    }

    // 初始化社区模块
    if (window.CommunityService) {
      window.CommunityService.init();
    }

    // 初始化预测卡片模块
    if (window.PredictionCardService) {
      window.PredictionCardService.init();
    }

    // 初始化实时数据轮询（如果配置了 API Token）
    if (window.AppConfig && window.AppConfig.FOOTBALL_API_TOKEN && window.LiveDataService) {
      window.LiveDataService.startPolling();
    }
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ========== 公开接口 ==========
  window.App = {
    init: init,
    renderLiveData: renderLiveData,
    renderAll: renderAll,
    renderAuth: renderAuthUI,
    buildShareUrl: buildShareUrl,
    getState: function() { return state; },
    getTeams: function() { return teams; },
    calculate: calculate
  };
})();
