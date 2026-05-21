// === 认证服务 ===
(function() {
  var config = window.AppConfig;
  var currentUser = null;
  var authChangeCallbacks = [];

  function maskPhone(phone) {
    if (!phone || phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }

  async function login(phone, nickname) {
    var sb = window.SupabaseClient.getInstance();
    if (!sb) throw new Error('Supabase 未配置');

    // 1. 匿名登录获取 uid
    var authResult = await sb.auth.signInAnonymously();
    var authError = authResult.error;
    if (authError) {
      // 如果匿名认证未开启，给出明确提示
      if (authError.message && authError.message.indexOf('not allowed') !== -1) {
        throw new Error('匿名登录未开启，请在 Supabase Dashboard → Authentication → Providers 中启用 Anonymous Sign-ins');
      }
      throw authError;
    }
    var uid = authResult.data.user.id;

    // 2. 查询 profiles 是否已有该手机号（用 limit(1) 防止重复记录报错）
    var profileResult = await sb
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .limit(1);
    if (profileResult.error) throw profileResult.error;

    var existingProfile = (profileResult.data && profileResult.data.length > 0) ? profileResult.data[0] : null;

    if (existingProfile) {
      // 老用户：通过 SECURITY DEFINER RPC 更新 auth_uid（绕过 RLS 循环依赖）
      try {
        var rpcResult = await sb.rpc('login_update_auth_uid', {
          p_profile_id: existingProfile.id,
          p_auth_uid: uid
        });
        if (rpcResult.error) {
          console.warn('[Auth] RPC 更新 auth_uid 失败:', rpcResult.error);
          // fallback: 尝试直接 UPDATE（首次登录后 auth_uid 可能已匹配）
          var fallbackResult = await sb
            .from('profiles')
            .select('*')
            .eq('id', existingProfile.id)
            .limit(1);
          currentUser = (fallbackResult.data && fallbackResult.data.length > 0) ? fallbackResult.data[0] : existingProfile;
        } else {
          currentUser = (rpcResult.data && rpcResult.data.length > 0) ? rpcResult.data[0] : existingProfile;
        }
      } catch(rpcErr) {
        console.warn('[Auth] RPC 调用异常:', rpcErr);
        currentUser = existingProfile;
      }
    } else {
      // 新用户：创建 profile，id 与 auth_uid 都设为匿名 uid
      var avatarUrl = (window.Avatars && window.Avatars.random) ? window.Avatars.random() : '⚽';
      var insertResult = await sb
        .from('profiles')
        .insert({ id: uid, auth_uid: uid, phone: phone, nickname: nickname, masked_phone: maskPhone(phone), avatar_url: avatarUrl })
        .select();
      if (insertResult.error) throw insertResult.error;
      currentUser = (insertResult.data && insertResult.data.length > 0) ? insertResult.data[0] : null;
    }

    // 保存到 localStorage
    localStorage.setItem(config.CACHE_KEY_USER, JSON.stringify(currentUser));
    _fireAuthChange(currentUser);
    return currentUser;
  }

  async function logout() {
    var sb = window.SupabaseClient.getInstance();
    if (sb) {
      try { await sb.auth.signOut(); } catch(e) { /* ignore */ }
    }
    currentUser = null;
    localStorage.removeItem(config.CACHE_KEY_USER);
    _fireAuthChange(null);
  }

  async function restoreSession() {
    // 优先从 localStorage 恢复（快速显示）
    var cached = localStorage.getItem(config.CACHE_KEY_USER);
    if (cached) {
      try {
        currentUser = JSON.parse(cached);
        _fireAuthChange(currentUser);
      } catch(e) { /* ignore */ }
    }

    // 尝试从 Supabase session 恢复（验证有效性）
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return currentUser;

    try {
      var sessionResult = await sb.auth.getSession();
      var session = sessionResult.data.session;
      if (session && session.user) {
        // 先通过 auth_uid 查找
        var profileResult = await sb
          .from('profiles')
          .select('*')
          .eq('auth_uid', session.user.id)
          .limit(1);
        if (profileResult.data && profileResult.data.length > 0) {
          currentUser = profileResult.data[0];
          localStorage.setItem(config.CACHE_KEY_USER, JSON.stringify(currentUser));
          _fireAuthChange(currentUser);
          return currentUser;
        }
        // fallback: 通过 id 查找（兼容旧数据）
        profileResult = await sb
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .limit(1);
        if (profileResult.data && profileResult.data.length > 0) {
          currentUser = profileResult.data[0];
          localStorage.setItem(config.CACHE_KEY_USER, JSON.stringify(currentUser));
          _fireAuthChange(currentUser);
          return currentUser;
        }
      }
    } catch(e) {
      console.warn('[Auth] 恢复会话失败:', e);
    }
    return currentUser;
  }

  function getCurrentUser() { return currentUser; }
  function isLoggedIn() { return !!currentUser; }

  function onAuthChange(callback) {
    authChangeCallbacks.push(callback);
    if (currentUser) callback(currentUser);
  }

  function _fireAuthChange(user) {
    authChangeCallbacks.forEach(function(cb) {
      try { cb(user); } catch(e) { console.error(e); }
    });
  }

  window.AuthService = {
    login: login,
    logout: logout,
    restoreSession: restoreSession,
    getCurrentUser: getCurrentUser,
    isLoggedIn: isLoggedIn,
    onAuthChange: onAuthChange
  };
})();
