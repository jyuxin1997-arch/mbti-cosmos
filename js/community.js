// === 社区模块 ===
(function() {
  var config = window.AppConfig;
  var currentFilter = 'all';
  var currentMatchKey = '';
  var posts = [];
  var repliesCache = {};
  var postOffset = 0;
  var hasMorePosts = true;
  var realtimeChannel = null;

  // ========== 引用公共工具 ==========
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;
  var showToast = window.Utils.showToast;
  var formatTime = window.Utils.formatTime;

  // ========== 超时包装 ==========
  var TIMEOUT_MS = 8000;
  function withTimeout(promise) {
    return Promise.race([
      promise,
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('请求超时，请检查网络')); }, TIMEOUT_MS);
      })
    ]);
  }

  // ========== 初始化 ==========
  function init() {
    if (!window.SupabaseClient || !window.SupabaseClient.isReady()) {
      $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">社区功能配置中，请稍后再试</div>';
      bindEventsOnly();
      return;
    }
    bindEvents();
    loadPosts();
    subscribeNewPosts();
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
    });

    $('postDetailModal').addEventListener('click', function(e) {
      if (e.target === $('postDetailModal')) $('postDetailModal').classList.remove('active');
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
      $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>';
    }

    var query = sb
      .from('posts')
      .select('*, profiles(nickname)')
      .order('created_at', { ascending: false })
      .range(postOffset, postOffset + config.POSTS_PER_PAGE - 1);

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
      if (append) {
        posts = posts.concat(newPosts);
      } else {
        posts = newPosts;
      }
      hasMorePosts = newPosts.length >= config.POSTS_PER_PAGE;
      renderPostList(posts);
      if (hasMorePosts) {
        $('loadMorePosts').style.display = 'block';
      } else {
        $('loadMorePosts').style.display = 'none';
      }
      postOffset = posts.length;
    }).catch(function(err) {
      console.error('[Community] 加载帖子异常:', err);
      $('postList').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">' + escapeHtml(err.message || '网络异常') + '<button onclick="window.CommunityService.retryLoad()" style="margin-left:8px;padding:4px 12px;border-radius:4px;background:var(--panel-2);color:var(--accent);cursor:pointer">重试</button></div>';
    });
  }

  function getPosts(category, matchKey, limit, offset) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return Promise.resolve([]);

    var query = sb
      .from('posts')
      .select('*, profiles(nickname)')
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (matchKey) {
      query = query.eq('match_key', matchKey);
    }

    var start = offset || 0;
    var end = start + (limit || config.POSTS_PER_PAGE) - 1;
    query = query.range(start, end);

    return query.then(function(result) {
      if (result.error) {
        console.error('[Community] getPosts 失败:', result.error);
        return [];
      }
      return result.data || [];
    }).catch(function(err) {
      console.error('[Community] getPosts 异常:', err);
      return [];
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
      var author = (post.profiles && post.profiles.nickname) ? post.profiles.nickname : '匿名';
      var matchLabel = post.match_key ? '⚽ ' + escapeHtml(post.match_key.replace(/_vs_/g, ' VS ')) : '';
      html += '<div class="post-card" data-id="' + post.id + '">'
        + '<div class="post-title">' + escapeHtml(post.title) + '</div>'
        + '<div class="post-meta">'
        + '<span>👤 ' + escapeHtml(author) + '</span>'
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
    if (!title) { showToast('请输入标题'); return; }
    if (!content) { showToast('请输入内容'); return; }

    var insertData = {
      author_id: user.id,
      title: title,
      content: content,
      match_key: matchKey || null,
      category: category || 'discussion'
    };

    sb.from('posts').insert(insertData).select('*, profiles(nickname)').single()
      .then(function(result) {
        if (result.error) {
          showToast('发帖失败: ' + result.error.message);
          return;
        }
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
  var currentOpenPostId = null;

  function openPostDetail(postId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;
    currentOpenPostId = postId;

    // 加载帖子详情
    sb.from('posts').select('*, profiles(nickname)').eq('id', postId).single()
      .then(function(postResult) {
        if (postResult.error || !postResult.data) {
          showToast('帖子不存在');
          return;
        }
        var post = postResult.data;
        // 加载回复
        getReplies(postId).then(function(replies) {
          renderPostDetail(post, replies);
          $('postDetailModal').classList.add('active');
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
      .select('*, profiles(nickname)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(function(result) {
        if (result.error) {
          console.error('[Community] 加载回复失败:', result.error);
          return [];
        }
        return result.data || [];
      })
      .catch(function(err) {
        console.error('[Community] 加载回复异常:', err);
        return [];
      });
  }

  function renderPostDetail(post, replies) {
    var author = (post.profiles && post.profiles.nickname) ? post.profiles.nickname : '匿名';
    $('detailPostTitle').textContent = post.title;
    $('detailPostMeta').innerHTML = '<span>👤 ' + escapeHtml(author) + '</span>'
      + '<span>🕐 ' + formatTime(post.created_at) + '</span>'
      + (post.match_key ? '<span>⚽ ' + escapeHtml(post.match_key.replace(/_vs_/g, ' VS ')) + '</span>' : '')
      + '<span>💬 ' + (post.replies_count || 0) + '</span>';
    $('detailPostBody').textContent = post.content;

    // 点赞按钮
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    var likedClass = '';
    if (user) {
      checkPostLiked(post.id, user.id).then(function(isLiked) {
        if (isLiked) {
          var btn = $('detailPostActions').querySelector('.like-btn');
          if (btn) btn.classList.add('liked');
        }
      });
    }
    $('detailPostActions').innerHTML = '<button class="like-btn' + likedClass + '" id="detailLikeBtn" data-post-id="' + post.id + '">❤️ ' + (post.likes_count || 0) + '</button>';

    // 绑定点赞
    var likeBtn = $('detailLikeBtn');
    if (likeBtn) {
      likeBtn.addEventListener('click', function() {
        togglePostLike(post.id);
      });
    }

    // 渲染回复
    renderReplies(replies);
  }

  function renderReplies(replies) {
    if (!replies || !replies.length) {
      $('replyList').innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">暂无回复</div>';
      return;
    }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    var html = '';
    for (var i = 0; i < replies.length; i++) {
      var r = replies[i];
      var rAuthor = (r.profiles && r.profiles.nickname) ? r.profiles.nickname : '匿名';
      html += '<div class="reply-item" data-reply-id="' + r.id + '">'
        + '<div class="reply-author">' + escapeHtml(rAuthor) + '</div>'
        + '<div class="reply-content">' + escapeHtml(r.content) + '</div>'
        + '<div style="display:flex;align-items:center;gap:12px;margin-top:4px">'
        + '<span class="reply-time">' + formatTime(r.created_at) + '</span>'
        + '<button class="like-btn" data-reply-id="' + r.id + '">❤️ ' + (r.likes_count || 0) + '</button>'
        + '</div>'
        + '</div>';
    }
    $('replyList').innerHTML = html;

    // 绑定回复点赞
    var replyLikeBtns = $('replyList').querySelectorAll('.like-btn');
    for (var j = 0; j < replyLikeBtns.length; j++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var replyId = parseInt(btn.dataset.replyId, 10);
          toggleReplyLike(replyId);
        });
      })(replyLikeBtns[j]);
    }
  }

  // ========== 创建回复 ==========
  function createReply(postId, content) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) { showToast('社区功能配置中'); return; }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    if (!user) { showToast('请先登录'); return; }
    if (!content) return;

    sb.from('replies').insert({
      post_id: postId,
      author_id: user.id,
      content: content
    }).select('*, profiles(nickname)').single()
      .then(function(result) {
        if (result.error) {
          showToast('回复失败: ' + result.error.message);
          return;
        }
        $('replyInput').value = '';
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

  // ========== 点赞 ==========
  function checkPostLiked(postId, userId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return Promise.resolve(false);

    return sb.from('post_likes')
      .select('user_id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle()
      .then(function(result) {
        return !!(result.data);
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
      .maybeSingle()
      .then(function(result) {
        return !!(result.data);
      })
      .catch(function() { return false; });
  }

  function togglePostLike(postId) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) { showToast('社区功能配置中'); return; }
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    if (!user) { showToast('请先登录'); return; }

    checkPostLiked(postId, user.id).then(function(isLiked) {
      if (isLiked) {
        // 取消点赞
        sb.from('post_likes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .then(function() {
            // 更新 UI
            var btn = $('detailLikeBtn');
            if (btn) {
              btn.classList.remove('liked');
              var count = parseInt(btn.textContent.replace(/[^0-9]/g, ''), 10) || 0;
              btn.textContent = '❤️ ' + Math.max(0, count - 1);
            }
            // 刷新帖子列表
            postOffset = 0;
            hasMorePosts = true;
            loadPosts();
          });
      } else {
        // 点赞
        sb.from('post_likes')
          .insert({ user_id: user.id, post_id: postId })
          .then(function() {
            var btn = $('detailLikeBtn');
            if (btn) {
              btn.classList.add('liked');
              var count = parseInt(btn.textContent.replace(/[^0-9]/g, ''), 10) || 0;
              btn.textContent = '❤️ ' + (count + 1);
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
            // 更新回复列表
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
  function subscribeNewPosts(category, callback) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return;

    try {
      realtimeChannel = sb.channel('community-posts')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'posts'
        }, function(payload) {
          // 新帖实时推送到列表顶部
          var newPost = payload.new;
          if (!newPost) return;
          // 如果当前筛选匹配，则刷新
          if (currentFilter === 'all' || newPost.category === currentFilter) {
            if (!currentMatchKey || newPost.match_key === currentMatchKey) {
              // 刷新列表
              postOffset = 0;
              hasMorePosts = true;
              loadPosts();
              if (callback) callback(newPost);
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

  // ========== 公开接口 ==========
  window.CommunityService = {
    init: init,
    getPosts: getPosts,
    createPost: createPost,
    getReplies: getReplies,
    createReply: createReply,
    togglePostLike: togglePostLike,
    toggleReplyLike: toggleReplyLike,
    openPostDetail: openPostDetail,
    subscribeNewPosts: subscribeNewPosts,
    unsubscribe: unsubscribe,
    // 额外暴露供 app.js 调用
    setMatchKey: function(key) {
      currentMatchKey = key || '';
      currentFilter = 'all';
      // 重置筛选按钮
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
    }
  };
})();
