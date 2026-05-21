# 架构设计：社区交互升级 + 全站优化

## 1. 实现方案

### 1.1 整体策略
在现有多页面架构基础上，重点改造 community.html 和 community.js，新增通知模块和头像模块，全站添加 SEO/性能优化。

### 1.2 新增 JS 模块

| 文件 | 职责 | 大小估计 |
|------|------|---------|
| `js/notifications.js` | 通知服务：查询未读数、标记已读、通知面板渲染、Realtime 订阅 | ~200行 |
| `js/avatars.js` | 预设头像库（12个足球emoji）+ 渲染辅助函数 | ~60行 |
| `js/content-filter.js` | 敏感词列表、内容校验、频率限制 | ~100行 |

### 1.3 现有模块改动量

| 文件 | 改动说明 | 改动量 |
|------|---------|--------|
| `js/community.js` | 嵌套回复渲染、帖子/回复删除编辑、热门排序、引用回复、@补全、骨架屏 | 大（+400行） |
| `js/nav.js` | 通知铃铛角标、头像显示、等级标签 | 中（+80行） |
| `js/auth.js` | 登录时分配随机头像 | 小（+10行） |
| `css/base.css` | 通知面板样式、头像样式、等级标签、点赞动效、骨架屏 | 中（+100行） |
| `css/page-community.css` | 嵌套回复样式、排序切换、引用块 | 中（+80行） |
| `community.html` | 排序切换UI、通知面板容器 | 小（+20行） |
| 所有6个HTML | script加defer + OG标签 | 小（每页+5行） |

### 1.4 技术决策

1. **community.js 不拆分**：666行→约1100行，仍在可维护范围内。拆分反而增加全局变量耦合。
2. **notifications.js 独立**：因为 nav.js（所有页面加载）需要调用未读数查询，必须独立于 community.js。
3. **等级计算在前端**：避免触发器复杂度，posts_count/replies_count/likes_received 由触发器维护，等级根据公式前端计算。
4. **头像存 emoji 标识符**：avatar_url 存如 `⚽`、`🏟️`，前端直接渲染，无需图片。

---

## 2. 文件列表

### 新增文件（6个）
| 文件路径 | 说明 |
|---------|------|
| `js/notifications.js` | 通知服务模块 |
| `js/avatars.js` | 预设头像库 |
| `js/content-filter.js` | 内容过滤+频率限制 |
| `sitemap.xml` | SEO 站点地图 |
| `robots.txt` | SEO 爬虫规则 |
| `supabase/migration-v2.sql` | 数据库迁移脚本（用户在 Dashboard 执行） |

### 修改文件（10个）
| 文件路径 | 说明 |
|---------|------|
| `js/community.js` | 核心改造：嵌套回复、删除编辑、排序、引用 |
| `js/nav.js` | 通知铃铛、头像、等级 |
| `js/auth.js` | 登录分配随机头像 |
| `css/base.css` | 通知/头像/等级/动效/骨架屏样式 |
| `css/page-community.css` | 嵌套回复/排序/引用块样式 |
| `community.html` | 排序UI + 通知面板 + defer + OG |
| `index.html` | defer + OG 标签 |
| `live.html` | defer + OG 标签 |
| `teams.html` | defer + OG 标签 |
| `ranking.html` | defer + OG 标签 |

---

## 3. 数据库迁移脚本

完整脚本见 `supabase/migration-v2.sql`。

核心变更：
- 新增 `notifications` 表 + RLS
- profiles 新增 5 字段：avatar_url, level, posts_count, replies_count, likes_received
- posts 新增 3 字段：hot_score, is_pinned, updated_at
- replies 新增 3 字段：parent_reply_id, mention_user_ids, updated_at
- 6 个触发器：hot_score 计算、posts_count/replies_count/likes_received 自动更新、通知生成
- 4 个新 RLS 策略：notifications 读写、posts/replies 编辑

---

## 4. 任务列表

