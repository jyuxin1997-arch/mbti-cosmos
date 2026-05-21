# PRD：世界杯胜率预测台 — 社区交互升级 + 全站优化

## 1. 项目信息

- **Language**: 中文
- **Programming Language**: 纯静态 HTML + CSS + JS（无构建工具）+ Supabase 后端
- **Project Name**: `wc-predictor-community-upgrade`
- **部署方式**: GitHub Pages（纯静态文件）
- **原始需求**: 以社区讨论交互升级为核心，全面提升社区活跃度和讨论质量；同时完成全站 8 项基础设施优化

## 2. 产品目标

| # | 目标 | 衡量标准 |
|---|------|----------|
| G1 | **社区激活** — 让社区从"发帖即结束"变成"发帖引发讨论"，提升回帖率和讨论深度 | 帖子平均回复数提升 50%，7 日回访用户中发帖/回帖比例提升 30% |
| G2 | **讨论体验** — 回复有上下文、有引用、有嵌套，让讨论真正"流动"起来 | 用户在帖子详情页平均停留时长提升 40% |
| G3 | **内容安全与性能** — 防灌水、防刷帖，全站加载性能和 SEO 基础达标 | 零明显灌水帖子，Lighthouse 性能评分 ≥ 85 |

## 3. 社区交互升级方案（重点）

### 3.1 现状诊断

| 问题 | 现状 | 影响 |
|------|------|------|
| 回复扁平 | replies 表无 `parent_id`，所有回复平铺 | 对话无上下文，像各自说话 |
| 无编辑/删除 | 只能发帖不能改不能删 | 打错字无法修正，违规内容无法自删 |
| 无通知 | 发了帖不知道有没有人回复 | 用户发完就走了，缺乏回访动力 |
| 排序单一 | 只有 `created_at DESC` | 好帖子被淹没，新用户看不到精华 |
| 身份薄弱 | 只显示 nickname | 无法区分老用户/新用户，缺乏社区归属感 |
| 点赞无反馈 | 数字变化无动效 | 互动缺乏"爽感" |
| 无引用回复 | 无法引用某条回复 | 回复针对性差，讨论容易跑偏 |
| 无 @提醒 | 无法 @某用户 | 无法主动拉人参与讨论 |

### 3.2 竞品分析

| 竞品 | 值得借鉴 | 不适合我们 |
|------|----------|------------|
| **Reddit** | 嵌套回复（thread 式讨论）、热门排序算法（upvote → hot）、帖子内投票 | 子版块机制过重、karma 积分体系复杂 |
| **虎扑** | 帖子热度算法（回复×权重 > 点赞）、亮了/熄了反馈、用户等级（虎扑币/声望）、只看楼主 | 虎扑 App 原生功能太重、广告多 |
| **懂球帝** | 比赛关联讨论（战报 → 讨论）、球迷圈层、帖子标签体系 | App 内功能过重、商业化太深 |
| **V2EX** | 极简回复列表、@用户通知、节点分类 | UI 过于简陋、无嵌套 |
| **Twitter/X** | 引用回复、@提及、互动动效 | 信息流模式不适合社区帖子 |

**核心借鉴结论**：
1. **嵌套回复**：采用 Reddit 式 2 级嵌套（帖子回复 → 子回复），不做无限嵌套（避免复杂度爆炸）
2. **热度排序**：参考 Reddit Hot 算法简化版，综合考虑点赞数 × 回复数 × 时间衰减
3. **身份体系**：参考虎扑声望，用发帖/回帖/获赞计算等级，轻量实现
4. **互动反馈**：参考 Twitter 点赞心形动画，用 CSS animation 实现

### 3.3 功能详设

#### 3.3.1 帖子 CRUD（编辑/删除）

**删除帖子**：
- 帖子详情弹窗中，作者本人可见"删除"按钮（红色，靠右）
- 点击后弹出确认对话框（非 alert，用自定义 modal）
- 删除后：帖子从列表消失，Supabase CASCADE 删除关联 replies/likes
- RLS 策略：已有 `posts_delete_own`，无需新增

