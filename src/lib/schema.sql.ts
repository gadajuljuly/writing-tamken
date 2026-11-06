// Idempotent schema, applied automatically on first use (works on PGlite and any PostgreSQL).
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  competition TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition, name)
);
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS minutes (
  id SERIAL PRIMARY KEY,
  competition TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  meeting_date TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL,
  source_file_id INTEGER REFERENCES files(id),
  raw_text TEXT NOT NULL DEFAULT '',
  draft JSONB,
  status TEXT NOT NULL DEFAULT 'draft',
  has_pending_changes BOOLEAN NOT NULL DEFAULT true,
  current_version INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  ai_organized BOOLEAN NOT NULL DEFAULT false,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS minute_versions (
  id SERIAL PRIMARY KEY,
  minute_id INTEGER NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,
  approved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (minute_id, version)
);
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  competition TEXT NOT NULL,
  axis INTEGER NOT NULL DEFAULT 6,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignees JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'not_started',
  notes TEXT NOT NULL DEFAULT '',
  proposal_approved BOOLEAN NOT NULL DEFAULT false,
  decision_minute_id INTEGER REFERENCES minutes(id) ON DELETE SET NULL,
  source_minute_id INTEGER REFERENCES minutes(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (competition, title_key)
);
CREATE TABLE IF NOT EXISTS task_items (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  file_id INTEGER REFERENCES files(id),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS suggestions (
  id SERIAL PRIMARY KEY,
  minute_id INTEGER NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  axis INTEGER NOT NULL DEFAULT 6,
  assignees JSONB NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'pending',
  duplicate_of INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  competition TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  entity TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  changes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_comp_idx ON tasks (competition);
CREATE INDEX IF NOT EXISTS minutes_comp_idx ON minutes (competition);
CREATE INDEX IF NOT EXISTS audit_comp_idx ON audit_log (competition, created_at DESC);
INSERT INTO members (competition, name) VALUES
  ('ar','غادة جلجولي'),('ar','راوية كتان بولوس'),('ar','تمارا مصطفى'),('ar','أروى علي'),
  ('ar','رشا سخنيني'),('ar','رنا مروات'),('ar','محمود جبارين'),('ar','مزنة طيبي')
ON CONFLICT DO NOTHING;
`;
