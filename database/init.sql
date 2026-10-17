CREATE TABLE IF NOT EXISTS scans (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  accessibility_score INTEGER NOT NULL CHECK (accessibility_score BETWEEN 0 AND 100),
  axe_score INTEGER,
  lighthouse_score INTEGER,
  scan_duration_ms INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  error_message TEXT,
  scan_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS violations (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  rule_id VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  help_url TEXT,
  impact VARCHAR(10) NOT NULL CHECK (impact IN ('critical', 'serious', 'moderate', 'minor')),
  element TEXT,
  wcag_tags TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_scans_scan_date_desc ON scans (scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_violations_scan_id ON violations (scan_id);
CREATE INDEX IF NOT EXISTS idx_violations_impact ON violations (impact);
