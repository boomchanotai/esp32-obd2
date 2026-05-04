#!/usr/bin/env sh
# Publish one telemetry JSON to local Mosquitto (requires broker on localhost:1883).
set -e
HOST="${MQTT_HOST:-host.docker.internal}"
USER="${MQTT_USER:-esp32_device}"
PASS="${MQTT_PASS:-obd_dev_mqtt}"
TOPIC="${1:-obd2/obd-kicks-001/telemetry}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD=$(printf '{"device_id":"obd-kicks-001","timestamp":"%s","rpm":1200,"speed":35.5,"coolant_temp":88,"throttle":12.0,"engine_load":22.0,"battery_voltage":13.9,"mil_status":false,"dtc_count":0}' "$TS")

docker run --rm eclipse-mosquitto:2 \
  mosquitto_pub -h "$HOST" -p 1883 -u "$USER" -P "$PASS" -t "$TOPIC" -m "$PAYLOAD" -q 1

echo "Published to $TOPIC"
