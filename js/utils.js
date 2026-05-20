// === 公共工具函数 ===
(function() {
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

  function formatTime(isoStr) {
    if (!isoStr) return '';
    try {
      return new Date(isoStr).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch(e) { return isoStr; }
  }

  window.Utils = {
    $: $,
    escapeHtml: escapeHtml,
    showToast: showToast,
    formatTime: formatTime
  };
})();