### T01: 数据库迁移 + SEO 基础设施
**依赖**：无
**内容**：
1. 创建 `supabase/migration-v2.sql`（完整迁移脚本）
2. 创建 `sitemap.xml`
3. 创建 `robots.txt`
4. 所有 6 个 HTML 的 `<script>` 加 `defer`（Supabase CDN 不加）
5. 所有 6 个 HTML 添加独立 OG 标签
**验收**：migration-v2.sql 语法正确（IF NOT EXISTS 幂等），sitemap 包含5个页面，defer 不破坏现有功能

### T02: 头像 + 等级 + 内容安全模块
**依赖**：T01（defer 已加）
**内容**：
1. 创建 `js/avatars.js`：12个足球emoji预设库 + `renderAvatar(avatarUrl, size)` 函数
2. 创建 `js/content-filter.js`：敏感词列表(~50个) + `filterContent(text)` + `checkRateLimit(action)` + `validatePost(title, content)` + `validateReply(content)`
3. 修改 `js/auth.js`：登录时从 avatars.js 随机分配头像，插入 profile 时设置 avatar_url
4. 修改 `js/nav.js`：`renderAuthUI()` 中显示头像 emoji + 等级标签（Lv1-5）
5. 修改 `css/base.css`：头像样式 `.user-avatar`、等级标签 `.level-badge`
6. 所有需要头像的 HTML 页面加载 `js/avatars.js`（在 auth.js 之前）
**验收**：登录后导航栏显示头像emoji和等级标签，发帖频率超限被拦截

### T03: 社区核心改造（嵌套回复 + 删除编辑 + 排序）
**依赖**：T02（头像模块就绪）
**内容**：
1. 修改 `js/community.js`：
   - `loadPosts()` 增加 hot_score/is_pinned 查询字段 + 排序参数
   - 新增排序切换逻辑（最新/最热/精华）
   - `renderPostList()` 显示头像 + 等级标签 + 精华📌标记
   - `openPostDetail()` 显示删除/编辑按钮（作者可见）
   - `getReplies()` 增加 parent_reply_id 查询
   - `renderReplies()` 按 parent_reply_id 分组渲染2级嵌套
   - 新增 `deletePost()`、`editPost()`、`deleteReply()`、`editReply()`
   - 新增 `createReply()` 支持 parent_reply_id 和 @引用
   - 集成 content-filter.js 的校验
2. 修改 `css/page-community.css`：
   - 排序切换样式 `.sort-bar`
   - 嵌套回复样式 `.reply-nested`、引用块 `.reply-quote`
   - 删除/编辑按钮样式
3. 修改 `community.html`：
   - 帖子列表上方增加排序切换栏
   - 帖子详情弹窗增加删除/编辑按钮位置
   - 回复输入区增加回复目标指示
4. `community.html` 加载 `js/content-filter.js`
**验收**：帖子列表有排序切换，详情页有嵌套回复，作者可删可编辑

### T04: 通知系统 + 互动增强
**依赖**：T03（社区核心就绪）
**内容**：
1. 创建 `js/notifications.js`：
   - `fetchUnreadCount()` 查询未读数
   - `fetchNotifications(limit)` 拉取通知列表
   - `markAsRead(ids)` 标记已读
   - `markAllRead()` 全部已读
   - `renderNotificationPanel()` 渲染通知下拉面板
   - `subscribeNotifications()` Realtime 订阅（仅社区页面调用）
   - `unsubscribeNotifications()` 取消订阅
2. 修改 `js/nav.js`：
   - topbar 和 mobileNav 中添加铃铛图标 + 未读角标
   - 点击铃铛展开通知面板
   - 页面加载时查询未读数（非社区页面只查不订阅）
3. 修改 `js/community.js`：
   - 社区页面初始化时调用 `subscribeNotifications()`
   - beforeunload 时调用 `unsubscribeNotifications()`
   - 点赞按钮添加弹跳动效 CSS class
   - 回复输入框 @补全（监听输入，@后查询该帖回复者列表）
4. 修改 `css/base.css`：
   - 铃铛图标 + 角标样式 `.notification-bell`、`.notification-badge`
   - 通知面板样式 `.notification-panel`
   - 点赞弹跳动效 `@keyframes like-bounce`
5. 所有HTML页面（含404）加载 `js/notifications.js`（在 nav.js 之前）
**验收**：导航栏有铃铛+未读数，社区页面实时收到通知，点赞有弹跳动效

