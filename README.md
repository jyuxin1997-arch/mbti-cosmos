# 世界杯胜率预测台

2026 FIFA 世界杯胜率预测、实时赛况、球迷讨论平台。

## 功能

- **胜率预测器**：Elo 评分 + 泊松分布模型，支持小组赛/淘汰赛、场地、节奏、状态调节
- **实时赛况**：接入 football-data.org API，实时比分、赛程、积分榜
- **球队百科**：48 支球队详细资料，支持搜索和筛选
- **夺冠热榜**：基于评分模型的力量排名
- **球迷讨论**：Firebase 实时评论系统，支持发帖、回复、点赞
- **分享功能**：URL 参数分享 + QR 二维码

## 快速开始

直接用浏览器打开 `index.html` 即可运行，无需构建工具。

部署到 GitHub Pages：直接 push 到仓库即可。

## Firebase 配置（讨论功能）

讨论功能需要 Firebase 支持，以下是配置步骤：

### 第 1 步：创建 Firebase 项目

1. 访问 [Firebase Console](https://console.firebase.google.com/)
2. 点击 **"创建项目"**
3. 输入项目名称（如 `wc-predictor`），点击继续
4. 可选择关闭 Google Analytics，点击创建项目

### 第 2 步：添加 Web 应用

1. 在项目概览页面，点击 Web 图标 `</>`
2. 输入应用昵称（如 `wc-predictor-web`）
3. **勾选** "同时设置 Firebase Hosting"（可选）
4. 点击注册应用
5. 复制 `firebaseConfig` 对象中的内容

### 第 3 步：开启 Authentication

1. 左侧菜单 → **Authentication** → **开始**
2. 选择 **Google** 登录方式
3. 启用 Google 登录，填写支持邮箱，保存

### 第 4 步：创建 Firestore 数据库

1. 左侧菜单 → **Firestore Database** → **创建数据库**
2. 选择 **测试模式**（方便测试，后续可设置安全规则）
3. 选择位置（建议选 `asia-east1` 或最近的区域）
4. 点击创建

### 第 5 步：填入配置

打开 `index.html`，找到顶部的 `FIREBASE_CONFIG` 对象，填入你从第 2 步复制的配置：

```javascript
const FIREBASE_CONFIG = {
  apiKey: "你的-apiKey",
  authDomain: "你的项目.firebaseapp.com",
  projectId: "你的项目id",
  storageBucket: "你的项目.appspot.com",
  messagingSenderId: "你的senderId",
  appId: "你的appId"
};
```

保存后刷新页面，讨论功能即可使用。

### Firestore 安全规则（推荐）

在 Firestore → 规则 中设置：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /discussions/{matchId}/comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth.uid == resource.data.uid
                   || resource.data.likedBy.hasAny([request.auth.uid]);
    }
    match /discussions/{matchId}/comments/{commentId}/replies/{replyId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth.uid == resource.data.uid;
    }
  }
}
```

## 实时数据 API

网站使用 [football-data.org](https://www.football-data.org/) 免费 API 获取实时赛况。

- 无需 API Key 也可运行（部分数据受限）
- 免费注册可获取完整数据（每分钟10次请求限制）
- 如需使用 API Key，在 `index.html` 中搜索 `X-Auth-Token` 处填入

## 免责声明

本网站所有预测仅供娱乐参考，不构成任何投注建议。理性观赛，禁止赌球。

## 技术栈

- 纯 HTML/CSS/JS 单页应用
- Firebase Auth + Firestore（讨论系统）
- football-data.org API（实时数据）
- QRCode.js（二维码生成）
- 部署：GitHub Pages
