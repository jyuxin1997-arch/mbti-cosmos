// === 分享海报模块 ===
// 依赖：html2canvas（需在本脚本之前加载）
// 暴露：window.ShareModule
(function() {
  'use strict';

  var _lastDataUrl = null;

  // 二维码图片 URL（使用公共 API）
  var QR_API = 'https://api.qrserver.com/v1/create-qr-code/?size=144x144&bgcolor=ffffff&color=000000&data=';

  /**
   * 生成分享海报
   * @param {object} opts
   *   opts.title   - 帖子标题（可选，不传则用默认文案）
   *   opts.body    - 帖子内容（可选）
   *   opts.url     - 分享目标URL（可选，默认当前页）
   */
  function generate(opts) {
    opts = opts || {};
    var shareUrl = opts.url || window.location.href;
    var title    = opts.title || '来预测 2026 世界杯冠军！';
    var body     = opts.body  || '和全球球迷一起讨论、预测，看谁最懂球。';

    // 截断正文到 80 字
    if (body && body.length > 80) {
      body = body.slice(0, 80) + '...';
    }

    // 填充海报内容
    var elTitle = document.getElementById('share-poster-title');
    var elBody  = document.getElementById('share-poster-body');
    var elQr    = document.getElementById('share-poster-qr');
    if (!elTitle || !elBody || !elQr) {
      console.warn('[Share] 海报模板元素未找到');
      return;
    }
    elTitle.textContent = title;
    elBody.textContent  = body;
    elQr.src = QR_API + encodeURIComponent(shareUrl);

    // 等二维码图片加载完再截图
    var tpl = document.getElementById('share-poster-tpl');
    if (!tpl) { return; }

    // 显示 loading 提示
    _showModal('<div style="color:#fff;font-size:14px;padding:40px;">⏳ 生成中...</div>', null);

    function _doCapture() {
      // html2canvas 截图
      html2canvas(tpl, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: null,
        logging: false
      }).then(function(canvas) {
        var dataUrl = canvas.toDataURL('image/png');
        _lastDataUrl = dataUrl;
        var img = '<img src="' + dataUrl + '" style="width:100%;max-width:320px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);" alt="分享海报">';
        _showModal(img, true);
      }).catch(function(err) {
        console.error('[Share] html2canvas 失败:', err);
        _showModal('<div style="color:#ff6b6b;padding:20px;font-size:13px;">生成失败，请重试 😅</div>', false);
      });
    }

    // 等 QR 图片加载完
    if (elQr.complete && elQr.naturalWidth > 0) {
      _doCapture();
    } else {
      elQr.onload  = _doCapture;
      elQr.onerror = function() {
        // QR 加载失败也继续（二维码会显示 broken）
        _doCapture();
      };
    }
  }

  function _showModal(innerHtml, showButtons) {
    var modal = document.getElementById('share-modal');
    var wrap  = document.getElementById('share-img-wrap');
    if (!modal || !wrap) { return; }
    wrap.innerHTML = innerHtml;
    modal.style.display = 'flex';
  }

  function close() {
    var modal = document.getElementById('share-modal');
    if (modal) { modal.style.display = 'none'; }
    _lastDataUrl = null;
  }

  function download() {
    if (!_lastDataUrl) { return; }
    var a = document.createElement('a');
    a.href     = _lastDataUrl;
    a.download = 'worldcup-poster.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ===================== 挂载到社区帖子 =====================

  /**
   * 给帖子卡片绑定分享按钮（供 community.js 调用）
   * @param {string} postId
   * @param {string} title
   * @param {string} content
   */
  function sharePost(postId, title, content) {
    var url = window.location.origin + window.location.pathname + '?post=' + postId;
    generate({ title: title, body: content, url: url });
  }

  // ===================== 全局分享浮动按钮 =====================

  function _injectFloatBtn() {
    if (document.getElementById('share-float-btn')) { return; }
    var btn = document.createElement('button');
    btn.id = 'share-float-btn';
    btn.title = '分享此页';
    btn.innerHTML = '📤';
    btn.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:80px',
      'width:46px',
      'height:46px',
      'border-radius:50%',
      'border:none',
      'background:linear-gradient(135deg,#ffd700,#ff8c00)',
      'color:#0d2818',
      'font-size:20px',
      'cursor:pointer',
      'z-index:9000',
      'box-shadow:0 4px 16px rgba(0,0,0,0.35)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transition:transform 0.15s'
    ].join(';');
    btn.addEventListener('touchstart', function() { btn.style.transform = 'scale(0.9)'; });
    btn.addEventListener('touchend',   function() { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', function() {
      generate();
    });
    document.body.appendChild(btn);
  }

  // 点击弹窗外部关闭
  document.addEventListener('click', function(e) {
    var modal = document.getElementById('share-modal');
    if (modal && modal.style.display === 'flex' && e.target === modal) {
      close();
    }
  });

  // DOM 就绪后注入浮动按钮
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectFloatBtn);
  } else {
    _injectFloatBtn();
  }

  // ===================== 暴露 =====================
  window.ShareModule = {
    generate: generate,
    sharePost: sharePost,
    close: close,
    download: download
  };

})();
