-- Apply once before deploying the Geasteats client. Existing users remain unlinked.
ALTER TABLE users ADD COLUMN geasteats_staff_id varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL, ADD UNIQUE KEY uq_users_geasteats_staff_id (geasteats_staff_id);
ALTER TABLE users MODIFY COLUMN phone varchar(50) DEFAULT NULL;
