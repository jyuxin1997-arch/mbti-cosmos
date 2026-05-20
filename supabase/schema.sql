-- 世界杯球迷社区 - Supabase 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. profiles 表
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  nickname text NOT NULL,
  masked_phone text,
  created_at timestamptz DEFAULT now(),
  last_login timestamptz
);

-- 2. posts 表
CREATE TABLE IF NOT EXISTS posts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  match_key text,
  category text DEFAULT 'discussion',
  likes_count bigint DEFAULT 0,
  replies_count bigint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3. replies 表
CREATE TABLE IF NOT EXISTS replies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  likes_count bigint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. post_likes 表
CREATE TABLE IF NOT EXISTS post_likes (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

-- 5. reply_likes 表
CREATE TABLE IF NOT EXISTS reply_likes (
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reply_id bigint NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, reply_id)
);

-- === 启用 RLS ===
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reply_likes ENABLE ROW LEVEL SECURITY;

-- === RLS 策略 ===

-- profiles
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- posts
CREATE POLICY "posts_select_all" ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_auth" ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts_delete_own" ON posts FOR DELETE USING (auth.uid() = author_id);

-- replies
CREATE POLICY "replies_select_all" ON replies FOR SELECT USING (true);
CREATE POLICY "replies_insert_auth" ON replies FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "replies_delete_own" ON replies FOR DELETE USING (auth.uid() = author_id);

-- post_likes
CREATE POLICY "likes_select_all" ON post_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_auth" ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_own" ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- reply_likes
CREATE POLICY "reply_likes_select_all" ON reply_likes FOR SELECT USING (true);
CREATE POLICY "reply_likes_insert_auth" ON reply_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reply_likes_delete_own" ON reply_likes FOR DELETE USING (auth.uid() = user_id);

-- === 触发器：replies_count 自动更新 ===
CREATE OR REPLACE FUNCTION update_post_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET replies_count = replies_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_replies_count
AFTER INSERT OR DELETE ON replies
FOR EACH ROW EXECUTE FUNCTION update_post_replies_count();

-- === 触发器：likes_count 自动更新 ===
CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_post_likes_count
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW EXECUTE FUNCTION update_post_likes_count();

CREATE OR REPLACE FUNCTION update_reply_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE replies SET likes_count = likes_count + 1 WHERE id = NEW.reply_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE replies SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.reply_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_reply_likes_count
AFTER INSERT OR DELETE ON reply_likes
FOR EACH ROW EXECUTE FUNCTION update_reply_likes_count();

-- === 索引 ===
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_match_key ON posts(match_key);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_post_id ON replies(post_id);
CREATE INDEX IF NOT EXISTS idx_replies_created_at ON replies(created_at);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
