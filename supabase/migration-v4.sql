-- === 迁移脚本 V4：修复 auth_uid 更新循环依赖 ===
-- 问题：匿名登录每次生成新UID，登录时需UPDATE profiles.auth_uid，
-- 但 profiles_update_own RLS 要求 auth.uid() = auth_uid（旧值≠新值），UPDATE被拦
-- 解法：创建 SECURITY DEFINER 函数绕过 RLS 更新 auth_uid

-- ========== 1. 创建登录更新函数（SECURITY DEFINER 绕过 RLS） ==========
CREATE OR REPLACE FUNCTION login_update_auth_uid(p_profile_id uuid, p_auth_uid uuid)
RETURNS SETOF profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 仅允许已认证用户调用
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE profiles SET auth_uid = p_auth_uid, last_login = now() WHERE id = p_profile_id;
  RETURN QUERY SELECT * FROM profiles WHERE id = p_profile_id;
END;
$$;

-- 限制只有 authenticated 角色可调用
REVOKE ALL ON FUNCTION login_update_auth_uid FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_update_auth_uid TO authenticated;

-- ========== 完成 ==========
-- 执行后验证：
-- SELECT proname, prosecdef FROM pg_proc WHERE proname = 'login_update_auth_uid';
-- 应返回 login_update_auth_uid | true
