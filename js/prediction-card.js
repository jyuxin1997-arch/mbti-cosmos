// === 预测卡片生成模块 ===
(function() {
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var CARD_W = 680;
  var CARD_H = 400;
  var REAL_W = CARD_W * DPR;
  var REAL_H = CARD_H * DPR;

  function $(id) { return document.getElementById(id); }

  function init() {
    // 关闭预测卡片弹窗
    $('closeCardPreview').addEventListener('click', function() {
      $('cardPreviewModal').classList.remove('active');
    });
    $('cardPreviewModal').addEventListener('click', function(e) {
      if (e.target === $('cardPreviewModal')) $('cardPreviewModal').classList.remove('active');
    });

    // 下载按钮
    $('btnDownloadCard').addEventListener('click', function() {
      var img = $('cardPreviewImg');
      if (!img || !img.src) return;
      downloadCard(img.src);
    });

    // 分享按钮
    $('btnShareCard').addEventListener('click', function() {
      var img = $('cardPreviewImg');
      if (!img || !img.src) return;
      shareCard(img.src);
    });
  }

  /**
   * 生成预测卡片
   * @param {Object} teamA - A队信息 { flag, cn, rating }
   * @param {Object} teamB - B队信息 { flag, cn, rating }
   * @param {Object} prediction - 预测结果 { winA, drawP, winB, advanceA, advanceB, score, mode }
   * @returns {string} data URL
   */
  function generateCard(teamA, teamB, prediction) {
    var canvas = document.createElement('canvas');
    canvas.width = REAL_W;
    canvas.height = REAL_H;
    var ctx = canvas.getContext('2d');

    // 缩放到 DPR
    ctx.scale(DPR, DPR);

    // === 背景 ===
    var bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_H);
    bgGrad.addColorStop(0, '#0b1110');
    bgGrad.addColorStop(1, '#15211e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // 边框
    ctx.strokeStyle = '#263833';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, CARD_W - 1, CARD_H - 1);

    // === 顶部站名 ===
    ctx.fillStyle = '#f5fbf7';
    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('世界杯胜率预测台', CARD_W / 2, 36);

    // 顶部装饰线
    ctx.strokeStyle = '#31c47a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CARD_W / 2 - 80, 48);
    ctx.lineTo(CARD_W / 2 + 80, 48);
    ctx.stroke();

    // === 中间区域：左队A / VS / 右队B ===
    var midY = 140;
    var leftX = 170;
    var rightX = 510;

    // 队A
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5fbf7';
    ctx.fillText(teamA ? teamA.flag : '⚽', leftX, midY - 10);
    ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(teamA ? teamA.cn : 'A队', leftX, midY + 24);

    // VS
    ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#f0c04d';
    ctx.fillText('VS', CARD_W / 2, midY + 8);

    // 队B
    ctx.font = '48px sans-serif';
    ctx.fillStyle = '#f5fbf7';
    ctx.fillText(teamB ? teamB.flag : '⚽', rightX, midY - 10);
    ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(teamB ? teamB.cn : 'B队', rightX, midY + 24);

    // === 胜率条形图 ===
    var barY = 195;
    var barH = 22;
    var barW = 460;
    var barX = (CARD_W - barW) / 2;

    // 背景
    ctx.fillStyle = '#15211e';
    roundRect(ctx, barX, barY, barW, barH, 4);
    ctx.fill();

    // A胜（绿）
    var winAPct = (prediction.winA || 0) / 100;
    ctx.fillStyle = '#31c47a';
    roundRect(ctx, barX, barY, barW * winAPct, barH, 4);
    ctx.fill();

    // 平（金）
    var drawPct = (prediction.drawP || 0) / 100;
    ctx.fillStyle = '#f0c04d';
    roundRect(ctx, barX + barW * winAPct, barY, barW * drawPct, barH, 0);
    ctx.fill();

    // B胜（蓝）
    var winBPct = (prediction.winB || 0) / 100;
    ctx.fillStyle = '#56a3ff';
    roundRect(ctx, barX + barW * winAPct + barW * drawPct, barY, barW * winBPct, barH, 4);
    ctx.fill();

    // 百分比标注
    ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5fbf7';
    if (winAPct > 0.08) ctx.fillText((prediction.winA || 0).toFixed(1) + '%', barX + barW * winAPct / 2, barY + 16);
    if (drawPct > 0.08) ctx.fillText('平 ' + (prediction.drawP || 0).toFixed(1) + '%', barX + barW * winAPct + barW * drawPct / 2, barY + 16);
    if (winBPct > 0.08) ctx.fillText((prediction.winB || 0).toFixed(1) + '%', barX + barW * winAPct + barW * drawPct + barW * winBPct / 2, barY + 16);

    // 标签
    ctx.font = '400 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#31c47a';
    ctx.fillText((teamA ? teamA.cn : 'A') + ' 胜', barX, barY - 6);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#56a3ff';
    ctx.fillText((teamB ? teamB.cn : 'B') + ' 胜', barX + barW, barY - 6);

    // === 预计比分 ===
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9db2ab';
    ctx.font = '400 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('预计比分', CARD_W / 2, 250);
    ctx.fillStyle = '#f5fbf7';
    ctx.font = '700 22px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText(prediction.score || '0 - 0', CARD_W / 2, 280);

    // === 淘汰赛晋级概率 ===
    if (prediction.mode === 'knockout') {
      ctx.font = '400 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = '#9db2ab';
      ctx.fillText('晋级概率', CARD_W / 2, 308);
      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
      ctx.fillStyle = '#31c47a';
      ctx.fillText((teamA ? teamA.cn : 'A') + ' ' + (prediction.advanceA || 0).toFixed(1) + '%', CARD_W / 2 - 80, 330);
      ctx.fillStyle = '#56a3ff';
      ctx.fillText((teamB ? teamB.cn : 'B') + ' ' + (prediction.advanceB || 0).toFixed(1) + '%', CARD_W / 2 + 80, 330);
    }

    // === 右下角二维码 ===
    var shareUrl = window.PredictorApp && window.PredictorApp.buildShareUrl ? window.PredictorApp.buildShareUrl() : window.location.href;
    try {
      var qrDiv = document.createElement('div');
      qrDiv.style.position = 'absolute';
      qrDiv.style.left = '-9999px';
      document.body.appendChild(qrDiv);
      new QRCode(qrDiv, { text: shareUrl, width: 120, height: 120, colorDark: '#f5fbf7', colorLight: '#111a18' });
      var qrCanvas = qrDiv.querySelector('canvas');
      if (qrCanvas) {
        ctx.drawImage(qrCanvas, CARD_W - 120, CARD_H - 120, 100, 100);
      }
      // 清理临时元素
      document.body.removeChild(qrDiv);
    } catch(e) {
      // QRCode.js 未加载或失败，跳过二维码
      console.warn('[PredictionCard] 二维码生成失败:', e);
    }

    // === 底部水印 ===
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9db2ab';
    ctx.font = '400 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText('世界杯胜率预测台 · 仅供娱乐参考', CARD_W / 2, CARD_H - 12);

    return canvas.toDataURL('image/png');
  }

  /**
   * 圆角矩形辅助
   */
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 0) w = 0;
    if (h < 0) h = 0;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * 下载卡片
   */
  function downloadCard(dataUrl) {
    var link = document.createElement('a');
    link.download = '预测卡片_' + Date.now() + '.png';
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * 分享卡片
   */
  function shareCard(dataUrl) {
    // 将 dataURL 转为 Blob
    var byteString = atob(dataUrl.split(',')[1]);
    var mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    var blob = new Blob([ab], { type: mimeString });
    var file = new File([blob], '预测卡片.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        title: '世界杯预测卡片',
        text: '看看我的预测结果！',
        files: [file]
      }).catch(function(err) {
        console.log('[PredictionCard] 分享取消或失败:', err);
        // fallback: 下载
        downloadCard(dataUrl);
      });
    } else {
      // 不支持 Web Share API，直接下载
      downloadCard(dataUrl);
    }
  }

  /**
   * 显示预测卡片弹窗
   */
  function showCardModal(dataUrl) {
    $('cardPreviewImg').src = dataUrl;
    $('cardPreviewModal').classList.add('active');
  }

  window.PredictionCardService = {
    init: init,
    generateCard: generateCard,
    downloadCard: downloadCard,
    shareCard: shareCard,
    showCardModal: showCardModal
  };
})();
