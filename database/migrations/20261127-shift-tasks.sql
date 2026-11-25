-- Tabel progres "Rekap Pekerjaan" per shift, per staf, per tanggal.
-- Aditif & idempoten: aman dijalankan berulang.
-- Ditulis kompatibel MySQL 8 dan MariaDB 10.x (DEFAULT CHARSET, bukan DEFAULT CHARACTER SET).
CREATE TABLE IF NOT EXISTS shift_task_progress (
  id VARCHAR(128) NOT NULL,
  workspace_id VARCHAR(64) NOT NULL,
  task_date DATE NOT NULL,
  shift ENUM('opening','closing') NOT NULL,
  staff_id VARCHAR(128) NOT NULL,
  task_key VARCHAR(64) NOT NULL,
  done TINYINT(1) NOT NULL DEFAULT 0,
  note VARCHAR(500) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shift_task (workspace_id, task_date, shift, staff_id, task_key),
  KEY idx_shift_task_date (workspace_id, task_date, shift)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
