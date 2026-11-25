CREATE TABLE IF NOT EXISTS private_photos (
 workspace_id VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 id VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 user_id VARCHAR(200) NOT NULL,
 source ENUM('camera','upload') NOT NULL,
 mime_type VARCHAR(20) NOT NULL,
 data MEDIUMBLOB NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (workspace_id, id),
 KEY photos_owner (workspace_id, user_id)
) ENGINE=InnoDB;
