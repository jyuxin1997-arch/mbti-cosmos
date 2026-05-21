// === 预设头像库 ===
(function() {
  var PRESETS = ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🎯'];

  function random() {
    return PRESETS[Math.floor(Math.random() * PRESETS.length)];
  }

  function render(avatarUrl, size) {
    var sz = size || 'md';
    var emoji = avatarUrl || '⚽';
    return '<span class="user-avatar ' + sz + '">' + emoji + '</span>';
  }

  window.Avatars = {
    PRESETS: PRESETS,
    random: random,
    render: render
  };
})();
