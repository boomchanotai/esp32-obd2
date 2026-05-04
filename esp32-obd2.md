# ESP32 OBD2 Cloud MVP

## Goal

Build an MVP system where an ESP32 OBD2 device reads car data, connects to the internet through an Air Card Wi-Fi hotspot, and sends vehicle telemetry to a cloud server.

---

## System Architecture

```txt
ESP32 OBD2
  ↓ Wi-Fi via Air Card
MQTT Broker on VM
  ↓
Go Worker / API
  ↓
PostgreSQL
  ↓
Dashboard / Analytics
```

---

## Data Flow

```txt
1. ESP32 connects to Air Card Wi-Fi
2. ESP32 reads OBD2 values
3. ESP32 publishes data to MQTT
4. MQTT Broker receives telemetry
5. Go Worker subscribes to MQTT topic
6. Worker validates payload
7. Worker inserts data into PostgreSQL
8. Dashboard/API reads from PostgreSQL
```

---

## MQTT Design

### Broker

Use Mosquitto for MVP.

### Topics

```txt
obd2/{device_id}/telemetry
obd2/{device_id}/status
obd2/{device_id}/event
obd2/{device_id}/command
```

### Example

```txt
obd2/obd-kicks-001/telemetry
```

---

## MQTT Payload

```json
{
  "device_id": "obd-kicks-001",
  "timestamp": "2026-05-04T14:30:00+07:00",
  "rpm": 1387,
  "speed": 42,
  "coolant_temp": 82,
  "throttle": 18.5,
  "engine_load": 36.2,
  "battery_voltage": 13.8,
  "mil_status": false,
  "dtc_count": 0
}
```

---

## Telemetry Fields

| Field             |            Type | Meaning                             | Usage                                   |
| ----------------- | --------------: | ----------------------------------- | --------------------------------------- |
| `device_id`       |          string | Unique ID of each ESP32 OBD2 device | Identify which device/car sent the data |
| `timestamp`       | string/datetime | Time when the data was read         | Graphs, logs, trip detection            |
| `rpm`             |         integer | Engine revolutions per minute       | Detect engine activity/load             |
| `speed`           |           float | Vehicle speed in km/h               | Driving behavior, trip logic            |
| `coolant_temp`    |           float | Engine coolant temperature in °C    | Overheat alerts                         |
| `throttle`        |           float | Throttle position percentage        | Acceleration behavior                   |
| `engine_load`     |           float | Calculated engine load percentage   | Engine workload                         |
| `battery_voltage` |           float | ECU/control module voltage          | Battery/alternator health               |
| `mil_status`      |         boolean | Check Engine light status           | Alert if MIL is on                      |
| `dtc_count`       |         integer | Number of diagnostic trouble codes  | Detect vehicle fault count              |

---

## No GPS Yet

Current MVP does not include GPS.

Do not require these fields yet:

```txt
latitude
longitude
altitude
heading
gps_speed
```

But database can keep latitude/longitude nullable for future upgrade.

---

## Trip Logic Without GPS

Trip start condition:

```txt
speed > 0 OR rpm > 0
for more than 30 seconds
```

Trip end condition:

```txt
speed = 0
AND rpm = 0 or no data
for more than 5–10 minutes
```

This allows basic trip/session tracking without GPS.

---

## PostgreSQL Schema

### Enable UUID

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

---

## devices

```sql
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
```

---

## telemetry

```sql
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
```

### Index

```sql
CREATE INDEX idx_telemetry_device_time
ON telemetry (device_id, recorded_at DESC);
```

Optional future index:

```sql
CREATE INDEX idx_telemetry_recorded_at
ON telemetry (recorded_at DESC);
```

---

## trips

```sql
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
```

---

## alerts

```sql
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
```

Example alert types:

```txt
ENGINE_OVERHEAT
LOW_BATTERY
CHECK_ENGINE_ON
HIGH_RPM
NO_DATA
```

---

## Docker Compose MVP

```yaml
services:
  mosquitto:
    image: eclipse-mosquitto:2
    container_name: obd-mosquitto
    ports:
      - "1883:1883"
      - "8883:8883"
    volumes:
      - ./mosquitto/config:/mosquitto/config
      - ./mosquitto/data:/mosquitto/data
      - ./mosquitto/log:/mosquitto/log
    restart: unless-stopped

  postgres:
    image: postgres:16
    container_name: obd-postgres
    environment:
      POSTGRES_DB: obd
      POSTGRES_USER: obd
      POSTGRES_PASSWORD: change_me
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  api:
    build: ./api
    container_name: obd-api
    environment:
      DATABASE_URL: postgres://obd:change_me@postgres:5432/obd?sslmode=disable
      MQTT_BROKER_URL: tcp://mosquitto:1883
    depends_on:
      - postgres
      - mosquitto
    restart: unless-stopped
```

