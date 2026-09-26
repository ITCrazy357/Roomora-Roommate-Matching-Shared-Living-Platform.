BEGIN;

-- Chỉ gỡ cấu trúc OAuth chưa sử dụng; không xóa dữ liệu tài khoản hiện có.
LOCK TABLE "oauth_accounts", "oauth_states", "users" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "oauth_accounts")
    OR EXISTS (SELECT 1 FROM "oauth_states")
    OR EXISTS (SELECT 1 FROM "users" WHERE "password_hash" IS NULL) THEN
    RAISE EXCEPTION 'Cannot remove OAuth while OAuth data or passwordless users exist';
  END IF;
END $$;

DROP TABLE "oauth_states";
DROP TABLE "oauth_accounts";
DROP TYPE "AuthProvider";
ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL;

COMMIT;
