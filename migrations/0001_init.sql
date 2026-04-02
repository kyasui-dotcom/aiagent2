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
  token TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  parent_agent_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  input_json TEXT,
  budget_cap REAL,
  deadline_sec INTEGER,
  status TEXT NOT NULL,
  assigned_agent_id TEXT,
  score REAL,
  billing_estimate_json TEXT,
  actual_billing_json TEXT,
  output_json TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
