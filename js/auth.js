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

    // 2. 查询 profiles 是否已有该手机号
    var profileResult = await sb
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;

    var existingProfile = profileResult.data;

    if (existingProfile) {
      // 老用户：更新 auth_uid 和 last_login（不修改 id，避免 FK 冲突）
      var updateResult = await sb
        .from('profiles')
        .update({ auth_uid: uid, last_login: new Date().toISOString() })
        .eq('phone', phone)
        .select()
        .single();
      if (updateResult.error) throw updateResult.error;
      currentUser = updateResult.data;
    } else {
      // 新用户：创建 profile，id 与 auth_uid 都设为匿名 uid
      var insertResult = await sb
        .from('profiles')
        .insert({ id: uid, auth_uid: uid, phone: phone, nickname: nickname, masked_phone: maskPhone(phone) })
        .select()
        .single();
      if (insertResult.error) throw insertResult.error;
      currentUser = insertResult.data;
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
          .maybeSingle();
        if (profileResult.data) {
          currentUser = profileResult.data;
          localStorage.setItem(config.CACHE_KEY_USER, JSON.stringify(currentUser));
          _fireAuthChange(currentUser);
          return currentUser;
        }
        // fallback: 通过 id 查找（兼容旧数据）
        profileResult = await sb
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        if (profileResult.data) {
          currentUser = profileResult.data;
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
