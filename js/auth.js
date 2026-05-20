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

    // 1. 查询 profiles 是否已有该手机号
    var result1 = await sb
      .from('profiles')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    var existingProfile = result1.data;
    var queryError = result1.error;
    if (queryError) throw queryError;

    // 2. 匿名登录获取 uid
    var result2 = await sb.auth.signInAnonymously();
    var authData = result2.data;
    var authError = result2.error;
    if (authError) throw authError;

    var uid = authData.user.id;

    if (existingProfile) {
      // 老用户：更新 last_login，同步 uid（重要：匿名登录每次设备 uid 不同，需更新）
      var result3 = await sb
        .from('profiles')
        .update({ last_login: new Date().toISOString(), id: uid })
        .eq('phone', phone);
      var updateError = result3.error;
      // 注意：如果 uid 冲突（已有该 uid 的 profile），需要先删除旧 uid 的 profile
      // 但这种情况极少，MVP 阶段暂不处理
      if (updateError) {
        // 回退：只更新 last_login，不改 uid
        await sb.from('profiles').update({ last_login: new Date().toISOString() }).eq('phone', phone);
      }
      currentUser = Object.assign({}, existingProfile, { id: uid, last_login: new Date().toISOString() });
    } else {
      // 新用户：创建 profile
      var result4 = await sb
        .from('profiles')
        .insert({ id: uid, phone: phone, nickname: nickname, masked_phone: maskPhone(phone) })
        .select()
        .single();
      var newProfile = result4.data;
      var insertError = result4.error;
      if (insertError) throw insertError;
      currentUser = newProfile;
    }

    // 保存到 localStorage
    localStorage.setItem(config.CACHE_KEY_USER, JSON.stringify(currentUser));
    _fireAuthChange(currentUser);
    return currentUser;
  }

  async function logout() {
    var sb = window.SupabaseClient.getInstance();
    if (sb) {
      await sb.auth.signOut();
    }
    currentUser = null;
    localStorage.removeItem(config.CACHE_KEY_USER);
    _fireAuthChange(null);
  }

  async function restoreSession() {
    // 优先从 localStorage 恢复
    var cached = localStorage.getItem(config.CACHE_KEY_USER);
    if (cached) {
      try {
        currentUser = JSON.parse(cached);
        _fireAuthChange(currentUser);
        return currentUser;
      } catch(e) { /* ignore */ }
    }

    // 尝试从 Supabase session 恢复
    var sb = window.SupabaseClient.getInstance();
    if (!sb) return null;

    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;
    if (session && session.user) {
      var profileResult = await sb
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      var profile = profileResult.data;
      if (profile) {
        currentUser = profile;
        localStorage.setItem(config.CACHE_KEY_USER, JSON.stringify(currentUser));
        _fireAuthChange(currentUser);
        return currentUser;
      }
    }
    return null;
  }

  function getCurrentUser() { return currentUser; }
  function isLoggedIn() { return !!currentUser; }

  function onAuthChange(callback) {
    authChangeCallbacks.push(callback);
    // 立即回调一次当前状态
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