**编辑帖子**：
- 帖子详情弹窗中，作者本人可见"编辑"按钮
- 点击后标题和内容变为可编辑（contenteditable 或切换为 input/textarea）
- 保存时校验：标题非空、内容非空、总长度不变（≤2000）
- 数据库：posts 表新增 `updated_at timestamptz` 字段，编辑时更新
- 前端显示："已编辑" 标记（编辑后显示）

**删除回复**：
- 每条回复右侧，作者本人可见"删除"图标
- 删除后平滑移除（CSS fade-out），刷新回复列表
- RLS 策略：已有 `replies_delete_own`

**编辑回复**：
- 回复内容旁，作者本人可见"编辑"图标
- 点击后内容变为可编辑 textarea
- replies 表新增 `updated_at timestamptz` 字段
- 前端显示："已编辑" 标记

#### 3.3.2 回复体系（嵌套 + 引用）

**2 级嵌套方案**：
- replies 表新增 `parent_reply_id bigint REFERENCES replies(id) ON DELETE CASCADE`
- `parent_reply_id = NULL` 表示帖子的一级回复
- `parent_reply_id != NULL` 表示对某条一级回复的子回复（二级）
- 不做三级及以上嵌套（前端限制，子回复不能再回复子回复）
- 渲染方式：一级回复正常展示，二级回复缩进显示，带引用头像

**引用回复**：
- 每条回复旁显示"回复"按钮
- 点击"回复"后，回复输入框自动填入 `@昵称 `，并记录 `parent_reply_id`
- 二级回复在内容上方显示引用摘要：`> 昵称：原回复前30字...`
- 帖子作者回复时，显示"楼主"标签

**数据库变更**：
```sql
ALTER TABLE replies ADD COLUMN parent_reply_id bigint REFERENCES replies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id);
```

**查询方式**：
- 一次查询帖子所有 replies，前端按 parent_reply_id 分组渲染
- 不需要递归查询（只有 2 级）

#### 3.3.3 排序算法（热门/最新/精华）

**排序选项**（筛选栏右侧下拉）：
- 最新（默认）：`created_at DESC`
- 最热：热度分 `DESC`（新增字段 `hot_score`）
- 精华：`is_pinned = true` 优先 + `created_at DESC`

**热度算法**（Supabase 触发器计算）：
```
hot_score = (likes_count × 1 + replies_count × 3) / power(hours_since_post + 2, 1.5)
```
- 点赞权重 1，回复权重 3（鼓励讨论 > 点赞）
- 时间衰减：越老分越低，但不会归零
- 触发器：posts 表 INSERT/UPDATE 时自动计算

**精华帖**：
- posts 表新增 `is_pinned boolean DEFAULT false`
- 精华帖在列表中置顶，带 📌 图标
- 精华标记由站长手动设置（通过 Supabase Dashboard 直接更新），不开放 API
- RLS：新增 `posts_update_admin` 策略（预留，暂不实现管理后台）

**数据库变更**：
```sql
ALTER TABLE posts ADD COLUMN hot_score numeric DEFAULT 0;
ALTER TABLE posts ADD COLUMN is_pinned boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_posts_hot_score ON posts(hot_score DESC);
```

**触发器**：
```sql
CREATE OR REPLACE FUNCTION update_post_hot_score()
RETURNS TRIGGER AS $$
BEGIN
  NEW.hot_score := (
    COALESCE(NEW.likes_count, 0) * 1 +
    COALESCE(NEW.replies_count, 0) * 3
  ) / power(
    extract(epoch from (now() - NEW.created_at)) / 3600 + 2,
    1.5
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_posts_hot_score
BEFORE INSERT OR UPDATE OF likes_count, replies_count ON posts
FOR EACH ROW EXECUTE FUNCTION update_post_hot_score();
```

#### 3.3.4 通知机制

**方案：Supabase Realtime + 前端轮询混合**

**为什么不用纯推送**：Supabase Realtime 免费版有连接数限制（200 并发），不适合做全局推送。采用"页面打开时 Realtime 订阅 + 离线时错过通知可查"的混合方案。

