-- users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'panitia'))
);

-- folders table
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama_folder TEXT NOT NULL,
    drive_folder_id TEXT,
    dibuat_pada DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- students table
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER NOT NULL,
    nisn TEXT UNIQUE,
    nik TEXT,
    nama_siswa TEXT NOT NULL,
    kelas TEXT,
    tempat_lahir TEXT,
    tanggal_lahir DATE,
    jenis_kelamin TEXT CHECK(jenis_kelamin IN ('L', 'P')),
    link_kk TEXT,
    link_akte TEXT,
    link_ktp TEXT,
    link_foto TEXT,
    catatan TEXT,
    status_dokumen TEXT DEFAULT 'Belum Lengkap',
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Optional: Create some indexes for faster lookup
CREATE INDEX IF NOT EXISTS idx_students_folder_id ON students(folder_id);
CREATE INDEX IF NOT EXISTS idx_students_nisn ON students(nisn);
