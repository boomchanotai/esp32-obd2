#!/usr/bin/env sh
# Publish telemetry JSON to Mosquitto in a loop with random values (broker on localhost:1883).
# Usage: ./scripts/publish-sample-telemetry.sh [topic]
# Env: MQTT_HOST, MQTT_USER, MQTT_PASS, DEVICE_ID, INTERVAL_SEC, MAX_PUBLISH,
#      RPM_MIN/MAX, SPEED_MIN/MAX, COOLANT_MIN/MAX, THROTTLE_MIN/MAX,
#      LOAD_MIN/MAX, BATTERY_MIN/MAX
# COMMAND:
# ./scripts/publish-sample-telemetry.sh INTERVAL_SEC=0.5 ./scripts/publish-sample-telemetry.sh MAX_PUBLISH=20 INTERVAL_SEC=1 ./scripts/publish-sample-telemetry.sh DEVICE_ID=obd-test-002 RPM_MAX=3000 ./scripts/publish-sample-telemetry.sh 'obd2/obd-test-002/telemetry'
set -e

HOST="${MQTT_HOST:-host.docker.internal}"
USER="${MQTT_USER:-esp32_device}"
PASS="${MQTT_PASS:-obd_dev_mqtt}"
DEVICE_ID="${DEVICE_ID:-obd-kicks-001}"
TOPIC="${1:-obd2/${DEVICE_ID}/telemetry}"
INTERVAL_SEC="${INTERVAL_SEC:-2}"
MAX_PUBLISH="${MAX_PUBLISH:-0}" # 0 = infinite

RPM_MIN="${RPM_MIN:-750}"
RPM_MAX="${RPM_MAX:-5200}"
SPEED_MIN="${SPEED_MIN:-0}"
SPEED_MAX="${SPEED_MAX:-115}"
COOLANT_MIN="${COOLANT_MIN:-78}"
COOLANT_MAX="${COOLANT_MAX:-102}"
THROTTLE_MIN="${THROTTLE_MIN:-0}"
THROTTLE_MAX="${THROTTLE_MAX:-85}"
LOAD_MIN="${LOAD_MIN:-5}"
LOAD_MAX="${LOAD_MAX:-88}"
BATTERY_MIN="${BATTERY_MIN:-12.2}"
BATTERY_MAX="${BATTERY_MAX:-14.4}"

# One row: rpm speed coolant throttle load battery mil dtc (space-separated)
sample_row() {
  SEED=$(od -An -N4 -tu4 /dev/urandom 2>/dev/null | tr -d ' \n')
  [ -z "$SEED" ] && SEED=$$
  awk -v seed="$SEED" \
    -v rmin="$RPM_MIN" -v rmax="$RPM_MAX" \
    -v smin="$SPEED_MIN" -v smax="$SPEED_MAX" \
    -v cmin="$COOLANT_MIN" -v cmax="$COOLANT_MAX" \
    -v tmin="$THROTTLE_MIN" -v tmax="$THROTTLE_MAX" \
    -v lmin="$LOAD_MIN" -v lmax="$LOAD_MAX" \
    -v bmin="$BATTERY_MIN" -v bmax="$BATTERY_MAX" \
    'BEGIN{
      srand(seed)
      rpm=int(rmin+rand()*(rmax-rmin+1))
      speed=smin+rand()*(smax-smin)
      ct=int(cmin+rand()*(cmax-cmin+1))
      thr=tmin+rand()*(tmax-tmin)
      load=lmin+rand()*(lmax-lmin)
      bat=bmin+rand()*(bmax-bmin)
      mil=(rand()<0.03)
      dtc=mil ? int(1+rand()*3) : 0
      printf "%d %.1f %d %.1f %.1f %.1f %s %d", rpm, speed, ct, thr, load, bat, (mil?"true":"false"), dtc
    }'
}

count=0
while true; do
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  # shellcheck disable=SC2086
  set -- $(sample_row)
  rpm=$1 speed=$2 coolant=$3 throttle=$4 engine_load=$5 battery=$6 mil=$7 dtc=$8

  PAYLOAD=$(printf '{"device_id":"%s","timestamp":"%s","rpm":%s,"speed":%s,"coolant_temp":%s,"throttle":%s,"engine_load":%s,"battery_voltage":%s,"mil_status":%s,"dtc_count":%s}' \
    "$DEVICE_ID" "$TS" "$rpm" "$speed" "$coolant" "$throttle" "$engine_load" "$battery" "$mil" "$dtc")

  docker run --rm eclipse-mosquitto:2 \
    mosquitto_pub -h "$HOST" -p 1883 -u "$USER" -P "$PASS" -t "$TOPIC" -m "$PAYLOAD" -q 1

  count=$((count + 1))
  echo "[$count] Published to $TOPIC rpm=$rpm speed=$speed"

  if [ "$MAX_PUBLISH" -gt 0 ] && [ "$count" -ge "$MAX_PUBLISH" ]; then
    break
  fi

  sleep "$INTERVAL_SEC"
done
