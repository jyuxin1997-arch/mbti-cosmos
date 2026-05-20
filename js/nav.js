// === 导航服务（公共层） ===
(function() {
  var $ = window.Utils.$;
  var escapeHtml = window.Utils.escapeHtml;
  var showToast = window.Utils.showToast;

  /**
   * 动态注入登录弹窗 HTML 到页面 body
   * 如果页面已有 #loginModal 则跳过
   */
  function injectLoginModal() {
    if (document.getElementById('loginModal')) return;
    var div = document.createElement('div');
    div.innerHTML =
      '<div class="login-modal" id="loginModal">'
      + '<div class="login-card">'
      + '<h3>\uD83D\uDCF1 手机号登录</h3>'
      + '<p>输入手机号和昵称即可参与讨论</p>'
      + '<div class="field">'
      + '<label>手机号</label>'
      + '<input type="tel" id="loginPhone" placeholder="请输入手机号" maxlength="11" pattern="[0-9]*">'
      + '</div>'
      + '<div class="field">'
      + '<label>昵称</label>'
      + '<input type="text" id="loginNickname" placeholder="给自己取个名字" maxlength="12">'
      + '</div>'
      + '<button class="login-submit" id="loginSubmitBtn">登录</button>'
      + '<button class="close-login" id="closeLogin">取消</button>'
      + '</div>'
      + '</div>';
    document.body.appendChild(div.firstElementChild);
  }

  /**
   * 根据当前页面 pathname 设置导航高亮
   * 为 topbar nav / mobile-nav / tab-bar 中匹配的 <a> 添加 .active 类
   */
  function setActiveNav() {
    var path = window.location.pathname;
    var page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

    var navLinks = document.querySelectorAll('#mainNav a, #mobileNav a, .tab-bar a');
    for (var i = 0; i < navLinks.length; i++) {
      var href = navLinks[i].getAttribute('href') || '';
      navLinks[i].classList.toggle('active', href === page);
    }
  }

  /**
   * 绑定汉堡菜单点击事件，切换移动端导航显示
   */
  function setupHamburger() {
    var hamburger = document.getElementById('hamburger');
    var mobileNav = document.getElementById('mobileNav');
    if (!hamburger || !mobileNav) return;

    hamburger.addEventListener('click', function() {
      mobileNav.classList.toggle('show');
    });

    // 点击移动端导航链接后自动收起
    var mobileLinks = mobileNav.querySelectorAll('a');
    for (var i = 0; i < mobileLinks.length; i++) {
      mobileLinks[i].addEventListener('click', function() {
        mobileNav.classList.remove('show');
      });
    }
  }

  /**
   * 渲染认证 UI（登录按钮或用户信息+退出）
   * @param {Object|null} user - 当前用户对象，null 表示未登录
   */
  function renderAuthUI(user) {
    var html = user
      ? '<div class="auth-user"><div class="avatar">' + (user.nickname || '?')[0] + '</div><span>' + escapeHtml(user.nickname) + '</span><span class="logout" id="logoutBtn">退出</span></div>'
      : '<button class="auth-login-btn" id="navLoginBtn">登录</button>';

    var authArea = document.getElementById('authArea');
    var authAreaMobile = document.getElementById('authAreaMobile');
    if (authArea) authArea.innerHTML = html;
    if (authAreaMobile) authAreaMobile.innerHTML = html;

    // 绑定登录/登出按钮事件
    var loginBtn = document.getElementById('navLoginBtn');
    var logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', function() {
        var modal = document.getElementById('loginModal');
        if (modal) modal.classList.add('show');
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function() {
        if (window.AuthService) {
          window.AuthService.logout();
        }
      });
    }
  }

  /**
   * 绑定登录弹窗相关事件
   */
  function setupLoginEvents() {
    var loginModal = document.getElementById('loginModal');
    var closeLogin = document.getElementById('closeLogin');
    var loginSubmitBtn = document.getElementById('loginSubmitBtn');
    var loginPhone = document.getElementById('loginPhone');

    if (closeLogin) {
      closeLogin.addEventListener('click', function() {
        if (loginModal) loginModal.classList.remove('show');
      });
    }
    if (loginModal) {
      loginModal.addEventListener('click', function(e) {
        if (e.target === loginModal) loginModal.classList.remove('show');
      });
    }
    if (loginSubmitBtn) {
      loginSubmitBtn.addEventListener('click', handleLogin);
    }
    if (loginPhone) {
      loginPhone.addEventListener('input', function(e) {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
    }
  }

  /**
   * 处理登录提交
   * 优先使用 AuthService（Supabase），降级为本地 localStorage 登录
   */
  function handleLogin() {
    var loginPhone = document.getElementById('loginPhone');
    var loginNickname = document.getElementById('loginNickname');
    var loginSubmitBtn = document.getElementById('loginSubmitBtn');
    var loginModal = document.getElementById('loginModal');

    var phone = loginPhone ? loginPhone.value.trim() : '';
    var nickname = loginNickname ? loginNickname.value.trim() : '';

    if (phone.length < 7) { showToast('请输入有效的手机号（至少7位）'); return; }
    if (!nickname) { showToast('请输入昵称'); return; }

    if (window.AuthService && window.SupabaseClient && window.SupabaseClient.isReady && window.SupabaseClient.isReady()) {
      // 使用 AuthService 登录
      if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = '登录中...';
      }
      window.AuthService.login(phone, nickname).then(function() {
        if (loginModal) loginModal.classList.remove('show');
        if (loginPhone) loginPhone.value = '';
        if (loginNickname) loginNickname.value = '';
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = '登录';
        }
        showToast('登录成功！');
      }).catch(function(err) {
        showToast('登录失败: ' + (err.message || '未知错误'));
        if (loginSubmitBtn) {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = '登录';
        }
      });
    } else {
      // Supabase 未配置，降级为本地登录
      var maskedPhone = phone.slice(0, 3) + '****' + phone.slice(-4);
      var user = { phone: maskedPhone, nickname: nickname, loginAt: Date.now() };
      localStorage.setItem('wc_user', JSON.stringify(user));
      if (loginModal) loginModal.classList.remove('show');
      if (loginPhone) loginPhone.value = '';
      if (loginNickname) loginNickname.value = '';
      renderAuthUI(user);
      showToast('登录成功（本地模式）');
    }
  }

  /**
   * 初始化导航服务
   * 按顺序执行：注入登录弹窗 → 设置导航高亮 → 汉堡菜单 → 登录事件 → 恢复会话 → 监听认证变更
   */
  function init() {
    injectLoginModal();
    setActiveNav();
    setupHamburger();
    setupLoginEvents();

    // 恢复用户会话
    var user = window.AuthService ? window.AuthService.getCurrentUser() : null;
    renderAuthUI(user);

    if (window.AuthService) {
      window.AuthService.restoreSession().then(function(restoredUser) {
        if (restoredUser) {
          console.log('[NavService] 用户已恢复:', restoredUser.nickname);
        }
      });
      window.AuthService.onAuthChange(function(changedUser) {
        renderAuthUI(changedUser);
      });
    }
  }

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.NavService = {
    init: init,
    injectLoginModal: injectLoginModal,
    setActiveNav: setActiveNav,
    setupHamburger: setupHamburger,
    renderAuthUI: renderAuthUI,
    setupLoginEvents: setupLoginEvents,
    handleLogin: handleLogin
  };
})();