**通知类型**：
1. 回复通知：有人回复了我的帖子
2. @通知：有人 @了我
3. 点赞通知：有人赞了我的帖子/回复（可选，频次高可聚合）

**实现方案**：

**notifications 表**：
```sql
CREATE TABLE notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,           -- 'reply' / 'mention' / 'like'
  from_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  post_id bigint REFERENCES posts(id) ON DELETE CASCADE,
  reply_id bigint REFERENCES replies(id) ON DELETE CASCADE,
  content text,                 -- 通知摘要
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
```

**RLS 策略**：
```sql
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = notifications.user_id AND profiles.auth_uid = auth.uid())
);
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = notifications.user_id AND profiles.auth_uid = auth.uid())
);
```

**通知生成**：Supabase 触发器自动生成
- replies INSERT 时 → 给 post author 生成 reply 通知
- 正则匹配 `@(\S+)` → 查找对应 profile → 生成 mention 通知（前端 JS 提取 @nickname 列表，写入 reply 的 mention_user_ids 字段，触发器据此生成通知）

**前端展示**：
- 导航栏右侧铃铛图标 + 未读数角标（红色数字）
- 点击展开通知面板（下拉列表，最近 20 条）
- 通知项：头像 + 动作描述 + 帖子标题 + 时间
- 点击通知 → 跳转 community.html?post=xxx 打开帖子详情
- "全部已读" 按钮

**实时性**：
- 社区页面打开时：Supabase Realtime 订阅 notifications 表的 INSERT 事件 → 实时更新角标
- 非社区页面：页面加载时查一次未读数，不订阅（避免多页面同时占用连接）

#### 3.3.5 用户身份体系

**profiles 表扩展**：
```sql
ALTER TABLE profiles ADD COLUMN avatar_url text;
ALTER TABLE profiles ADD COLUMN level int DEFAULT 1;
ALTER TABLE profiles ADD COLUMN posts_count int DEFAULT 0;
ALTER TABLE profiles ADD COLUMN replies_count int DEFAULT 0;
ALTER TABLE profiles ADD COLUMN likes_received int DEFAULT 0;
```

**头像**：
- 提供预设头像库（10-15 个足球主题头像，emoji 风格或 SVG）
- 登录时随机分配一个，用户可在个人设置中更换
- 头像存储：直接用 emoji 或 SVG 内联，不需要上传图片（避免存储成本）
- 头像映射：`avatar_url` 存储头像标识符（如 `avatar_01`），前端根据标识符渲染

**等级系统**：
- 基于活跃度积分计算：`score = posts_count × 5 + replies_count × 2 + likes_received × 1`
- 等级划分：
  - Lv1 新手球迷：0-9 分
  - Lv2 忠实球迷：10-29 分
  - Lv3 资深球迷：30-59 分
  - Lv4 传奇球迷：60-99 分
  - Lv5 名宿：100+ 分
- 等级在昵称旁以小标签显示（不同颜色）

**统计计数触发器**：
```sql
-- posts_count 自动更新
CREATE OR REPLACE FUNCTION update_profile_posts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET posts_count = posts_count + 1 WHERE id = NEW.author_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = OLD.author_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_profile_posts_count
AFTER INSERT OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION update_profile_posts_count();

-- replies_count 自动更新（同理）
-- likes_received 自动更新（从 post_likes + reply_likes 触发器汇总到 post/reply 的 author_id）
```

**前端展示**：
- 帖子列表卡片：头像 + 昵称 + 等级标签 + 发帖时间
- 帖子详情：头像（大号）+ 昵称 + 等级 + 发帖数
- 回复项：头像（小号）+ 昵称 + 等级

#### 3.3.6 互动反馈增强

**点赞动效**：
- 点击点赞按钮时，心形 ❤️ 弹跳放大动画（CSS @keyframes scale 1→1.4→1）
- 数字变化时平滑递增/递减（CSS transition on transform）
- 点赞后按钮短暂发光（box-shadow glow），持续 300ms
- 取消点赞时心形灰色化，无弹跳

**点赞音效**：不做（移动端自动播放受限，且增加复杂度）

