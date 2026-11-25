-- DapurOps — operasional final: audit koreksi, tindak lanjut kebersihan,
-- dan kolom absensi untuk aturan shift (pulang awal, lintas tengah malam,
-- idempotensi submit).
-- Additive & aman diulang: semua CREATE memakai IF NOT EXISTS.
-- Catatan: kolom baru pada tabel attendance ditambahkan dengan ALTER di akhir berkas.
-- Jalankan ALTER itu satu kali saja (MariaDB/MySQL tidak mendukung ADD COLUMN IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS `attendance_audit` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attendance_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` enum('correction','absence','assignment_change') COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `before_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `after_json` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_ws` (`workspace_id`,`created_at`),
  KEY `idx_audit_att` (`workspace_id`,`attendance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cleanliness_followups` (
  `id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workspace_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `report_id` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `area_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `area_label` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('Perlu Ditangani','Sedang Ditangani','Selesai') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Perlu Ditangani',
  `pic_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pic_email` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pic_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolution_note` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolution_photo_id` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved_by_id` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved_by_email` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_followup_area` (`workspace_id`,`report_id`,`area_key`),
  KEY `idx_followup_status` (`workspace_id`,`status`),
  CONSTRAINT `fk_followup_ws` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `attendance`
  ADD COLUMN `early_leave_minutes` int DEFAULT NULL,
  ADD COLUMN `overnight` tinyint(1) NOT NULL DEFAULT '0',
  ADD COLUMN `client_ref` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD UNIQUE KEY `uq_att_client_ref` (`workspace_id`,`client_ref`);
