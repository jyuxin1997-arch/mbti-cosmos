// === 球队百科模块（teams.html 专属） ===
(function() {
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;

  var teams = [];
  var selectedA = '';  // 已选的 A 队名称
  var selectedB = '';  // 已选的 B 队名称

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
    populateFilters();
    renderTeams();
    applyUrlParams();
  }

  // ========== POPULATE FILTERS ==========
  function populateFilters() {
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

  // ========== RENDER ==========
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
    // 绑定卡片点击事件
    var cards = document.querySelectorAll('.team-card');
    for (var i = 0; i < cards.length; i++) {
      (function(card) {
        card.addEventListener('click', function() {
          var name = card.dataset.team;
          // 按架构设计：支持 A/B 队选择逻辑
          // 如果 A 队未选，或 A/B 相同，则填入 A 队
          // 否则填入 B 队
          if (!selectedA || selectedA === selectedB) {
            selectedA = name;
          } else {
            selectedB = name;
          }
          // 构建跳转 URL
          var url = 'index.html?a=' + encodeURIComponent(selectedA);
          if (selectedB && selectedB !== selectedA) {
            url += '&b=' + encodeURIComponent(selectedB);
          }
          window.location.href = url;
        });
      })(cards[i]);
    }
  }

  // ========== URL PARAMS ==========
  function applyUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var highlight = params.get('highlight');
    if (highlight) {
      // 滚动到对应卡片并高亮
      var targetCard = document.querySelector('.team-card[data-team="' + highlight + '"]');
      if (targetCard) {
        targetCard.classList.add('highlight');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  // ========== EVENT HANDLERS ==========
  function setupEventHandlers() {
    $('teamSearch').addEventListener('input', renderTeams);
    $('groupFilter').addEventListener('change', renderTeams);
    $('confedFilter').addEventListener('change', renderTeams);
  }

  // ========== INIT ==========
  function init() {
    loadData();
    setupEventHandlers();
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ========== 公开接口 ==========
  window.TeamsApp = {
    init: init
  };
})();
