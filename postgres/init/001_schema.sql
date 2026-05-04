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
  mil_status BOOLEAN,
  dtc_count INT,

  latitude DOUBLE PRECISION NULL,
  longitude DOUBLE PRECISION NULL,

  raw JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_telemetry_device_time
ON telemetry (device_id, recorded_at DESC);

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  device_id UUID NOT NULL REFERENCES devices(id),

  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP NULL,

  start_lat DOUBLE PRECISION NULL,
  start_lng DOUBLE PRECISION NULL,
  end_lat DOUBLE PRECISION NULL,
  end_lng DOUBLE PRECISION NULL,

  duration_seconds INT,
  avg_speed FLOAT,
  max_speed FLOAT,

  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

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

-- FSM for trip detection without GPS (movement/stop windows use telemetry timestamps)
CREATE TABLE trip_fsm (
  device_id UUID PRIMARY KEY REFERENCES devices(id),
  state TEXT NOT NULL DEFAULT 'idle',
  movement_since TIMESTAMP NULL,
  stop_since TIMESTAMP NULL,
  open_trip_id UUID NULL REFERENCES trips(id),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
