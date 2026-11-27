-- ============================================================
--  KitchenLog / DapurOps — Skema Database MySQL
--  Dibuat: 23 November 2026
--  Sumber: database produksi `ngola_dapurops` (Kroombox panel)
-- ============================================================
--
--  CARA IMPORT KE XAMPP (phpMyAdmin lokal):
--
--  1. Buka http://localhost/phpmyadmin
--  2. Klik tab "Import" (jangan buat database dulu — file ini membuatnya)
--  3. Pilih file ini, klik "Go"
--  4. Database `ngola_dapurops` akan muncul di sidebar dengan 9 tabel
--
--  Catatan: file ini berisi STRUKTUR saja (tanpa data), jadi aman
--  dijalankan berulang. Password akun tidak disalin.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `ngola_dapurops`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ngola_dapurops`;

-- ------------------------------------------------------------
-- 1. users — akun pengguna (email, password hash, nomor telepon)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('staff','supervisor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff',
  `job_title` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Staf Dapur',
  `email_verified` tinyint(1) NOT NULL DEFAULT '0',
  `verify_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reset_token` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reset_expires` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 2. workspaces — ruang kerja dapur (satu dapur = satu workspace)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `workspaces`;
CREATE TABLE `workspaces` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kitchen_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `member_emails` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `supervisor_emails` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 3. sessions — token login (berlaku 30 hari)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `sessions`;
CREATE TABLE `sessions` (
  `token` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`token`),
  KEY `idx_sessions_user` (`user_id`),
  CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 4. staff — anggota tim dapur per workspace
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `staff`;
CREATE TABLE `staff` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('staff','supervisor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff',
  `job_title` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_staff_ws` (`workspace_id`),
  KEY `idx_staff_email` (`email`),
  CONSTRAINT `fk_staff_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 5. assignments — jadwal shift (opening / closing)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `assignments`;
CREATE TABLE `assignments` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shift_date` date NOT NULL,
  `shift` enum('opening','closing') COLLATE utf8mb4_unicode_ci NOT NULL,
  `staff_ids` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `pic_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_assign_ws_date_shift` (`workspace_id`,`shift_date`,`shift`),
  CONSTRAINT `fk_assign_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 6. attendance — absensi masuk/pulang + keterlambatan
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `attendance`;
CREATE TABLE `attendance` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assignment_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `att_date` date NOT NULL,
  `shift` enum('opening','closing') COLLATE utf8mb4_unicode_ci NOT NULL,
  `staff_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `staff_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `check_in_time` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_in_minutes` int DEFAULT NULL,
  `check_out_time` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_out_minutes` int DEFAULT NULL,
  `late_minutes` int NOT NULL DEFAULT '0',
  `duration_minutes` int DEFAULT NULL,
  `check_in_photo_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_out_photo_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_in_kitchen_photo_id` varchar(200) DEFAULT NULL,
  `check_out_kitchen_photo_id` varchar(200) DEFAULT NULL,
  `check_out_client_ref` varchar(128) DEFAULT NULL,
  `supervisor_status` enum('Izin','Sakit','Alpa') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supervisor_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_att` (`workspace_id`,`assignment_id`,`staff_id`),
  KEY `idx_att_date` (`workspace_id`,`att_date`),
  CONSTRAINT `fk_att_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 7. cleanliness_reports — checklist 6 area + ringkasan serah terima
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `cleanliness_reports`;
CREATE TABLE `cleanliness_reports` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_date` date NOT NULL,
  `shift` enum('opening','closing') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pic_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pic_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pic_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted_at` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `submitted_time` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `areas_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `general_photo_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `handover_note` text COLLATE utf8mb4_unicode_ci,
  `confirmed_summary` text COLLATE utf8mb4_unicode_ci,
  `summary_confirmed_at` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `summary_confirmed_by` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clean` (`workspace_id`,`report_date`,`shift`),
  CONSTRAINT `fk_clean_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 8. item_reports — laporan barang rusak / hilang
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `item_reports`;
CREATE TABLE `item_reports` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('Barang Rusak','Barang Hilang') COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `location` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_known_location` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discovered_at` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `photo_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reporter_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reporter_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reporter_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shift` enum('opening','closing') COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_date` date NOT NULL,
  `status` enum('Dilaporkan','Ditindaklanjuti','Selesai') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Dilaporkan',
  `resolution_note` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_item_ws_status` (`workspace_id`,`status`),
  CONSTRAINT `fk_item_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- 9. photos — foto laporan (disimpan sebagai data URL)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS `photos`;
CREATE TABLE `photos` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data_url` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` enum('camera','upload') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'camera',
  `uploader_email` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_photos_ws` (`workspace_id`),
  CONSTRAINT `fk_photos_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  SELESAI — 9 tabel dibuat.
--
--  Verifikasi cepat setelah import, jalankan:
--    SHOW TABLES;
--    SELECT COUNT(*) FROM users;
--
--  Untuk membuat akun pertama lewat API (bukan lewat SQL):
--    POST /api/auth/register
--    { "name": "...", "email": "...", "phone": "08...", "password": "..." }
-- ============================================================
