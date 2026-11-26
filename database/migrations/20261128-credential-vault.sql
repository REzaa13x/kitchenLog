-- Kredensial akun staf yang dapat dilihat Admin (terenkripsi dua arah).
-- Password login tetap memakai hash scrypt di kolom password_hash; kolom ini
-- hanya menyimpan salinan terenkripsi untuk ditampilkan ke Admin.
-- Aditif & idempoten.
ALTER TABLE users ADD COLUMN credential_secret TEXT DEFAULT NULL;