Important:

```txt
Do not expose PostgreSQL to the public internet.
Only API and MQTT should be reachable from outside.
Use TLS for production MQTT on port 8883.
```

---

## Mosquitto Config MVP

File:

```txt
mosquitto/config/mosquitto.conf
```

Basic development config:

```conf
persistence true
persistence_location /mosquitto/data/

log_dest file /mosquitto/log/mosquitto.log
log_dest stdout

listener 1883
allow_anonymous false
password_file /mosquitto/config/passwords
```

Create password:

```bash
docker exec -it obd-mosquitto mosquitto_passwd -c /mosquitto/config/passwords esp32_device
```

---

## ESP32 Behavior

ESP32 should:

```txt
1. Connect to Air Card Wi-Fi
2. Connect to MQTT Broker
3. Read supported OBD2 PIDs
4. Build JSON payload
5. Publish to telemetry topic
6. Retry if failed
7. Reconnect Wi-Fi/MQTT if disconnected
```

Recommended publish interval:

```txt
Every 5 seconds for MVP
```

For testing:

```txt
Every 1 second is okay, but not required
```

---

## MVP OBD2 Values to Read

Read these first:

```txt
RPM
Speed
Coolant Temperature
Throttle Position
Engine Load
Control Module Voltage
MIL Status
DTC Count
```

Standard OBD2 PIDs commonly used:

```txt
010C = Engine RPM
010D = Vehicle Speed
0105 = Coolant Temperature
0111 = Throttle Position
0104 = Calculated Engine Load
0142 = Control Module Voltage
0101 = Monitor status / MIL / DTC count
```

Not every car supports every PID. ESP32 should check supported PIDs first.

---

## Backend Worker Logic

The Go worker should:

```txt
1. Subscribe to obd2/+/telemetry
2. Parse device_id from topic or payload
3. Validate device exists
4. Validate required fields
5. Insert telemetry into PostgreSQL
6. Check alert conditions
7. Update trip state if needed
```

---

## Alert Rules MVP

### Engine Overheat

```txt
coolant_temp >= 100°C
```

### Low Battery

```txt
battery_voltage < 12.0V while engine off
battery_voltage < 13.0V while engine running
```

### Check Engine

```txt
mil_status = true
OR dtc_count > 0
```

### High RPM

```txt
rpm > 4000
```

---

## API Endpoints

MVP API:

```txt
GET /devices
GET /devices/:id
GET /devices/:id/telemetry
GET /devices/:id/latest
GET /devices/:id/trips
GET /devices/:id/alerts
```

Optional:

```txt
POST /devices
POST /devices/:id/command
```

---

## Dashboard MVP

Show:

```txt
Latest speed
Latest RPM
Coolant temperature
Battery voltage
Check Engine status
DTC count
Last seen time
Simple telemetry graph
Alerts list
```

---

## Security Notes

Do:

```txt
Use MQTT username/password
Use TLS for MQTT in production
Do not expose PostgreSQL publicly
Use firewall
Use device token or MQTT credential per device
Validate device_id server-side
```

Do not:

```txt
Do not let ESP32 connect directly to PostgreSQL
Do not trust device_id alone
Do not expose port 5432 publicly
```

---

## Recommended Implementation Order

```txt
1. Set up VM
2. Install Docker Compose
3. Run Mosquitto + PostgreSQL
4. Create DB schema
5. Build Go MQTT worker
6. Make ESP32 publish mock telemetry
7. Store telemetry in PostgreSQL
8. Build simple dashboard
9. Add real OBD2 readings
10. Add alerts
11. Add trip logic
12. Add TLS and production security
```

---

## Final MVP Stack

```txt
Device:
ESP32 OBD2 + Air Card Wi-Fi

Protocol:
MQTT

Cloud:
Single VM

Services:
Mosquitto
Go Worker/API
PostgreSQL
Dashboard

Database:
PostgreSQL

Main telemetry:
device_id
timestamp
rpm
speed
coolant_temp
throttle
engine_load
battery_voltage
mil_status
dtc_count
```
