-- ResQ-AI Supabase Schema v2
-- Run in: Supabase Dashboard > SQL Editor > New Query > Run
-- Safe to re-run: uses IF NOT EXISTS and DO $$ blocks to avoid errors

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════
-- REPORTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id           text UNIQUE NOT NULL,
  source              text NOT NULL,
  original_message    text,
  timestamp           timestamptz NOT NULL,
  stage               int,
  is_user_submitted   boolean NOT NULL DEFAULT false,
  is_noise            boolean NOT NULL DEFAULT false,
  noise_category      text,
  emergency_type      text,
  location            text,
  location_confidence text,
  people_affected     int,
  vulnerable_people   text,
  resource_needed     text,
  urgency             text,
  ai_interpretation   text,
  confidence          int,
  status              text,
  incident_id         text,
  matched_terms       text[],
  ai_detected_status  text,
  audio_url           text,
  attachment_url      text,
  contact_info        text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_timestamp      ON reports(timestamp);
CREATE INDEX IF NOT EXISTS idx_reports_incident_id    ON reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_reports_stage          ON reports(stage);
CREATE INDEX IF NOT EXISTS idx_reports_emergency_type ON reports(emergency_type);
CREATE INDEX IF NOT EXISTS idx_reports_is_noise       ON reports(is_noise);
CREATE INDEX IF NOT EXISTS idx_reports_source         ON reports(source);

-- ═══════════════════════════════════════════
-- INCIDENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS incidents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       text UNIQUE NOT NULL,
  emergency_type    text NOT NULL,
  location          text NOT NULL,
  location_note     text,
  coordinates       jsonb,
  people_affected   int,
  vulnerable_people text,
  resource_needed   text,
  urgency           text NOT NULL DEFAULT 'high',
  status            text NOT NULL DEFAULT 'active',
  confidence        int,
  source_count      int NOT NULL DEFAULT 0,
  summary           text,
  uncertainty       text[],
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_updated      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status         ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_emergency_type ON incidents(emergency_type);
CREATE INDEX IF NOT EXISTS idx_incidents_urgency        ON incidents(urgency);

-- ═══════════════════════════════════════════
-- INCIDENT UPDATES (status change history)
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS incident_updates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id      text NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  event            text NOT NULL,
  detail           text,
  source_report_id text,
  update_type      text,
  timestamp        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inc_updates_incident_id ON incident_updates(incident_id);
CREATE INDEX IF NOT EXISTS idx_inc_updates_timestamp   ON incident_updates(timestamp);

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════
ALTER TABLE reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before re-creating (safe with IF EXISTS)
DROP POLICY IF EXISTS "public_read_reports"    ON reports;
DROP POLICY IF EXISTS "public_read_incidents"  ON incidents;
DROP POLICY IF EXISTS "public_read_updates"    ON incident_updates;
DROP POLICY IF EXISTS "anon_insert_reports"    ON reports;
DROP POLICY IF EXISTS "anon_insert_incidents"  ON incidents;
DROP POLICY IF EXISTS "anon_insert_updates"    ON incident_updates;
DROP POLICY IF EXISTS "anon_update_incidents"  ON incidents;
DROP POLICY IF EXISTS "anon_update_reports"    ON reports;

CREATE POLICY "public_read_reports"    ON reports          FOR SELECT USING (true);
CREATE POLICY "public_read_incidents"  ON incidents        FOR SELECT USING (true);
CREATE POLICY "public_read_updates"    ON incident_updates FOR SELECT USING (true);

CREATE POLICY "anon_insert_reports"    ON reports          FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_insert_incidents"  ON incidents        FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_insert_updates"    ON incident_updates FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_update_incidents"  ON incidents        FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "anon_update_reports"    ON reports          FOR UPDATE USING (true) WITH CHECK (true);