**@提醒实现**：
- 回复输入框中输入 `@` 时，弹出用户名建议列表（查询最近在该帖回复的用户 nickname）
- 选择后自动补全 `@nickname `
- 回复提交时，前端 JS 提取所有 `@(\S+)` 模式，匹配 profiles 表的 nickname
- 匹配到的 user_id 列表存入 replies 新增字段 `mention_user_ids uuid[]`

**replies 表变更**：
```sql
ALTER TABLE replies ADD COLUMN mention_user_ids uuid[];
```

**引用块样式**：
- 二级回复中引用一级回复时，显示引用块：左侧绿色竖线 + 灰色背景 + 引用内容摘要
- 点击引用块可滚动到被引用回复

#### 3.3.7 内容安全

**发帖频率限制**（前端 + 数据库双保险）：

**前端限流**：
- 发帖：同一用户 60 秒内只能发 1 帖（前端计时器 + localStorage 记录上次发帖时间）
- 回复：同一用户 10 秒内只能发 1 条回复
- 超频提示："操作太频繁，请稍后再试"

**数据库限流**（RLS 策略增强）：
- 利用 Supabase RLS + 函数检查用户最近发帖频率
- 实现：posts INSERT 的 WITH CHECK 中加入时间间隔判断

```sql
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS boolean AS $$
DECLARE
  recent_count int;
BEGIN
  SELECT count(*) INTO recent_count
  FROM posts
  WHERE author_id = (SELECT id FROM profiles WHERE auth_uid = auth.uid())
    AND created_at > now() - interval '60 seconds';
  RETURN recent_count < 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**内容过滤**（前端）：
- 敏感词过滤：维护一个敏感词列表（JS 数组，约 50-100 个），发帖/回复前检查
- 敏感词替换为 `***`
- 重复内容检测：相同用户 5 分钟内不能发内容完全相同的帖子
- 最短内容限制：帖子正文 ≥ 5 字，回复 ≥ 2 字

**灌水检测**（前端启发式）：
- 连续 3 次发帖内容相似度 > 80%（简单 Levenshtein 距离）→ 暂时禁止发帖 5 分钟
- 注意：这是前端软限制，可绕过但足以防 99% 的低质量灌水

## 4. 全站优化方案

### 4.1 sitemap.xml + robots.txt（SEO）

**sitemap.xml**：
- 手动维护的静态 XML 文件
- 包含 5 个页面：index.html, live.html, teams.html, ranking.html, community.html
- `<changefreq>`：首页 daily，赛况 hourly，社区 daily，其他 weekly
- `<priority>`：首页 1.0，社区 0.8，赛况 0.8，其他 0.6
- 放置于项目根目录

**robots.txt**：
```
User-agent: *
Allow: /
Sitemap: https://jyuxin1997-arch.github.io/mbti-cosmos/sitemap.xml

# 不索引的路径
Disallow: /css/
Disallow: /js/
Disallow: /data/
```

### 4.2 script 标签加 defer（性能）

**变更**：所有 `<script>` 标签添加 `defer` 属性（保留加载顺序）

**例外**：Supabase UMD CDN 脚本不加 defer（它需要在其他脚本前可用）

**具体**：
```html
<!-- 不加 defer：Supabase SDK 必须先于业务脚本加载 -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

