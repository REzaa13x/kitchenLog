-- Per-action evidence. Existing attendance remains valid with NULL evidence.
ALTER TABLE attendance
  ADD COLUMN check_in_cleanliness LONGTEXT NULL,
  ADD COLUMN check_out_cleanliness LONGTEXT NULL,
  MODIFY COLUMN check_in_photo_id VARCHAR(200) NULL,
  MODIFY COLUMN check_out_photo_id VARCHAR(200) NULL;
