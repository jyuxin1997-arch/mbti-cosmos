// === 通知服务 ===
(function() {
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;
  var showToast = window.Utils.showToast;
  var formatTime = window.Utils.formatTime;

  var realtimeChannel = null;
  var unreadCount = 0;
  var panelVisible = false;

  function _getSb() {
    return (window.SupabaseClient && window.SupabaseClient.isReady && window.SupabaseClient.isReady())
      ? window.SupabaseClient.getInstance() : null;
  }

  function _getCurrentUser() {
    return window.AuthService ? window.AuthService.getCurrentUser() : null;
  }

  function fetchUnreadCount() {
    var sb = _getSb();
    var user = _getCurrentUser();
    if (!sb || !user) return Promise.resolve(0);

    return sb.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then(function(result) {
        unreadCount = result.count || 0;
        _updateBadge();
        return unreadCount;
      })
      .catch(function() { return 0; });
  }

  function fetchNotifications(limit) {
    var sb = _getSb();
    var user = _getCurrentUser();
    if (!sb || !user) return Promise.resolve([]);

    return sb.from('notifications')
      .select('*, from_user:profiles!notifications_from_user_id_fkey(nickname, avatar_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit || 20)
      .then(function(result) {
        if (result.error) {
          console.error('[Notifications] 拉取失败:', result.error);
          return [];
        }
        return result.data || [];
      })
      .catch(function() { return []; });
  }

  function markAsRead(ids) {
    var sb = _getSb();
    if (!sb || !ids || !ids.length) return Promise.resolve();

    return sb.from('notifications')
      .update({ is_read: true })
      .in('id', ids)
      .then(function() {
        fetchUnreadCount();
      })
      .catch(function() { /* ignore */ });
  }

  function markAllRead() {
    var sb = _getSb();
    var user = _getCurrentUser();
    if (!sb || !user) return Promise.resolve();

    return sb.from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then(function() {
        fetchUnreadCount();
        _renderPanelContent();
      })
      .catch(function() { /* ignore */ });
  }

  function _levelColor(lv) {
    var colors = ['', '#9db2ab', '#31c47a', '#56a3ff', '#f0c04d', '#ef4f45'];
    return colors[lv] || '#9db2ab';
  }

  function _renderPanelContent() {
    var panel = document.getElementById('notificationPanel');
    if (!panel) return;

    fetchNotifications(20).then(function(notifications) {
      var html = '<div class="notification-header">'
        + '<span>通知</span>'
        + '<button class="notification-mark-all" id="markAllReadBtn">全部已读</button>'
        + '</div>';

      if (!notifications.length) {
        html += '<div class="notification-empty">暂无通知</div>';
      } else {
        html += '<div class="notification-list">';
        for (var i = 0; i < notifications.length; i++) {
          var n = notifications[i];
          var fromName = (n.from_user && n.from_user.nickname) ? n.from_user.nickname : '有人';
          var fromAvatar = (n.from_user && n.from_user.avatar_url) ? n.from_user.avatar_url : '⚽';
          var typeText = n.type === 'reply' ? '回复了你' : (n.type === 'like' ? '赞了你的帖子' : '提到了你');
          var readClass = n.is_read ? '' : ' unread';

          html += '<div class="notification-item' + readClass + '" data-id="' + n.id + '" data-post-id="' + (n.post_id || '') + '">'
            + '<span class="user-avatar sm">' + fromAvatar + '</span>'
            + '<div class="notification-text">'
            + '<strong>' + escapeHtml(fromName) + '</strong> ' + typeText
            + (n.content ? '<p class="notification-excerpt">' + escapeHtml(n.content) + '</p>' : '')
            + '</div>'
            + '<span class="notification-time">' + formatTime(n.created_at) + '</span>'
            + '</div>';
        }
        html += '</div>';
      }

      panel.innerHTML = html;

      // 绑定事件
      var markAllBtn = document.getElementById('markAllReadBtn');
      if (markAllBtn) {
        markAllBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          markAllRead();
        });
      }

      var items = panel.querySelectorAll('.notification-item');
      for (var j = 0; j < items.length; j++) {
        (function(item) {
          item.addEventListener('click', function() {
            var id = parseInt(item.dataset.id, 10);
            var postId = item.dataset.postId;
            // 标记已读
            markAsRead([id]);
            // 跳转
            if (postId) {
              window.location.href = 'community.html?post=' + postId;
            }
          });
        })(items[j]);
      }
    });
  }

  function togglePanel() {
    var panel = document.getElementById('notificationPanel');
    if (!panel) return;
    panelVisible = !panelVisible;
    if (panelVisible) {
      panel.style.display = 'block';
      _renderPanelContent();
    } else {
      panel.style.display = 'none';
    }
  }

  function _updateBadge() {
    var badges = document.querySelectorAll('.notification-badge');
    for (var i = 0; i < badges.length; i++) {
      badges[i].textContent = unreadCount > 99 ? '99+' : String(unreadCount);
      badges[i].style.display = unreadCount > 0 ? 'flex' : 'none';
    }
  }

  function initBell() {
    // 在 authArea 旁边注入铃铛
    var areas = ['authArea', 'authAreaMobile'];
    for (var a = 0; a < areas.length; a++) {
      var authArea = document.getElementById(areas[a]);
      if (!authArea) continue;
      // 避免重复注入
      if (authArea.parentElement.querySelector('.notification-bell')) continue;

      var bellHtml = '<span class="notification-bell" id="bell_' + areas[a] + '">'
        + '🔔'
        + '<span class="notification-badge" style="display:none">0</span>'
        + '</span>';

      var bellSpan = document.createElement('span');
      bellSpan.innerHTML = bellHtml;
      var bellEl = bellSpan.firstElementChild;
      authArea.parentElement.insertBefore(bellEl, authArea);

      // 绑定点击
      bellEl.addEventListener('click', function(e) {
        e.stopPropagation();
        togglePanel();
      });
    }

    // 注入通知面板（只一次）
    if (!document.getElementById('notificationPanel')) {
      var panelDiv = document.createElement('div');
      panelDiv.id = 'notificationPanel';
      panelDiv.className = 'notification-panel';
      panelDiv.style.display = 'none';
      document.body.appendChild(panelDiv);

      // 点击外部关闭
      document.addEventListener('click', function(e) {
        if (panelVisible && !e.target.closest('.notification-panel') && !e.target.closest('.notification-bell')) {
          panelVisible = false;
          document.getElementById('notificationPanel').style.display = 'none';
        }
      });
    }

    // 拉取未读数
    fetchUnreadCount();
  }

  function subscribe() {
    var sb = _getSb();
    var user = _getCurrentUser();
    if (!sb || !user) return;

    try {
      realtimeChannel = sb.channel('user-notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.' + user.id
        }, function() {
          // 收到新通知，刷新未读数
          fetchUnreadCount();
          if (panelVisible) {
            _renderPanelContent();
          }
        })
        .subscribe();
    } catch(e) {
      console.error('[Notifications] Realtime 订阅失败:', e);
    }
  }

  function unsubscribe() {
    var sb = _getSb();
    if (sb && realtimeChannel) {
      try {
        sb.removeChannel(realtimeChannel);
      } catch(e) { /* ignore */ }
      realtimeChannel = null;
    }
  }

  window.NotificationService = {
    fetchUnreadCount: fetchUnreadCount,
    fetchNotifications: fetchNotifications,
    markAsRead: markAsRead,
    markAllRead: markAllRead,
    initBell: initBell,
    togglePanel: togglePanel,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
})();
