-- === 迁移脚本 V3：修复 RLS 缺失 SELECT 策略 ===
-- 在 Supabase SQL Editor 中执行此脚本
-- 解决问题：RLS 启用后无 SELECT 策略，导致所有读操作被拦截

-- ========== 1. profiles：允许所有人读取（展示作者信息） ==========
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles
  FOR SELECT USING (true);

-- ========== 2. posts：允许所有人读取（社区帖子公开可见） ==========
DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_all" ON posts
  FOR SELECT USING (true);

-- ========== 3. replies：允许所有人读取（回复公开可见） ==========
DROP POLICY IF EXISTS "replies_select_all" ON replies;
CREATE POLICY "replies_select_all" ON replies
  FOR SELECT USING (true);

-- ========== 4. post_likes：允许所有人读取（点赞数和状态查询） ==========
DROP POLICY IF EXISTS "post_likes_select_all" ON post_likes;
CREATE POLICY "post_likes_select_all" ON post_likes
  FOR SELECT USING (true);

-- ========== 5. reply_likes：允许所有人读取 ==========
DROP POLICY IF EXISTS "reply_likes_select_all" ON reply_likes;
CREATE POLICY "reply_likes_select_all" ON reply_likes
  FOR SELECT USING (true);

-- ========== 完成 ==========
-- 执行后请验证：
-- 1. SELECT * FROM posts LIMIT 3;（应返回数据）
-- 2. SELECT * FROM profiles LIMIT 3;（应返回数据）
-- 3. SELECT * FROM replies LIMIT 3;（应返回数据）