### T05: 骨架屏 + 最终集成 + 测试修复
**依赖**：T04
**内容**：
1. 修改 `css/base.css`：骨架屏通用样式
2. 修改 `js/community.js`：加载帖子/回复前显示骨架屏
3. 全局一致性审查：所有页面功能正常，无残留问题
4. Git commit + push
**验收**：骨架屏显示正常，所有功能完整，IS_PASS: YES

---

## 5. 共享知识

### 5.1 CSS 变量/类名约定
- `.user-avatar` — 头像容器（支持 `.user-avatar.sm` 24px / `.user-avatar.md` 36px / `.user-avatar.lg` 48px）
- `.level-badge` — 等级标签（Lv1-5，颜色：白/绿/蓝/金/红）
- `.notification-bell` — 铃铛图标
- `.notification-badge` — 未读角标（红色圆点）
- `.notification-panel` — 通知下拉面板
- `.sort-bar` — 排序切换栏
- `.reply-nested` — 二级回复缩进
- `.reply-quote` — 引用块（左绿色竖线）
- `.like-btn.bouncing` — 点赞弹跳动画
- `.skeleton-card` / `.skeleton-line` — 骨架屏
- `.btn-edit` / `.btn-delete` — 编辑/删除按钮

### 5.2 JS 接口约定
```js
// avatars.js
window.Avatars = {
  PRESETS: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🎯'],
  random: function() { /* 返回随机emoji */ },
  render: function(avatarUrl, size) { /* 返回HTML字符串 */ }
};

// content-filter.js
window.ContentFilter = {
  filterText: function(text) { /* 敏感词替换，返回过滤后文本 */ },
  validatePost: function(title, content) { /* 返回 {ok, msg} */ },
  validateReply: function(content) { /* 返回 {ok, msg} */ },
  checkRateLimit: function(action) { /* action='post'|'reply'，返回 {ok, waitSec} */ },
  recordAction: function(action) { /* 记录操作时间 */ }
};

// notifications.js
window.NotificationService = {
  fetchUnreadCount: function() { /* 返回 Promise<number> */ },
  fetchNotifications: function(limit) { /* 返回 Promise<array> */ },
  markAsRead: function(ids) { /* 返回 Promise */ },
  markAllRead: function() { /* 返回 Promise */ },
  renderBell: function() { /* 渲染铃铛到 #notificationArea */ },
  togglePanel: function() { /* 切换通知面板 */ },
  subscribe: function() { /* Realtime 订阅 */ },
  unsubscribe: function() { /* 取消订阅 */ }
};
```

### 5.3 等级计算公式
```
score = posts_count × 5 + replies_count × 2 + likes_received × 1
Lv1 新手球迷: 0-9
Lv2 忠实球迷: 10-29
Lv3 资深球迷: 30-59
Lv4 传奇球迷: 60-99
Lv5 名宿: 100+
```

### 5.4 URL 参数约定
- 社区帖子：`community.html?post=123`
- 社区筛选：`community.html?match_key=巴西_vs_阿根廷`
- 百科高亮：`teams.html?highlight=法国`

---

## 6. 风险点

### 6.1 community.js 改动量大
**风险**：从666行扩到约1100行，容易丢功能
**对策**：每次修改在原函数基础上扩展，不重写；新增功能用新函数，不改旧函数签名

### 6.2 defer 脚本后 DOMContentLoaded 时机
**风险**：defer 脚本在 DOM 解析完、DOMContentLoaded 前执行。现有代码用 `document.readyState === 'loading'` 判断，加 defer 后 readyState 可能已经是 'complete'
**对策**：nav.js 已有双路判断（loading/else），确认其他 JS 模块的 init 也做类似处理

### 6.3 通知 Realtime 连接数
**风险**：免费版 200 并发连接，多标签页 + 通知 + 社区帖子订阅可能超限
**对策**：仅社区页面订阅通知 Realtime，其他页面只轮询一次；帖子订阅和通知共用一个 channel

### 6.4 嵌套回复查询性能
**风险**：一次查询所有 replies 前端分组，帖子回复量大时性能差
**对策**：先不加分页，监控实际数据量。replies 单帖通常 <100 条，前端分组 O(n) 无压力
