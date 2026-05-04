#!/usr/bin/env sh
# Creates mosquitto/config/passwords for user esp32_device (matches docker-compose env).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/mosquitto/config"
if [ -f "$ROOT/mosquitto/config/passwords" ]; then
  echo "Already exists: $ROOT/mosquitto/config/passwords (remove to recreate)"
  exit 0
fi
# Broker runs as UID 1883; mosquitto_passwd as root creates mode 600 — broker cannot read it.
docker run --rm -v "$ROOT/mosquitto/config:/work" eclipse-mosquitto:2 \
  sh -c 'mosquitto_passwd -b -c /work/passwords esp32_device obd_dev_mqtt && chmod 644 /work/passwords'
echo "Wrote $ROOT/mosquitto/config/passwords (mode 644 for broker read access)"
