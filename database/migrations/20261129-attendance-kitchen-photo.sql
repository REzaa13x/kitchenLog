ALTER TABLE attendance
  ADD COLUMN check_in_kitchen_photo_id VARCHAR(200) NULL,
  ADD COLUMN check_out_kitchen_photo_id VARCHAR(200) NULL,
  ADD COLUMN check_out_client_ref VARCHAR(128) NULL;
