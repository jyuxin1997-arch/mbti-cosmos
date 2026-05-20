# 测试报告 — 世界杯预测网站多页面重构

> QA 工程师：严过关（Yan） | 日期：2026-05-21 | 轮次：Round 1

## Summary
- 总检查项：38 | 通过：33 | 失败：5
- 覆盖范围：HTML 结构(6页) + CSS(6文件) + JS(11文件) + 跨页面跳转 + 一致性 + 删除验证
- 路由判定：**需工程师修复**（2 个 P0 + 1 个 P1 + 2 个 P2）

---

## P0 — 阻断性问题（2 个）

### P0-1: teams.js 球队卡片点击跳转 URL 不符合架构设计
- **文件**: `js/teams.js` 第 77 行
- **实际行为**: `window.location.href = 'index.html?a=' + encodeURIComponent(name);`
- **期望行为**: 架构文档 T03 明确要求：`构建 URL index.html?a=已选队&b=点击队 或 index.html?a=点击队（如果 A/B 都未选）`
- **影响**: 用户从球队百科点击球队后，只有 A 队被填入，B 队永远是默认的第二支队伍，而非用户期望的精确跳转。违反 PRD M06/M10 验收标准
- **需工程师修复**: 修改 teams.js 第 74-79 行，使卡片点击时构建带 `?a=已有队&b=点击队` 的 URL

### P0-2: ranking.js 球队行项点击缺少跳转到 teams.html?highlight 的路径
- **文件**: `js/ranking.js` 第 45 行
- **实际行为**: 只跳转 `index.html?a=队名`
- **期望行为**: 架构文档 T03/T05 明确要求 `球队行项点击：跳转 teams.html?highlight=队名 或 index.html?a=队名`（两条路径都应支持）
- **影响**: 热榜页无法跳转到百科页查看球队详情（带高亮），PRD 用户故事 7 提到 "一眼看到各队 Elo 排名"，但无法进一步查看球队百科
- **需工程师修复**: 修改 ranking.js 第 41-48 行，增加跳转到 `teams.html?highlight=队名` 的逻辑（可根据交互方式区分，如点击队名跳百科、点击评分跳预测器）

---

## P1 — 重要问题（1 个）

### P1-1: 404.html 加载了不必要的 supabase-client.js 和 auth.js
- **文件**: `404.html` 第 52-55 行
- **实际行为**: 加载 `config → utils → supabase-client → auth → nav`
- **期望行为**: 架构文档 3.2 节明确指定 404.html 加载 `config → utils → nav`（不含 supabase-client 和 auth）
- **影响**: 404 页面加载了两个不需要的 JS 文件（约 50KB+），增加了错误页面的加载时间；且如果 Supabase CDN 故障，404 页面也会受影响而白屏
- **需工程师修复**: 删除 404.html 中 `<script src="js/supabase-client.js"></script>` 和 `<script src="js/auth.js"></script>`，同时调整 nav.js 使其在 AuthService 不存在时不报错（当前 nav.js 第 193-205 行已有 `if (window.AuthService)` 判断，兼容性良好）

---

## P2 — 轻微问题（2 个）

### P2-1: Toast 样式使用内联样式而非 CSS 类
- **文件**: `js/utils.js` 第 17 行
- **实际行为**: Toast 通过 `el.style.cssText = '...'` 设置样式
- **期望行为**: 架构文档 base.css 说明中包含 "Toast 样式"，暗示应在 CSS 中定义
- **影响**: Toast 样式不可被页面 CSS 覆盖，维护困难；但功能正常，不影响用户体验
- **建议**: 在 base.css 中添加 `.toast-msg` 样式类，utils.js 改为 `el.className = 'toast-msg'`（当前可接受，非阻断）

### P2-2: predictor.js 的 buildShareUrl() 未对中文队名做 encodeURIComponent
- **文件**: `js/predictor.js` 第 209-216 行
- **实际行为**:
  ```js
  if (state.teamA) params.set('a', state.teamA);
  if (state.teamB) params.set('b', state.teamB);
  ```
- **期望行为**: 虽然 `URLSearchParams.set()` 会自动编码，但架构文档约定 "参数值使用 encodeURIComponent 编码"，建议显式编码以确保可读性和一致性
- **影响**: 功能正常（URLSearchParams 会自动编码），但分享 URL 的编码可能不一致
- **建议**: 统一显式使用 `encodeURIComponent`，或保持现状（功能无差异）

---

## 通过的检查项（33 项）

### 1. HTML 结构验证（6/6 页面通过基础检查）

