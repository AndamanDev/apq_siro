-- ========================================================================
-- Queue 2026 : SQLite schema
-- ========================================================================

CREATE TABLE IF NOT EXISTS rooms (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,            -- 'L6','L8'
  name           TEXT NOT NULL,                   -- 'เครื่องฉายรังสี L6'
  display_order  INTEGER NOT NULL DEFAULT 0,      -- ลำดับช่องบนจอแสดงผล
  voice_room_key TEXT,                            -- คีย์ไฟล์เสียงชื่อห้อง
  color          TEXT,                            -- สีประจำห้อง (ปุ่ม kiosk/จอ) เช่น '#22a45d'
  active         INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS time_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id    INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  slot_code  TEXT NOT NULL,                       -- '08' = 08:00-09:00
  start_min  INTEGER NOT NULL,                    -- 480
  end_min    INTEGER NOT NULL,                    -- 540
  quota      INTEGER NOT NULL DEFAULT 0,          -- 0 = ไม่จำกัด
  quota_mode TEXT NOT NULL DEFAULT 'warn',        -- 'block'|'allow'|'warn'
  active     INTEGER NOT NULL DEFAULT 1,
  UNIQUE(room_id, slot_code)
);

CREATE TABLE IF NOT EXISTS queue_counters (
  room_id      INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  service_date TEXT NOT NULL,                      -- 'YYYY-MM-DD'
  slot_code    TEXT NOT NULL,
  last_seq     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, service_date, slot_code)
);

CREATE TABLE IF NOT EXISTS queues (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_number  TEXT NOT NULL,                     -- 'L60801'
  room_id       INTEGER NOT NULL REFERENCES rooms(id),
  service_date  TEXT NOT NULL,
  slot_code     TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'waiting',   -- waiting|called|parked|serving|done|skipped|cancelled
  station       TEXT,
  over_quota    INTEGER NOT NULL DEFAULT 0,
  issued_at     TEXT NOT NULL,
  called_at     TEXT,
  last_call_at  TEXT,
  recall_count  INTEGER NOT NULL DEFAULT 0,
  parked_at     TEXT,
  serving_at    TEXT,
  done_at       TEXT,
  UNIQUE(room_id, service_date, slot_code, seq)
);

CREATE TABLE IF NOT EXISTS queue_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  event    TEXT NOT NULL,                          -- issued|called|recalled|parked|resumed|serving|done|skipped|cancelled
  station  TEXT,
  at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_profiles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  logo_path   TEXT,
  header_text TEXT,
  footer_text TEXT,
  show_qr     INTEGER NOT NULL DEFAULT 0,
  copies      INTEGER NOT NULL DEFAULT 1,
  layout_json TEXT
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,                      -- 'image'|'video'
  path         TEXT NOT NULL,
  title        TEXT,
  duration_sec INTEGER DEFAULT 10,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  volume       INTEGER NOT NULL DEFAULT 0,         -- 0-100
  muted        INTEGER NOT NULL DEFAULT 1,
  active       INTEGER NOT NULL DEFAULT 1,
  fit          TEXT NOT NULL DEFAULT 'cover'        -- 'cover'=เต็มกรอบ | 'contain'=ตามขนาดจริง
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff',     -- admin|staff
  display_name  TEXT
);

CREATE TABLE IF NOT EXISTS satisfaction (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  queue_id INTEGER REFERENCES queues(id),
  room_id  INTEGER REFERENCES rooms(id),
  score    INTEGER NOT NULL,
  at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queues_active ON queues(room_id, status, service_date);
CREATE INDEX IF NOT EXISTS idx_queues_date   ON queues(service_date);
CREATE INDEX IF NOT EXISTS idx_events_at      ON queue_events(at);
CREATE INDEX IF NOT EXISTS idx_events_queue   ON queue_events(queue_id);
