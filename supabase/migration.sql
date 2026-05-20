-- === 迁移脚本：添加 auth_uid 列 + 更新 RLS 策略 ===
-- 在 Supabase SQL Editor 中执行此脚本
-- 解决问题：匿名登录每次创建新 uid，导致 profiles.id 与 auth.uid() 不匹配

-- 1. 添加 auth_uid 列到 profiles 表
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_uid uuid;

-- 2. 为已有数据填充 auth_uid（首次迁移时 id = auth_uid）
UPDATE profiles SET auth_uid = id WHERE auth_uid IS NULL;

-- 3. 创建 auth_uid 索引
CREATE INDEX IF NOT EXISTS idx_profiles_auth_uid ON profiles(auth_uid);

-- ========== 删除旧的 RLS 策略 ==========

-- profiles 旧策略
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- posts 旧策略
DROP POLICY IF EXISTS "posts_insert_auth" ON posts;
DROP POLICY IF EXISTS "posts_delete_own" ON posts;

-- replies 旧策略
DROP POLICY IF EXISTS "replies_insert_auth" ON replies;
DROP POLICY IF EXISTS "replies_delete_own" ON replies;

-- post_likes 旧策略
DROP POLICY IF EXISTS "likes_insert_auth" ON post_likes;
DROP POLICY IF EXISTS "likes_delete_own" ON post_likes;

-- reply_likes 旧策略
DROP POLICY IF EXISTS "reply_likes_insert_auth" ON reply_likes;
DROP POLICY IF EXISTS "reply_likes_delete_own" ON reply_likes;

-- ========== 创建新的 RLS 策略（基于 auth_uid） ==========

-- profiles：通过 auth_uid 匹配
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = auth_uid);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = auth_uid);

-- posts：通过 author_id 关联 profiles.auth_uid 匹配
CREATE POLICY "posts_insert_auth" ON posts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = posts.author_id AND profiles.auth_uid = auth.uid())
  );

CREATE POLICY "posts_delete_own" ON posts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = posts.author_id AND profiles.auth_uid = auth.uid())
  );

-- replies：同上逻辑
CREATE POLICY "replies_insert_auth" ON replies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = replies.author_id AND profiles.auth_uid = auth.uid())
  );

CREATE POLICY "replies_delete_own" ON replies
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = replies.author_id AND profiles.auth_uid = auth.uid())
  );

-- post_likes：通过 user_id 关联 profiles.auth_uid 匹配
CREATE POLICY "likes_insert_auth" ON post_likes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = post_likes.user_id AND profiles.auth_uid = auth.uid())
  );

CREATE POLICY "likes_delete_own" ON post_likes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = post_likes.user_id AND profiles.auth_uid = auth.uid())
  );

-- reply_likes：同上逻辑
CREATE POLICY "reply_likes_insert_auth" ON reply_likes
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = reply_likes.user_id AND profiles.auth_uid = auth.uid())
  );

CREATE POLICY "reply_likes_delete_own" ON reply_likes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = reply_likes.user_id AND profiles.auth_uid = auth.uid())
  );