<!-- 加 defer：业务脚本按顺序延迟执行 -->
<script src="js/config.js" defer></script>
<script src="js/utils.js" defer></script>
<script src="js/supabase-client.js" defer></script>
<script src="js/auth.js" defer></script>
<script src="js/nav.js" defer></script>
<script src="js/community.js" defer></script>
```

### 4.3 每个页面独立 OG 标签（社交分享）

每个 HTML 的 `<head>` 中添加：
```html
<meta property="og:title" content="[页面标题]">
<meta property="og:description" content="[页面描述]">
<meta property="og:url" content="https://jyuxin1997-arch.github.io/mbti-cosmos/[page]">
<meta property="og:image" content="https://jyuxin1997-arch.github.io/mbti-cosmos/img/og-cover.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
```

需要设计一张 OG 封面图（1200×630），包含：世界杯主题 + 网站名称 + slogan。

### 4.4 PWA Service Worker（离线访问）

**manifest.json**：
```json
{
  "name": "世界杯胜率预测台",
  "short_name": "WC预测",
  "start_url": "/mbti-cosmos/",
  "display": "standalone",
  "background_color": "#0a1628",
  "theme_color": "#00e676",
  "icons": [
    { "src": "img/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "img/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**sw.js（Service Worker）**：
- Cache-first 策略缓存静态资源（HTML/CSS/JS/图片）
- Network-first 策略处理 API 请求（Supabase/football-data）
- 缓存版本管理：`CACHE_NAME = 'wc-v2'`
- 不缓存 Supabase Realtime 连接

**需要生成 PWA 图标**：192×192 和 512×512 的 PNG 图标。

### 4.5 骨架屏/Loading 态（体验）

**方案**：纯 CSS 骨架屏（灰色脉冲动画）

**帖子列表骨架**：
```css
.skeleton-card {
  background: var(--panel);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}
.skeleton-line {
  height: 14px;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--panel-2) 25%, var(--line) 50%, var(--panel-2) 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s infinite;
}
@keyframes skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**应用位置**：
- 帖子列表加载前：3 个骨架卡片
- 帖子详情加载前：标题骨架 + 正文骨架 + 2 个回复骨架
- 排行榜加载前：5 行骨架
- 球队列表加载前：6 个卡片骨架

### 4.6 发帖频率限制（防刷）

已在 3.3.7 中详述。前端 60 秒/帖 + 10 秒/回复；数据库 RLS 辅助校验。

### 4.7 内容过滤（防灌水）

已在 3.3.7 中详述。敏感词列表 + 重复检测 + 最短内容限制。

### 4.8 图片懒加载（性能）

**方案**：原生 `loading="lazy"` 属性

- 目前网站几乎无图片（emoji 为主），此项为预留
- 后续用户头像如使用图片 URL，添加 `loading="lazy"`
- OG 封面图等非首屏图片统一加 `loading="lazy"`
- 不引入第三方懒加载库（原生方案足够）

## 5. 需求池

### P0 — 必做（社区核心）

| 编号 | 需求 | 说明 | 验收标准 |
|------|------|------|----------|
| C01 | 回复嵌套（2 级） | replies 新增 parent_reply_id，前端按层级渲染 | 一级回复正常展示，二级回复缩进 + 引用块 |
| C02 | 引用回复 | 点击"回复"按钮自动填入 @昵称，二级回复显示引用摘要 | 引用块有左侧绿色竖线，显示被引者昵称和内容摘要 |
| C03 | 帖子删除 | 作者可删除自己的帖子和回复 | 删除后内容消失，关联数据 CASCADE 清理 |
| C04 | 热门排序 | 新增 hot_score 字段 + 排序切换 | "最热"排序下高质量帖子排在前面 |
| C05 | 点赞动效 | 点赞时心形弹跳 + 发光动画 | 点击赞后视觉反馈明显，300ms 内完成 |
| C06 | 发帖频率限制 | 前端 60 秒/帖 + 10 秒/回复 | 超频时提示"操作太频繁" |
| C07 | 内容过滤 | 敏感词替换 + 最短内容限制 | 敏感词显示为 ***，过短内容提交被拒 |
| C08 | 用户头像 | 预设头像库 + 登录随机分配 + 可更换 | 帖子/回复中显示头像 |
| C09 | 用户等级 | 基于活跃度积分的等级标签 | 昵称旁显示 Lv 标签，不同等级不同颜色 |
| C10 | 通知系统 | 通知表 + 触发器生成 + 前端铃铛角标 + 通知面板 | 收到回复/提及时有未读提醒 |

### P1 — 应做（体验提升）

| 编号 | 需求 | 说明 |
|------|------|------|
| C11 | 帖子编辑 | 作者可编辑自己的帖子和回复，显示"已编辑"标记 |
| C12 | @提及补全 | 输入 @ 弹出用户建议列表，自动补全昵称 |
| C13 | 精华帖 | 站长可标记精华帖，列表置顶 + 📌 图标 |
| C14 | 回复编辑 | 作者可编辑回复内容 |
| S01 | sitemap.xml + robots.txt | SEO 基础，搜索引擎可索引 |
| S02 | script 标签加 defer | 减少 HTML 解析阻塞，提升 FCP |
| S03 | 每页独立 OG 标签 | 微信/Twitter 分享时显示标题+描述+封面 |
| S04 | 骨架屏 Loading 态 | 数据加载前展示骨架占位 |
| S05 | 发帖频率限制（数据库层） | RLS 策略中校验频率，防绕过前端限制 |

### P2 — 远期（锦上添花）

| 编号 | 需求 | 说明 |
|------|------|------|
| C15 | 帖子收藏 | 用户可收藏帖子，个人页查看收藏列表 |
| C16 | 帖子举报 | 举报违规内容，站长后台查看 |
| C17 | 用户个人主页 | 查看用户发帖/回复/等级历史 |
| S06 | PWA Service Worker | 离线访问已浏览页面 |
| S07 | 图片懒加载 | 原生 loading="lazy"，预留 |
| S08 | 页面切换动画 | 顶部滑入微动画 |

## 6. 用户故事

### 社区讨论体验
1. **As a** 球迷，**I want** 看到某条回复后直接点击"回复"按钮引用它，**so that** 我的回复有明确上下文，对方知道我在回应什么。
2. **As a** 球迷，**I want** 帖子按热度排序时看到最精彩的讨论在前面，**so that** 我不会错过热门话题。
3. **As a** 球迷，**I want** 有人回复我的帖子时收到通知，**so that** 我能及时回来继续讨论而不是错过。
4. **As a** 球迷，**I want** 在帖子中 @某位用户，**so that** 他能看到我在和他说话。
5. **As a** 球迷，**I want** 删除或编辑自己发错的帖子/回复，**so that** 我不必因为打错字而尴尬。

### 用户身份
6. **As a** 活跃球迷，**I want** 我的昵称旁显示等级标签，**so that** 其他人知道我是资深用户。
7. **As a** 球迷，**I want** 有一个个性化的头像，**so that** 在社区中更容易被认出。

### 互动反馈
8. **As a** 球迷，**I want** 点赞时有弹跳动效，**so that** 互动有即时满足感。

### 内容安全
9. **As a** 社区用户，**I want** 没有人能刷屏灌水，**so that** 社区讨论质量不被拉低。
10. **As a** 社区用户，**I want** 敏感词被自动过滤，**so that** 社区氛围健康。

### 全站优化
11. **As a** 新用户，**I want** 从微信分享链接进来时看到有意义的标题和封面，**so that** 我知道这个链接是什么。

## 7. Supabase 数据库变更汇总

### 新增表

| 表名 | 说明 |
|------|------|
| `notifications` | 通知记录，RLS 仅允许用户查看自己的通知 |

### 字段变更

| 表 | 变更 | 说明 |
|----|------|------|
| `profiles` | + `avatar_url text` | 头像标识符 |
| `profiles` | + `level int DEFAULT 1` | 用户等级 |
| `profiles` | + `posts_count int DEFAULT 0` | 发帖数 |
| `profiles` | + `replies_count int DEFAULT 0` | 回复数 |
| `profiles` | + `likes_received int DEFAULT 0` | 收到的赞数 |
| `posts` | + `hot_score numeric DEFAULT 0` | 热度分 |
| `posts` | + `is_pinned boolean DEFAULT false` | 精华标记 |
| `posts` | + `updated_at timestamptz` | 编辑时间 |
| `replies` | + `parent_reply_id bigint REFERENCES replies(id)` | 父回复 ID（嵌套） |
| `replies` | + `mention_user_ids uuid[]` | 被 @的用户 ID 列表 |
| `replies` | + `updated_at timestamptz` | 编辑时间 |

### 新增索引

| 索引 | 说明 |
|------|------|
| `idx_replies_parent ON replies(parent_reply_id)` | 嵌套回复查询 |
| `idx_posts_hot_score ON posts(hot_score DESC)` | 热门排序 |
| `idx_notifications_user ON notifications(user_id, is_read, created_at DESC)` | 通知查询 |
| `idx_notifications_created ON notifications(created_at DESC)` | 通知时间排序 |

### 新增触发器

| 触发器 | 说明 |
|--------|------|
| `trg_posts_hot_score` | 帖子创建/更新时自动计算 hot_score |
| `trg_profile_posts_count` | posts 增删时自动更新 profiles.posts_count |
| `trg_profile_replies_count` | replies 增删时自动更新 profiles.replies_count |
| `trg_profile_likes_received` | post_likes/reply_likes 增删时更新 profiles.likes_received |
| `trg_notification_on_reply` | replies INSERT 时给帖子作者生成通知 |
| `trg_notification_on_mention` | replies INSERT 时根据 mention_user_ids 生成 @通知 |

### 新增 RLS 策略

| 策略 | 说明 |
|------|------|
| `notifications_select_own` | 用户只能查看自己的通知 |
| `notifications_update_own` | 用户只能更新自己的通知（标记已读） |
| `posts_update_own` | 作者可编辑自己的帖子（新增） |
| `replies_update_own` | 作者可编辑自己的回复（新增） |

### 需删除的旧策略

| 策略 | 原因 |
|------|------|
| 无 | 现有策略全部保留，只新增 |

## 8. 技术约束提醒

| 约束 | 影响 | 应对 |
|------|------|------|
| **纯静态部署**（GitHub Pages） | 无服务端渲染，所有动态逻辑在前端 | 社区功能依赖 Supabase 客户端 SDK，HTML 只做壳 |
| **无构建工具** | 不能用 JSX/TypeScript/模块打包 | 继续用 IIFE + 全局变量模式，新功能按此规范 |
| **免费方案** | Supabase 免费版：500MB 存储、50K MAU、200 Realtime 连接 | 通知系统用 Realtime + 轮询混合，避免全员长连接 |
| **微信浏览器** | 不支持 pushState、Service Worker 部分功能受限 | 导航用 `<a href>` 而非 SPA 路由；SW 作渐进增强 |
| **Supabase Realtime 连接数** | 免费版 200 并发 | 社区页面订阅 notifications + posts 2 个 channel，非社区页面只读不订阅 |
| **匿名登录** | 用户每次设备新建匿名账号，profile 通过手机号关联 | 通知的 user_id 指向 profiles.id，而非 auth.uid() |
| **无图片上传** | Supabase Storage 免费版 1GB，但用户偏好免费极简 | 头像用预设 SVG/emoji，不上传自定义图片 |
| **手机号登录** | 唯一身份标识是手机号，无邮箱/第三方 OAuth | @提及只能按 nickname 匹配，不能按手机号 |

## 9. 开放问题

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| Q1 | 2 级嵌套是否足够？是否需要 3 级？ | C01 嵌套回复 | 2 级足够，3 级在移动端体验差且前端复杂度高。如后续需要可扩展 |
| Q2 | 通知是否需要邮件/推送？ | C10 通知系统 | P0 只做站内通知。Supabase Edge Functions 可发邮件但免费额度有限，暂不做 |
| Q3 | 预设头像库需要多少个？什么风格？ | C08 头像 | 建议 12 个足球主题（球鞋、哨子、各位置球员简笔画），SVG 内联 |
| Q4 | 热度算法的时间衰减系数 1.5 是否合适？ | C04 热门排序 | 先上线观察，根据实际数据调整。1.5 是 Reddit 的经验值 |
| Q5 | 是否需要帖子搜索功能？ | 远期 | P2，依赖 Supabase 全文搜索（需 pg_trgm 扩展），免费版可用 |
| Q6 | OG 封面图谁来设计？ | S03 | 建议用 AI 生成一张世界杯主题封面，或用 CSS 渐变 + emoji 组合 |
| Q7 | 敏感词列表如何维护？ | C07 内容过滤 | 初期硬编码约 50 个，后续可考虑从外部 JSON 加载（但免费方案下不建管理后台） |
