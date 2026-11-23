-- DapurOps only. Select the target database first. Run once before backend rollout.
-- Additive: existing users remain unchanged. MySQL UNIQUE permits multiple NULLs.
ALTER TABLE users ADD COLUMN username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_users_username (username);