| 检查项 | index | live | teams | ranking | community | 404 |
|--------|:-----:|:----:|:-----:|:-------:|:---------:|:---:|
| lang="zh-CN" | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| viewport-fit=cover | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| topbar 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| mobileNav 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| tabBar 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 加载 base.css | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 加载对应 page-*.css | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| 公共 JS 加载顺序正确 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| 页面专属 JS 存在 | ✅ | ✅ | ✅ | ✅ | ✅ | N/A |
| 登录弹窗由 nav.js 注入 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> ⚠️ 404.html 公共 JS 加载了多余的 supabase-client + auth（见 P1-1）

### 2. CSS 完整性（6/6 通过）

- ✅ base.css 包含：全局变量、重置、导航、Tab栏、登录弹窗、认证UI、Modal通用、页脚、响应式
- ✅ page-index.css 包含：Hero、倒计时、开幕战、免责声明、预测器、结果面板、H2H、分享按钮、讨论入口、预测卡片弹窗、响应式
- ✅ page-live.css 包含：赛况布局、资讯流、赛程卡片、数据来源、响应式
- ✅ page-teams.css 包含：搜索筛选、球队卡片网格、内部数据、风格标签、响应式
- ✅ page-ranking.css 包含：排行网格、分档卡片、排行行项、响应式
- ✅ page-community.css 包含：社区区域、筛选、帖子卡片、帖子详情、回复、点赞按钮
- ✅ Tab 栏样式正确：桌面隐藏、移动端显示、fixed bottom、safe-area
- ✅ 响应式断点一致（768px / 480px）

### 3. JS 模块完整性（全部通过核心检查）

- ✅ nav.js 正确注入登录弹窗、设置导航高亮、处理汉堡菜单、渲染认证UI
- ✅ predictor.js 包含完整预测逻辑（state、算法、渲染、倒计时、URL参数、分享、讨论入口）
- ✅ live.js 包含完整赛况功能（数据加载、渲染、实时数据回调、API轮询启停）
- ✅ teams.js 包含完整百科功能（搜索筛选、卡片渲染、URL参数高亮）
- ✅ ranking.js 包含完整热榜功能（Elo排序、分档渲染）
- ✅ community.js 包含 applyUrlParams() 和 beforeunload 清理
- ✅ live-data.js 回调已改为 window.LiveApp.renderLiveData
- ✅ prediction-card.js 已改为 window.PredictorApp.buildShareUrl
- ✅ 无残留 window.App 引用

### 4. 跨页面跳转（部分通过）

| 跳转场景 | URL 格式 | encodeURIComponent | 状态 |
|----------|----------|-------------------|------|
| 预测器→社区 | `community.html?match_key=...` | ✅ 已使用 | ✅ |
| 百科→预测 | `index.html?a=...` | ✅ 已使用 | ⚠️ 缺 b 参数 |
| 热榜→预测 | `index.html?a=...` | ✅ 已使用 | ⚠️ 缺跳百科路径 |
| 社区帖子分享 | `community.html?post=123` | N/A | ✅ |

### 5. 一致性检查（全部通过）

- ✅ 所有页面 topbar 链接一致（5 项：预测器、实时赛况、球队百科、夺冠热榜、球迷社区）
- ✅ 所有页面 tabBar 链接一致（5 项：首页、赛况、社区、热榜、百科）
- ✅ 导航高亮逻辑正确（setActiveNav 基于 pathname 提取文件名比对 href）
- ✅ 登录弹窗在所有页面由 nav.js 统一注入

### 6. 删除验证（全部通过）

- ✅ style.css 已删除（根目录和 css/ 目录均不存在）
- ✅ app.js 已删除（根目录和 js/ 目录均不存在）
- ✅ 无任何文件引用 style.css
- ✅ 无任何文件引用 app.js
- ✅ 无残留 window.App 引用

---

## 智能路由判定

| 问题编号 | 严重度 | 路由 | 说明 |
|----------|--------|------|------|
| P0-1 | P0 | → 工程师修复 | teams.js 卡片点击跳转 URL 缺少 b 参数 |
| P0-2 | P0 | → 工程师修复 | ranking.js 缺少跳转 teams.html?highlight 路径 |
| P1-1 | P1 | → 工程师修复 | 404.html 加载多余 JS 文件 |
| P2-1 | P2 | 保留观察 | Toast 使用内联样式，功能正常 |
| P2-2 | P2 | 保留观察 | buildShareUrl 未显式 encodeURIComponent，功能正常 |

---

## 下一步

需等待工程师（Alex）修复 P0-1、P0-2、P1-1 后，进入 Round 2 回归测试。
