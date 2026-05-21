// === 内容过滤 + 频率限制 ===
(function() {
  // 敏感词列表
  var SENSITIVE_WORDS = [
    '赌博','赌球','下注','投注','盘口','赔率','博彩','外围',
    '色情','裸体','色诱',
    '傻逼','操你','妈的','狗日','草泥马','王八蛋',
    '假球','黑哨','操纵比赛','内定',
    'fuck','shit','damn','asshole'
  ];

  var RATE_LIMITS = {
    post: { minInterval: 30000, maxPerHour: 10 },
    reply: { minInterval: 10000, maxPerHour: 30 }
  };

  function filterText(text) {
    if (!text) return text;
    var result = text;
    for (var i = 0; i < SENSITIVE_WORDS.length; i++) {
      var word = SENSITIVE_WORDS[i];
      while (result.indexOf(word) !== -1) {
        result = result.replace(word, '***');
      }
    }
    return result;
  }

  function validatePost(title, content) {
    if (!title || title.trim().length < 2) {
      return { ok: false, msg: '标题至少2个字' };
    }
    if (!content || content.trim().length < 5) {
      return { ok: false, msg: '内容至少5个字' };
    }
    if (title.length > 100) {
      return { ok: false, msg: '标题不能超过100字' };
    }
    if (content.length > 2000) {
      return { ok: false, msg: '内容不能超过2000字' };
    }
    var filtered = filterText(title + content);
    if (filtered !== title + content) {
      return { ok: false, msg: '内容包含敏感信息，请修改后重试' };
    }
    return { ok: true, msg: '' };
  }

  function validateReply(content) {
    if (!content || content.trim().length < 2) {
      return { ok: false, msg: '回复至少2个字' };
    }
    if (content.length > 500) {
      return { ok: false, msg: '回复不能超过500字' };
    }
    var filtered = filterText(content);
    if (filtered !== content) {
      return { ok: false, msg: '内容包含敏感信息，请修改后重试' };
    }
    return { ok: true, msg: '' };
  }

  function _getActionLog(action) {
    try {
      var log = localStorage.getItem('wc_rate_' + action);
      return log ? JSON.parse(log) : [];
    } catch(e) { return []; }
  }

  function _saveActionLog(action, log) {
    try {
      localStorage.setItem('wc_rate_' + action, JSON.stringify(log));
    } catch(e) { /* ignore */ }
  }

  function checkRateLimit(action) {
    var limit = RATE_LIMITS[action];
    if (!limit) return { ok: true, waitSec: 0 };

    var log = _getActionLog(action);
    var now = Date.now();

    // 清理1小时前的记录
    var oneHourAgo = now - 3600000;
    var filtered = [];
    for (var i = 0; i < log.length; i++) {
      if (log[i] > oneHourAgo) filtered.push(log[i]);
    }

    // 检查每小时上限
    if (filtered.length >= limit.maxPerHour) {
      var waitSec = Math.ceil((filtered[0] + 3600000 - now) / 1000);
      return { ok: false, waitSec: waitSec };
    }

    // 检查最小间隔
    if (filtered.length > 0) {
      var lastAction = filtered[filtered.length - 1];
      var elapsed = now - lastAction;
      if (elapsed < limit.minInterval) {
        var waitMs = limit.minInterval - elapsed;
        return { ok: false, waitSec: Math.ceil(waitMs / 1000) };
      }
    }

    return { ok: true, waitSec: 0 };
  }

  function recordAction(action) {
    var log = _getActionLog(action);
    var now = Date.now();
    log.push(now);
    // 只保留最近1小时
    var oneHourAgo = now - 3600000;
    var filtered = [];
    for (var i = 0; i < log.length; i++) {
      if (log[i] > oneHourAgo) filtered.push(log[i]);
    }
    _saveActionLog(action, filtered);
  }

  window.ContentFilter = {
    filterText: filterText,
    validatePost: validatePost,
    validateReply: validateReply,
    checkRateLimit: checkRateLimit,
    recordAction: recordAction
  };
})();
