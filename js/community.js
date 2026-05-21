// === 社区模块（增强版） ===
(function() {
  var config = window.AppConfig;
  var currentFilter = 'all';
  var currentSort = 'latest';
  var currentMatchKey = '';
  var posts = [];
  var postOffset = 0;
  var hasMorePosts = true;
  var realtimeChannel = null;
  var currentOpenPostId = null;
  var replyingTo = null; // { id, nickname } 当前回复目标

  // ========== 引用公共工具 ==========
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;
  var showToast = window.Utils.showToast;
  var formatTime = window.Utils.formatTime;

  // ========== 超时包装 ==========
  var TIMEOUT_MS = 10000;
  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('请求超时，请检查网络')); }, TIMEOUT_MS);
      })
    ]);
  }

  // ========== 骨架屏 ==========
  function showSkeleton() {
    var html = '';
    for (var i = 0; i < 3; i++) {
      html += '<div class="post-card skeleton-card">'
        + '<div class="skeleton-line w60"></div>'
        + '<div class="skeleton-line w80"></div>'
        + '<div class="skeleton-line w40"></div>'
        + '</div>';
    }
    $('postList').innerHTML = html;
  }

  // ========== 等级计算 ==========
  function _calcLevel(user) {
    var score = (user.posts_count || 0) * 5 + (user.replies_count || 0) * 2 + (user.likes_received || 0) * 1;
    if (score >= 100) return 5;
    if (score >= 60) return 4;
    if (score >= 30) return 3;
    if (score >= 10) return 2;
    return 1;
  }

  function _levelColor(lv) {
    var colors = ['', '#9db2ab', '#31c47a', '#56a3ff', '#f0c04d', '#ef4f45'];
    return colors[lv] || '#9db2ab';
  }

  // ========== 头像渲染 ==========
  function _renderAvatar(avatarUrl, size) {
    if (window.Avatars && window.Avatars.render) {
      return window.Avatars.render(avatarUrl, size);
    }
    return '<span class="user-avatar ' + (size || 'sm') + '">' + (avatarUrl || '⚽') + '</span>';
  }

  // ========== 初始化 ==========
  function init() {
    if (!window.SupabaseClient || !window.SupabaseClient.isReady()) {
      $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">社区功能配置中，请稍后再试</div>';
      bindEventsOnly();
      return;
    }
    bindEvents();
    showSkeleton();
    loadPosts();
    subscribeNewPosts();
    applyUrlParams();

    // 页面卸载时清理 Realtime 订阅
    window.addEventListener('beforeunload', function() {
      unsubscribe();
    });
  }

  // ========== URL 参数处理 ==========
  function applyUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var matchKey = params.get('match_key');
    var postId = params.get('post');

    if (matchKey) {
      currentMatchKey = matchKey;
      currentFilter = 'all';
      var allBtns = $('communityFilters').querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].classList.toggle('active', allBtns[i].dataset.filter === 'all');
      }
      postOffset = 0;
      hasMorePosts = true;
      loadPosts();
    }

    if (postId) {
      var id = parseInt(postId, 10);
      if (!isNaN(id)) {
        openPostDetail(id);
      }
    }
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    // 发帖按钮
    $('btnNewPost').addEventListener('click', function() {
      if (!window.AuthService || !window.AuthService.isLoggedIn()) {
        if ($('loginModal')) $('loginModal').classList.add('show');
        showToast('请先登录');
        return;
      }
      $('newPostModal').classList.add('active');
    });

    // 关闭发帖弹窗
    $('closeNewPost').addEventListener('click', function() {
      $('newPostModal').classList.remove('active');
    });

    $('newPostModal').addEventListener('click', function(e) {
      if (e.target === $('newPostModal')) $('newPostModal').classList.remove('active');
    });

    // 提交帖子
    $('submitPost').addEventListener('click', function() {
      createPost(
        $('postTitle').value.trim(),
        $('postContent').value.trim(),
        $('postMatchKey').value.trim(),
        $('postCategory').value
      );
    });

    // 关闭帖子详情弹窗
    $('closePostDetail').addEventListener('click', function() {
      $('postDetailModal').classList.remove('active');
      clearReplyTarget();
    });

    $('postDetailModal').addEventListener('click', function(e) {
      if (e.target === $('postDetailModal')) {
        $('postDetailModal').classList.remove('active');
        clearReplyTarget();
      }
    });

    // 提交回复
    $('submitReply').addEventListener('click', function() {
      var content = $('replyInput').value.trim();
      if (!content) return;
      if (!window.AuthService || !window.AuthService.isLoggedIn()) {
        showToast('请先登录');
        return;
      }
      createReply(currentOpenPostId, content);
    });

    $('replyInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('submitReply').click();
      }
    });

    // 分类筛选
    $('communityFilters').addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn || !btn.dataset.filter) return;
      currentFilter = btn.dataset.filter;
      var allBtns = $('communityFilters').querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].classList.toggle('active', allBtns[i] === btn);
      }
      postOffset = 0;
      hasMorePosts = true;
      showSkeleton();
      loadPosts();
    });

    // 排序栏
    $('sortBar').addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn || !btn.dataset.sort) return;
      currentSort = btn.dataset.sort;
      var sortBtns = $('sortBar').querySelectorAll('button');
      for (var i = 0; i < sortBtns.length; i++) {
        sortBtns[i].classList.toggle('active', sortBtns[i] === btn);
      }
      postOffset = 0;
      hasMorePosts = true;
      showSkeleton();
      loadPosts();
    });

    // 加载更多
    var loadMoreBtn = $('loadMorePosts').querySelector('button');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function() {
        loadPosts(true);
      });
    }
  }

  // 未配置 Supabase 时仍绑定基础事件（防报错）
  function bindEventsOnly() {
    $('btnNewPost').addEventListener('click', function() {
      showToast('社区功能配置中');
    });
  }

  // ========== 帖子列表 ==========
  function loadPosts(append) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    if (!append) {
      showSkeleton();
    }

    var query = sb
      .from('posts')
      .select('*')
      .range(postOffset, postOffset + config.POSTS_PER_PAGE - 1);

    // 排序
    if (currentSort === 'hot') {
      query = query.order('hot_score', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else if (currentSort === 'pinned') {
      query = query.order('is_pinned', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // 分类筛选
    if (currentFilter && currentFilter !== 'all') {
      query = query.eq('category', currentFilter);
    }
    if (currentMatchKey) {
      query = query.eq('match_key', currentMatchKey);
    }

    withTimeout(query).then(function(result) {
      if (result.error) {
        console.error('[Community] 加载帖子失败:', result.error);
        $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">加载失败<button onclick="window.CommunityService.retryLoad()" style="margin-left:8px;padding:4px 12px;border-radius:4px;background:var(--panel-2);color:var(--accent);cursor:pointer">重试</button></div>';
        return;
      }
      var newPosts = result.data || [];
      // 批量查作者信息
      _enrichAuthors(newPosts).then(function(enriched) {
        if (append) {
          posts = posts.concat(enriched);
        } else {
          posts = enriched;
        }
        hasMorePosts = newPosts.length >= config.POSTS_PER_PAGE;
        renderPostList(posts);
        if (hasMorePosts) {
          $('loadMorePosts').style.display = 'block';
        } else {
          $('loadMorePosts').style.display = 'none';
        }
        postOffset = posts.length;
      });
    }).catch(function(err) {
      console.error('[Community] 加载帖子异常:', err);
      $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">' + escapeHtml(err.message || '网络异常') + '<button onclick="window.CommunityService.retryLoad()" style="margin-left:8px;padding:4px 12px;border-radius:4px;background:var(--panel-2);color:var(--accent);cursor:pointer">重试</button></div>';
    });
  }

  // ========== 批量查作者信息（避免FK嵌入歧义） ==========
  function _enrichAuthors(items) {
    if (!items || !items.length) return Promise.resolve(items);
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return Promise.resolve(items);

    var authorIds = [];
    var idSet = {};
    for (var i = 0; i < items.length; i++) {
      var aid = items[i].author_id;
      if (aid && !idSet[aid]) {
        idSet[aid] = true;
        authorIds.push(aid);
      }
    }
    if (!authorIds.length) return Promise.resolve(items);

    return sb.from('profiles')
      .select('id, nickname, avatar_url, level')
      .in('id', authorIds)
      .then(function(result) {
        var profileMap = {};
        if (result.data) {
          for (var j = 0; j < result.data.length; j++) {
            profileMap[result.data[j].id] = result.data[j];
          }
        }
        for (var k = 0; k < items.length; k++) {
          items[k].author = profileMap[items[k].author_id] || null;
        }
        return items;
      }).catch(function() {
        return items;
      });
  }

  // ========== 渲染帖子列表 ==========
  function renderPostList(postData) {
    if (!postData || !postData.length) {
      $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">暂无帖子，来发第一帖吧 ✍️</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < postData.length; i++) {
      var post = postData[i];
      var author = (post.author && post.author.nickname) ? post.author.nickname : '匿名';
      var avatarUrl = (post.author && post.author.avatar_url) ? post.author.avatar_url : '⚽';
      var authorLevel = (post.author && post.author.level) ? post.author.level : 1;
      var lvColor = _levelColor(authorLevel);
      var matchLabel = post.match_key ? '⚽ ' + escapeHtml(post.match_key.replace(/_vs_/g, ' VS ')) : '';
      var pinnedBadge = post.is_pinned ? '<span class="pinned-badge">📌 置顶</span>' : '';

      html += '<div class="post-card" data-id="' + post.id + '">'
        + pinnedBadge
        + '<div class="post-title">' + escapeHtml(post.title) + '</div>'
        + '<div class="post-meta">'
        + _renderAvatar(avatarUrl, 'sm')
        + '<span class="user-name">' + escapeHtml(author) + '</span>'
        + '<span class="level-badge" style="color:' + lvColor + ';border-color:' + lvColor + '">Lv' + authorLevel + '</span>'
        + '<span>🕐 ' + formatTime(post.created_at) + '</span>'
        + '<span>💬 ' + (post.replies_count || 0) + '</span>'
        + '<span>❤️ ' + (post.likes_count || 0) + '</span>'
        + (matchLabel ? '<span>' + matchLabel + '</span>' : '')
        + '</div>'
        + '<div class="post-excerpt">' + escapeHtml(post.content) + '</div>'
        + '</div>';
    }
    $('postList').innerHTML = html;

    // 绑定帖子卡片点击
    var cards = $('postList').querySelectorAll('.post-card');
    for (var j = 0; j < cards.length; j++) {
      (function(card) {
        card.addEventListener('click', function() {
          var id = parseInt(card.dataset.id, 10);
          openPostDetail(id);
        });
      })(cards[j]);
    }
  }

  // ========== 创建帖子 ==========
  function createPost(title, content, matchKey, category) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) { showToast('社区功能配置中'); return; }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    if (!user) { showToast('请先登录'); return; }

    // 内容过滤校验
    if (window.ContentFilter) {
      var validation = ContentFilter.validatePost(title, content);
      if (!validation.ok) {
        showToast(validation.msg);
        return;
      }
      // 频率限制
      var rateCheck = ContentFilter.checkRateLimit('post');
      if (!rateCheck.ok) {
        showToast('操作太频繁，请' + rateCheck.waitSec + '秒后再试');
        return;
      }
    }

    if (!title) { showToast('请输入标题'); return; }
    if (!content) { showToast('请输入内容'); return; }

    var insertData = {
      author_id: user.id,
      title: title,
      content: content,
      match_key: matchKey || null,
      category: category || 'discussion'
    };

    sb.from('posts').insert(insertData)
      .then(function(result) {
        if (result.error) {
          showToast('发帖失败: ' + result.error.message);
          return;
        }
        // 记录频率
        if (window.ContentFilter) ContentFilter.recordAction('post');
        // 关闭弹窗
        $('newPostModal').classList.remove('active');
        $('postTitle').value = '';
        $('postContent').value = '';
        $('postMatchKey').value = '';
        $('postCategory').value = 'discussion';
        showToast('发帖成功！');
        // 刷新列表
        postOffset = 0;
        hasMorePosts = true;
        loadPosts();
      })
      .catch(function(err) {
        showToast('发帖异常');
        console.error('[Community] 发帖异常:', err);
      });
  }

  // ========== 帖子详情 ==========
  function openPostDetail(postId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;
    currentOpenPostId = postId;
    clearReplyTarget();

    // 加载帖子详情
    sb.from('posts').select('*').eq('id', postId).limit(1)
      .then(function(postResult) {
        if (postResult.error || !postResult.data || !postResult.data.length) {
          showToast('帖子不存在');
          return;
        }
        var post = postResult.data[0];
        // 加载回复
        getReplies(postId).then(function(replies) {
          // 查作者信息
          _enrichAuthors([post]).then(function() {
            renderPostDetail(post, replies);
            $('postDetailModal').classList.add('active');
          });
        });
      })
      .catch(function(err) {
        showToast('加载帖子失败');
        console.error('[Community] 加载详情异常:', err);
      });
  }

  function getReplies(postId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return Promise.resolve([]);

    return sb.from('replies')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(function(result) {
        if (result.error) {
          console.error('[Community] 加载回复失败:', result.error);
          return [];
        }
        var replies = result.data || [];
        return _enrichAuthors(replies).then(function() { return replies; });
      })
      .catch(function(err) {
        console.error('[Community] 加载回复异常:', err);
        return [];
      });
  }

  function renderPostDetail(post, replies) {
    var author = (post.author && post.author.nickname) ? post.author.nickname : '匿名';
    var avatarUrl = (post.author && post.author.avatar_url) ? post.author.avatar_url : '⚽';
    var authorLevel = (post.author && post.author.level) ? post.author.level : 1;
    var lvColor = _levelColor(authorLevel);
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;

    $('detailPostTitle').textContent = post.title;
    $('detailPostMeta').innerHTML = _renderAvatar(avatarUrl, 'md')
      + '<span class="user-name">' + escapeHtml(author) + '</span>'
      + '<span class="level-badge" style="color:' + lvColor + ';border-color:' + lvColor + '">Lv' + authorLevel + '</span>'
      + '<span>🕐 ' + formatTime(post.created_at) + '</span>'
      + (post.match_key ? '<span>⚽ ' + escapeHtml(post.match_key.replace(/_vs_/g, ' VS ')) + '</span>' : '')
      + '<span>💬 ' + (post.replies_count || 0) + '</span>';
    $('detailPostBody').textContent = post.content;

    // 帖子操作区：点赞 + 帖主操作（编辑/删除）
    var actionsHtml = '<button class="like-btn" id="detailLikeBtn" data-post-id="' + post.id + '">❤️ ' + (post.likes_count || 0) + '</button>';

    // 帖主操作
    if (user && user.id === post.author_id) {
      actionsHtml += '<div class="post-owner-actions">'
        + '<button class="btn-edit" id="btnEditPost" data-post-id="' + post.id + '">✏️ 编辑</button>'
        + '<button class="btn-delete" id="btnDeletePost" data-post-id="' + post.id + '">🗑 删除</button>'
        + '</div>';
    }
    $('detailPostActions').innerHTML = actionsHtml;

    // 点赞状态
    if (user) {
      checkPostLiked(post.id, user.id).then(function(isLiked) {
        if (isLiked) {
          var btn = $('detailLikeBtn');
          if (btn) btn.classList.add('liked');
        }
      });
    }

    // 绑定点赞
    var likeBtn = $('detailLikeBtn');
    if (likeBtn) {
      likeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        togglePostLike(post.id);
      });
    }

    // 绑定编辑/删除
    var editBtn = $('btnEditPost');
    var deleteBtn = $('btnDeletePost');
    if (editBtn) {
      editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        editPost(post);
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        deletePost(post.id);
      });
    }

    // 渲染回复
    renderReplies(replies);
  }

  // ========== 嵌套回复渲染 ==========
  function renderReplies(replies) {
    if (!replies || !replies.length) {
      $('replyList').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">暂无回复</div>';
      return;
    }

    // 构建树：顶层回复 + 嵌套子回复
    var topLevel = [];
    var childrenMap = {};
    for (var i = 0; i < replies.length; i++) {
      var r = replies[i];
      if (!r.parent_reply_id) {
        topLevel.push(r);
      } else {
        if (!childrenMap[r.parent_reply_id]) {
          childrenMap[r.parent_reply_id] = [];
        }
        childrenMap[r.parent_reply_id].push(r);
      }
    }

    var html = '';
    for (var j = 0; j < topLevel.length; j++) {
      html += _renderReplyItem(topLevel[j], childrenMap, 0);
    }
    $('replyList').innerHTML = html;
    _bindReplyEvents();
  }

  function _renderReplyItem(reply, childrenMap, depth) {
    var rAuthor = (reply.author && reply.author.nickname) ? reply.author.nickname : '匿名';
    var avatarUrl = (reply.author && reply.author.avatar_url) ? reply.author.avatar_url : '⚽';
    var authorLevel = (reply.author && reply.author.level) ? reply.author.level : 1;
    var lvColor = _levelColor(authorLevel);
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    var nestedClass = depth > 0 ? ' reply-nested' : '';

    var html = '<div class="reply-item' + nestedClass + '" data-reply-id="' + reply.id + '">'
      + '<div class="reply-header">'
      + _renderAvatar(avatarUrl, 'sm')
      + '<span class="user-name">' + escapeHtml(rAuthor) + '</span>'
      + '<span class="level-badge" style="color:' + lvColor + ';border-color:' + lvColor + '">Lv' + authorLevel + '</span>'
      + '<span class="reply-time">' + formatTime(reply.created_at) + '</span>'
      + '</div>'
      + '<div class="reply-content">' + escapeHtml(reply.content) + '</div>'
      + '<div class="reply-actions">';

    // 回复按钮
    html += '<button class="btn-reply-to" data-reply-id="' + reply.id + '" data-nickname="' + escapeHtml(rAuthor) + '">💬 回复</button>';

    // 点赞
    html += '<button class="like-btn" data-reply-id="' + reply.id + '">❤️ ' + (reply.likes_count || 0) + '</button>';

    // 帖主操作
    if (user && user.id === reply.author_id) {
      html += '<button class="btn-edit" data-edit-reply="' + reply.id + '">✏️</button>'
        + '<button class="btn-delete" data-delete-reply="' + reply.id + '">🗑</button>';
    }

    html += '</div>';

    // 递归渲染子回复（最多2层）
    if (depth < 1 && childrenMap[reply.id]) {
      var children = childrenMap[reply.id];
      for (var c = 0; c < children.length; c++) {
        html += _renderReplyItem(children[c], childrenMap, depth + 1);
      }
    }

    html += '</div>';
    return html;
  }

  function _bindReplyEvents() {
    // 回复按钮
    var replyToBtns = $('replyList').querySelectorAll('.btn-reply-to');
    for (var i = 0; i < replyToBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var replyId = parseInt(btn.dataset.replyId, 10);
          var nickname = btn.dataset.nickname || '匿名';
          setReplyTarget(replyId, nickname);
        });
      })(replyToBtns[i]);
    }

    // 回复点赞
    var likeBtns = $('replyList').querySelectorAll('.like-btn[data-reply-id]');
    for (var j = 0; j < likeBtns.length; j++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var replyId = parseInt(btn.dataset.replyId, 10);
          toggleReplyLike(replyId);
        });
      })(likeBtns[j]);
    }

    // 编辑回复
    var editReplyBtns = $('replyList').querySelectorAll('[data-edit-reply]');
    for (var k = 0; k < editReplyBtns.length; k++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var replyId = parseInt(btn.dataset.editReply, 10);
          editReply(replyId);
        });
      })(editReplyBtns[k]);
    }

    // 删除回复
    var deleteReplyBtns = $('replyList').querySelectorAll('[data-delete-reply]');
    for (var m = 0; m < deleteReplyBtns.length; m++) {
      (function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var replyId = parseInt(btn.dataset.deleteReply, 10);
          deleteReply(replyId);
        });
      })(deleteReplyBtns[m]);
    }
  }

  // ========== 回复目标（嵌套回复） ==========
  function setReplyTarget(replyId, nickname) {
    replyingTo = { id: replyId, nickname: nickname };
    var target = $('replyTarget');
    if (target) {
      target.style.display = 'inline-block';
      target.innerHTML = '回复 <strong>' + escapeHtml(nickname) + '</strong> <span id="clearReplyTarget" style="cursor:pointer;color:var(--accent);margin-left:4px">✕</span>';
      $('replyInput').placeholder = '回复 ' + nickname + '...';
      $('replyInput').focus();

      var clearBtn = $('clearReplyTarget');
      if (clearBtn) {
        clearBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          clearReplyTarget();
        });
      }
    }
  }

  function clearReplyTarget() {
    replyingTo = null;
    var target = $('replyTarget');
    if (target) {
      target.style.display = 'none';
      target.innerHTML = '';
    }
    var input = $('replyInput');
    if (input) {
      input.placeholder = '写下你的回复...';
    }
  }

  // ========== 创建回复 ==========
  function createReply(postId, content) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) { showToast('社区功能配置中'); return; }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    if (!user) { showToast('请先登录'); return; }
    if (!content) return;

    // 内容过滤
    if (window.ContentFilter) {
      var validation = ContentFilter.validateReply(content);
      if (!validation.ok) {
        showToast(validation.msg);
        return;
      }
      var rateCheck = ContentFilter.checkRateLimit('reply');
      if (!rateCheck.ok) {
        showToast('操作太频繁，请' + rateCheck.waitSec + '秒后再试');
        return;
      }
    }

    var insertData = {
      post_id: postId,
      author_id: user.id,
      content: content
    };

    // 嵌套回复：如果有回复目标
    if (replyingTo && replyingTo.id) {
      insertData.parent_reply_id = replyingTo.id;
    }

    sb.from('replies').insert(insertData)
      .then(function(result) {
        if (result.error) {
          showToast('回复失败: ' + result.error.message);
          return;
        }
        // 记录频率
        if (window.ContentFilter) ContentFilter.recordAction('reply');
        $('replyInput').value = '';
        clearReplyTarget();
        showToast('回复成功！');
        // 刷新回复列表
        getReplies(postId).then(function(replies) {
          renderReplies(replies);
        });
        // 更新帖子列表中的回复数
        postOffset = 0;
        hasMorePosts = true;
        loadPosts();
      })
      .catch(function(err) {
        showToast('回复异常');
        console.error('[Community] 回复异常:', err);
      });
  }

  // ========== 编辑帖子 ==========
  function editPost(post) {
    var newTitle = window.prompt('编辑标题', post.title);
    if (newTitle === null) return;
    var newContent = window.prompt('编辑内容', post.content);
    if (newContent === null) return;

    newTitle = newTitle.trim();
    newContent = newContent.trim();

    if (!newTitle || !newContent) {
      showToast('标题和内容不能为空');
      return;
    }

    // 内容过滤
    if (window.ContentFilter) {
      var validation = ContentFilter.validatePost(newTitle, newContent);
      if (!validation.ok) {
        showToast(validation.msg);
        return;
      }
    }

    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    sb.from('posts').update({ title: newTitle, content: newContent })
      .eq('id', post.id)
      .then(function(result) {
        if (result.error) {
          showToast('编辑失败: ' + result.error.message);
          return;
        }
        showToast('编辑成功！');
        // 重新加载详情
        openPostDetail(post.id);
        // 刷新列表
        postOffset = 0;
        hasMorePosts = true;
        loadPosts();
      })
      .catch(function(err) {
        showToast('编辑异常');
        console.error('[Community] 编辑帖子异常:', err);
      });
  }

  // ========== 删除帖子 ==========
  function deletePost(postId) {
    if (!window.confirm('确定要删除这篇帖子吗？删除后不可恢复。')) return;

    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    sb.from('posts').delete().eq('id', postId)
      .then(function(result) {
        if (result.error) {
          showToast('删除失败: ' + result.error.message);
          return;
        }
        showToast('帖子已删除');
        $('postDetailModal').classList.remove('active');
        clearReplyTarget();
        postOffset = 0;
        hasMorePosts = true;
        loadPosts();
      })
      .catch(function(err) {
        showToast('删除异常');
        console.error('[Community] 删除帖子异常:', err);
      });
  }

  // ========== 编辑回复 ==========
  function editReply(replyId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    // 先获取当前回复内容
    sb.from('replies').select('content').eq('id', replyId).limit(1)
      .then(function(result) {
        if (result.error || !result.data || !result.data.length) {
          showToast('回复不存在');
          return;
        }
        var newContent = window.prompt('编辑回复', result.data[0].content);
        if (newContent === null) return;
        newContent = newContent.trim();
        if (!newContent) {
          showToast('回复不能为空');
          return;
        }

        // 内容过滤
        if (window.ContentFilter) {
          var validation = ContentFilter.validateReply(newContent);
          if (!validation.ok) {
            showToast(validation.msg);
            return;
          }
        }

        sb.from('replies').update({ content: newContent }).eq('id', replyId)
          .then(function(updateResult) {
            if (updateResult.error) {
              showToast('编辑失败');
              return;
            }
            showToast('回复已更新');
            // 刷新回复列表
            if (currentOpenPostId) {
              getReplies(currentOpenPostId).then(function(replies) {
                renderReplies(replies);
              });
            }
          });
      })
      .catch(function(err) {
        showToast('编辑异常');
        console.error('[Community] 编辑回复异常:', err);
      });
  }

  // ========== 删除回复 ==========
  function deleteReply(replyId) {
    if (!window.confirm('确定要删除这条回复吗？')) return;

    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    sb.from('replies').delete().eq('id', replyId)
      .then(function(result) {
        if (result.error) {
          showToast('删除失败');
          return;
        }
        showToast('回复已删除');
        // 刷新回复列表
        if (currentOpenPostId) {
          getReplies(currentOpenPostId).then(function(replies) {
            renderReplies(replies);
          });
        }
      })
      .catch(function(err) {
        showToast('删除异常');
        console.error('[Community] 删除回复异常:', err);
      });
  }

  // ========== 点赞 ==========
  function checkPostLiked(postId, userId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return Promise.resolve(false);

    return sb.from('post_likes')
      .select('user_id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .limit(1)
      .then(function(result) {
        return !!(result.data && result.data.length > 0);
      })
      .catch(function() { return false; });
  }

  function checkReplyLiked(replyId, userId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return Promise.resolve(false);

    return sb.from('reply_likes')
      .select('user_id')
      .eq('user_id', userId)
      .eq('reply_id', replyId)
      .limit(1)
      .then(function(result) {
        return !!(result.data && result.data.length > 0);
      })
      .catch(function() { return false; });
  }

  function togglePostLike(postId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) { showToast('社区功能配置中'); return; }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    if (!user) { showToast('请先登录'); return; }

    checkPostLiked(postId, user.id).then(function(isLiked) {
      var likeBtn = $('detailLikeBtn');
      if (isLiked) {
        sb.from('post_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .then(function() {
            if (likeBtn) {
              likeBtn.classList.remove('liked');
              var count = parseInt(likeBtn.textContent.replace(/[^0-9]/g, ''), 10) || 0;
              likeBtn.textContent = '❤️ ' + Math.max(0, count - 1);
            }
            postOffset = 0;
            hasMorePosts = true;
            loadPosts();
          });
      } else {
        sb.from('post_likes')
          .insert({ user_id: user.id, post_id: postId })
          .then(function() {
            if (likeBtn) {
              likeBtn.classList.add('liked');
              likeBtn.classList.add('bouncing');
              setTimeout(function() { likeBtn.classList.remove('bouncing'); }, 400);
              var count = parseInt(likeBtn.textContent.replace(/[^0-9]/g, ''), 10) || 0;
              likeBtn.textContent = '❤️ ' + (count + 1);
            }
            postOffset = 0;
            hasMorePosts = true;
            loadPosts();
          });
      }
    });
  }

  function toggleReplyLike(replyId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) { showToast('社区功能配置中'); return; }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    if (!user) { showToast('请先登录'); return; }

    checkReplyLiked(replyId, user.id).then(function(isLiked) {
      if (isLiked) {
        sb.from('reply_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('reply_id', replyId)
          .then(function() {
            if (currentOpenPostId) {
              getReplies(currentOpenPostId).then(function(replies) {
                renderReplies(replies);
              });
            }
          });
      } else {
        sb.from('reply_likes')
          .insert({ user_id: user.id, reply_id: replyId })
          .then(function() {
            if (currentOpenPostId) {
              getReplies(currentOpenPostId).then(function(replies) {
                renderReplies(replies);
              });
            }
          });
      }
    });
  }

  // ========== Realtime 订阅 ==========
  function subscribeNewPosts() {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    try {
      realtimeChannel = sb.channel('community-posts')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'posts'
        }, function(payload) {
          var newPost = payload.new;
          if (!newPost) return;
          if (currentFilter === 'all' || newPost.category === currentFilter) {
            if (!currentMatchKey || newPost.match_key === currentMatchKey) {
              postOffset = 0;
              hasMorePosts = true;
              loadPosts();
            }
          }
        })
        .subscribe();
    } catch(e) {
      console.error('[Community] Realtime 订阅失败:', e);
    }
  }

  function unsubscribe() {
    var sb = window.SupabaseClient.getInstance();
    if (sb && realtimeChannel) {
      try {
        sb.removeChannel(realtimeChannel);
      } catch(e) { /* ignore */ }
      realtimeChannel = null;
    }
  }

  // ========== DOMContentLoaded 自初始化 ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ========== 公开接口 ==========
  window.CommunityService = {
    init: init,
    createPost: createPost,
    getReplies: getReplies,
    createReply: createReply,
    togglePostLike: togglePostLike,
    toggleReplyLike: toggleReplyLike,
    openPostDetail: openPostDetail,
    subscribeNewPosts: subscribeNewPosts,
    unsubscribe: unsubscribe,
    setMatchKey: function(key) {
      currentMatchKey = key || '';
      currentFilter = 'all';
      var allBtns = $('communityFilters').querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].classList.toggle('active', allBtns[i].dataset.filter === 'all');
      }
      postOffset = 0;
      hasMorePosts = true;
      loadPosts();
    },
    resetFilter: function() {
      currentMatchKey = '';
      currentFilter = 'all';
      var allBtns = $('communityFilters').querySelectorAll('button');
      for (var i = 0; i < allBtns.length; i++) {
        allBtns[i].classList.toggle('active', allBtns[i].dataset.filter === 'all');
      }
      postOffset = 0;
      hasMorePosts = true;
      loadPosts();
    },
    retryLoad: function() {
      postOffset = 0;
      hasMorePosts = true;
      loadPosts();
    },
    applyUrlParams: applyUrlParams
  };
})();
