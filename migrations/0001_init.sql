CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  task_types TEXT NOT NULL,
  premium_rate REAL NOT NULL,
  basic_rate REAL NOT NULL DEFAULT 0.1,
  success_rate REAL NOT NULL,
  avg_latency_sec INTEGER NOT NULL,
  online INTEGER NOT NULL DEFAULT 1,
  owner TEXT,
  manifest_url TEXT,
  manifest_source TEXT,
  token TEXT,
  earnings REAL NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  parent_agent_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  input_json TEXT,
  budget_cap REAL,
  deadline_sec INTEGER,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_agent_id TEXT,
  score REAL,
  usage_json TEXT,
  billing_estimate_json TEXT,
  actual_billing_json TEXT,
  output_json TEXT,
  failure_reason TEXT,
  failure_category TEXT,
  callback_token TEXT,
  dispatch_json TEXT,
  logs_json TEXT,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  dispatched_at TEXT,
  started_at TEXT,
  last_callback_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  timed_out_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_agent_id ON jobs(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
