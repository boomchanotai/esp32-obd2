CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT UNIQUE NOT NULL,
  token_hash TEXT,
  name TEXT,
  vehicle_name TEXT,
  vehicle_plate TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE telemetry (
  id BIGSERIAL PRIMARY KEY,

  device_id UUID NOT NULL REFERENCES devices(id),
  recorded_at TIMESTAMP NOT NULL DEFAULT now(),

  rpm INT,
  speed FLOAT,
  coolant_temp FLOAT,
  throttle FLOAT,
  engine_load FLOAT,
  battery_voltage FLOAT,
  engine_oil_temp FLOAT,
  ambient_air_temp FLOAT,
  intake_map_kpa FLOAT,
  maf_air_flow_rate FLOAT,
  timing_advance FLOAT,
  engine_runtime_sec FLOAT,
  fuel_tank_level FLOAT,
  engine_fuel_rate FLOAT,
  fuel_type FLOAT,
  hybrid_battery_remaining_life FLOAT,
  mil_status BOOLEAN,
  dtc_count INT,

  latitude DOUBLE PRECISION NULL,
  longitude DOUBLE PRECISION NULL,

  raw JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_device_time
ON telemetry (device_id, recorded_at DESC);

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  device_id UUID NOT NULL REFERENCES devices(id),
  telemetry_id BIGINT NULL REFERENCES telemetry(id),

  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,

  message TEXT,
  value FLOAT,
  threshold FLOAT,

  occurred_at TIMESTAMP NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_alerts_device_occurred ON alerts (device_id, occurred_at DESC);
