-- ─── Bronze ingestion log ──────────────────────────────────────────────────────
-- The raw payload itself lives in R2 (bronze/<pipeline>/YYYY/MM/DD/HHmm.json);
-- this table is an index over it so we can query "what landed, when, from
-- where" without listing the R2 bucket, and so silver transforms know which
-- bronze objects they've already consumed (idempotency).
CREATE TABLE IF NOT EXISTS bronze_ingestion_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline        TEXT NOT NULL,
  r2_key          TEXT NOT NULL UNIQUE,
  source_url      TEXT NOT NULL,
  http_status     INTEGER,
  byte_size       INTEGER,
  fetched_at      TEXT NOT NULL, -- ISO8601
  period_start    TEXT,          -- the data period this payload covers, if known
  period_end      TEXT,
  processed_at    TEXT,          -- set once silver transform has consumed it
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bronze_pipeline ON bronze_ingestion_log(pipeline, fetched_at);
CREATE INDEX IF NOT EXISTS idx_bronze_unprocessed ON bronze_ingestion_log(pipeline, processed_at);

-- ─── Pipeline 1 — Carbon Intensity: Silver ─────────────────────────────────────
-- One row per half-hourly settlement period.
CREATE TABLE IF NOT EXISTS carbon_readings_silver (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  period_from         TEXT NOT NULL, -- ISO8601, UTC
  period_to           TEXT NOT NULL,
  actual_intensity    INTEGER,       -- gCO2/kWh, null if not yet published
  forecast_intensity  INTEGER NOT NULL,
  index_band          TEXT NOT NULL, -- very low | low | moderate | high | very high
  source_bronze_id    INTEGER NOT NULL REFERENCES bronze_ingestion_log(id),
  ingested_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(period_from)  -- idempotency: re-ingesting the same period overwrites, never duplicates
);
CREATE INDEX IF NOT EXISTS idx_carbon_silver_period ON carbon_readings_silver(period_from);

-- Generation mix (fuel type share) for the same half-hourly periods.
CREATE TABLE IF NOT EXISTS carbon_generation_mix_silver (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  period_from    TEXT NOT NULL,
  fuel_type      TEXT NOT NULL,
  percentage     REAL NOT NULL,
  source_bronze_id INTEGER NOT NULL REFERENCES bronze_ingestion_log(id),
  UNIQUE(period_from, fuel_type)
);
CREATE INDEX IF NOT EXISTS idx_carbon_mix_period ON carbon_generation_mix_silver(period_from);

-- ─── Pipeline 1 — Carbon Intensity: Gold ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS carbon_daily_gold (
  date                    TEXT PRIMARY KEY, -- YYYY-MM-DD
  avg_actual_intensity    REAL,
  avg_forecast_intensity  REAL,
  min_intensity           INTEGER,
  min_intensity_period    TEXT,
  max_intensity           INTEGER,
  max_intensity_period    TEXT,
  forecast_variance_pct   REAL,   -- (avg_actual - avg_forecast) / avg_forecast * 100
  reading_count           INTEGER NOT NULL,
  computed_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS carbon_fuel_mix_gold (
  date         TEXT NOT NULL,
  fuel_type    TEXT NOT NULL,
  avg_share    REAL NOT NULL,
  computed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, fuel_type)
);

-- ─── Pipeline 2 — Housing: Silver / Gold (schema ready ahead of build order) ──
CREATE TABLE IF NOT EXISTS housing_readings_silver (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  period           TEXT NOT NULL,   -- YYYY-MM
  region           TEXT NOT NULL,
  property_type    TEXT NOT NULL,
  average_price    REAL NOT NULL,
  sales_volume     INTEGER,
  source_bronze_id INTEGER NOT NULL REFERENCES bronze_ingestion_log(id),
  UNIQUE(period, region, property_type)
);

CREATE TABLE IF NOT EXISTS housing_regional_gold (
  period           TEXT NOT NULL,
  region           TEXT NOT NULL,
  average_price    REAL NOT NULL,
  mom_change_pct   REAL,
  yoy_change_pct   REAL,
  computed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (period, region)
);

-- ─── Pipeline 3 — Site meta-pipeline ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_events_silver (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL, -- 'deploy' | 'build' | 'analytics_snapshot'
  occurred_at  TEXT NOT NULL,
  detail_json  TEXT NOT NULL,
  source_bronze_id INTEGER REFERENCES bronze_ingestion_log(id)
);

-- ─── Data quality ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_quality_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline        TEXT NOT NULL,
  layer           TEXT NOT NULL,        -- bronze | silver | gold
  check_name      TEXT NOT NULL,        -- freshness | completeness | validity | uniqueness | referential
  status          TEXT NOT NULL,        -- pass | fail
  observed_value  TEXT,
  expected_value  TEXT,
  detail          TEXT,
  run_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dq_pipeline_time ON data_quality_runs(pipeline, run_at);

-- ─── Pipeline run history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline       TEXT NOT NULL,
  trigger_type   TEXT NOT NULL,   -- cron | manual | backfill
  status         TEXT NOT NULL,   -- running | success | failed
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT,
  rows_bronze    INTEGER,
  rows_silver    INTEGER,
  rows_gold      INTEGER,
  error_detail   TEXT
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline, started_at);

-- ─── Pipeline configuration (admin-editable: pause, thresholds) ────────────────
CREATE TABLE IF NOT EXISTS pipeline_config (
  pipeline                    TEXT PRIMARY KEY,
  paused                      INTEGER NOT NULL DEFAULT 0, -- boolean
  staleness_threshold_minutes INTEGER NOT NULL,
  min_expected_rows_per_run   INTEGER NOT NULL DEFAULT 1,
  visible_on_live_page        INTEGER NOT NULL DEFAULT 1, -- feature flag
  updated_at                  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO pipeline_config (pipeline, staleness_threshold_minutes, min_expected_rows_per_run) VALUES
  ('carbon', 90, 1),
  ('housing', 44640, 1), -- 31 days
  ('meta', 1440, 1)
ON CONFLICT(pipeline) DO NOTHING;

-- ─── Admin audit log — immutable, no delete/update capability by design ───────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email  TEXT NOT NULL,
  action       TEXT NOT NULL,
  target       TEXT,
  params_json  TEXT,
  result       TEXT NOT NULL, -- success | error
  detail       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON admin_audit_log(created_at);
