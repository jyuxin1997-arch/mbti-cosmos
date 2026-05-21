-- === 迁移脚本 V2：社区交互升级 ===
-- 在 Supabase SQL Editor 中执行此脚本
-- 幂等设计：所有操作使用 IF NOT EXISTS / IF NOT EXISTS

-- ========== 1. profiles 表扩展 ==========
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level int DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS posts_count int DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS replies_count int DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS likes_received int DEFAULT 0;

-- 为已有用户设置默认头像（从预设库随机）
-- 前端会在登录时分配，这里给存量数据兜底
UPDATE profiles SET avatar_url = '⚽' WHERE avatar_url IS NULL;

-- ========== 2. posts 表扩展 ==========
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hot_score numeric DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_posts_hot_score ON posts(hot_score DESC NULLS LAST);

-- ========== 3. replies 表扩展 ==========
ALTER TABLE replies ADD COLUMN IF NOT EXISTS parent_reply_id bigint REFERENCES replies(id) ON DELETE CASCADE;
ALTER TABLE replies ADD COLUMN IF NOT EXISTS mention_user_ids uuid[];
ALTER TABLE replies ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_replies_parent ON replies(parent_reply_id);

-- ========== 4. notifications 表（新增） ==========
CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,             -- 'reply' / 'mention' / 'like'
  from_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  post_id bigint REFERENCES posts(id) ON DELETE CASCADE,
  reply_id bigint REFERENCES replies(id) ON DELETE CASCADE,
  content text,                   -- 通知摘要
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- notifications RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = notifications.user_id AND profiles.auth_uid = auth.uid())
  );

CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = notifications.user_id AND profiles.auth_uid = auth.uid())
  );

-- ========== 5. 触发器：hot_score 自动计算 ==========
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

DROP TRIGGER IF EXISTS trg_posts_hot_score ON posts;
CREATE TRIGGER trg_posts_hot_score
BEFORE INSERT OR UPDATE OF likes_count, replies_count ON posts
FOR EACH ROW EXECUTE FUNCTION update_post_hot_score();

-- ========== 6. 触发器：posts_count 自动更新 ==========
CREATE OR REPLACE FUNCTION update_profile_posts_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET posts_count = COALESCE(posts_count, 0) + 1 WHERE id = NEW.author_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET posts_count = GREATEST(COALESCE(posts_count, 0) - 1, 0) WHERE id = OLD.author_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profile_posts_count ON posts;
CREATE TRIGGER trg_profile_posts_count
AFTER INSERT OR DELETE ON posts
FOR EACH ROW EXECUTE FUNCTION update_profile_posts_count();

-- ========== 7. 触发器：replies_count 自动更新 ==========
CREATE OR REPLACE FUNCTION update_profile_replies_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET replies_count = COALESCE(replies_count, 0) + 1 WHERE id = NEW.author_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET replies_count = GREATEST(COALESCE(replies_count, 0) - 1, 0) WHERE id = OLD.author_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profile_replies_count ON replies;
CREATE TRIGGER trg_profile_replies_count
AFTER INSERT OR DELETE ON replies
FOR EACH ROW EXECUTE FUNCTION update_profile_replies_count();

-- ========== 8. 触发器：likes_received 自动更新 ==========
-- post_likes 触发
CREATE OR REPLACE FUNCTION update_profile_likes_from_posts()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET likes_received = COALESCE(likes_received, 0) + 1
    WHERE id = (SELECT author_id FROM posts WHERE posts.id = NEW.post_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET likes_received = GREATEST(COALESCE(likes_received, 0) - 1, 0)
    WHERE id = (SELECT author_id FROM posts WHERE posts.id = OLD.post_id);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profile_likes_from_posts ON post_likes;
CREATE TRIGGER trg_profile_likes_from_posts
AFTER INSERT OR DELETE ON post_likes
FOR EACH ROW EXECUTE FUNCTION update_profile_likes_from_posts();

-- reply_likes 触发
CREATE OR REPLACE FUNCTION update_profile_likes_from_replies()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET likes_received = COALESCE(likes_received, 0) + 1
    WHERE id = (SELECT author_id FROM replies WHERE replies.id = NEW.reply_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET likes_received = GREATEST(COALESCE(likes_received, 0) - 1, 0)
    WHERE id = (SELECT author_id FROM replies WHERE replies.id = OLD.reply_id);
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_profile_likes_from_replies ON reply_likes;
CREATE TRIGGER trg_profile_likes_from_replies
AFTER INSERT OR DELETE ON reply_likes
FOR EACH ROW EXECUTE FUNCTION update_profile_likes_from_replies();

-- ========== 9. 触发器：回复通知 ==========
CREATE OR REPLACE FUNCTION notify_on_reply()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
  post_title text;
BEGIN
  -- 获取帖子作者和标题
  SELECT author_id, title INTO post_author_id, post_title
  FROM posts WHERE id = NEW.post_id;

  -- 不通知自己
  IF post_author_id IS NOT NULL AND post_author_id != NEW.author_id THEN
    INSERT INTO notifications (user_id, type, from_user_id, post_id, reply_id, content)
    VALUES (post_author_id, 'reply', NEW.author_id, NEW.post_id, NEW.id,
      LEFT(NEW.content, 50));
  END IF;

  -- @提及通知
  IF NEW.mention_user_ids IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, from_user_id, post_id, reply_id, content)
    SELECT uid, 'mention', NEW.author_id, NEW.post_id, NEW.id, LEFT(NEW.content, 50)
    FROM unnest(NEW.mention_user_ids) AS uid
    WHERE uid != NEW.author_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notification_on_reply ON replies;
CREATE TRIGGER trg_notification_on_reply
AFTER INSERT ON replies
FOR EACH ROW EXECUTE FUNCTION notify_on_reply();

-- ========== 10. 新增 RLS 策略：帖子编辑 + 回复编辑 ==========
CREATE POLICY "posts_update_own" ON posts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = posts.author_id AND profiles.auth_uid = auth.uid())
  );

CREATE POLICY "replies_update_own" ON replies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = replies.author_id AND profiles.auth_uid = auth.uid())
  );

-- ========== 11. 触发器：点赞通知（可选，P1） ==========
CREATE OR REPLACE FUNCTION notify_on_post_like()
RETURNS TRIGGER AS $$
DECLARE
  post_author_id uuid;
  post_title text;
BEGIN
  SELECT author_id, title INTO post_author_id, post_title
  FROM posts WHERE id = NEW.post_id;

  IF post_author_id IS NOT NULL AND post_author_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, type, from_user_id, post_id, content)
    VALUES (post_author_id, 'like', NEW.user_id, NEW.post_id,
      '赞了你的帖子');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notification_on_post_like ON post_likes;
CREATE TRIGGER trg_notification_on_post_like
AFTER INSERT ON post_likes
FOR EACH ROW EXECUTE FUNCTION notify_on_post_like();

-- ========== 完成 ==========
-- 执行后请验证：
-- 1. SELECT * FROM notifications LIMIT 1;（应报空表但无错误）
-- 2. SELECT avatar_url, level, posts_count FROM profiles LIMIT 3;
-- 3. SELECT hot_score, is_pinned FROM posts LIMIT 3;
