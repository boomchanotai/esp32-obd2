/*
 * ESP32 — Wi-Fi STA + MQTT telemetry + OBD-II over CAN (when ECU answers).
 *
 * Arduino IDE — Library Manager:
 *   - PubSubClient (Nick O'Leary)
 *   - ArduinoJson (Benoit Blanchon) v7+
 *   - CAN by Sandeep Mistry
 *   - OBD2 by Sandeep Mistry
 *
 * Board: e.g. "ESP32 Dev Module"
 */

#include <WiFi.h>
#include <time.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <CAN.h>
#include <OBD2.h>

// ----- edit for your network / broker -----
static const char* WIFI_SSID = "Centos";
static const char* WIFI_PASS = "password";
static const char* MQTT_HOST = "localhost";
static const uint16_t MQTT_PORT = 1883;
static const char* MQTT_USER = "esp32_device";
static const char* MQTT_PASS = "obd_dev_mqtt";
// Hardcoded cloud device identity (topic + payload device_id).
static const char* DEVICE_CODE = "obd-kicks-001";

// CAN (TWAI) pins — ESP-OBD2 boards often RX=27, TX=26
static const int CAN_RX_PIN = 27;
static const int CAN_TX_PIN = 26;

static const uint32_t kPublishMs = 5000;
static const uint32_t kObdConnectTryMs = 2000;

WiFiClient wifi;
PubSubClient mqtt(wifi);
char topic[64];
char s_device_code[48];
bool s_time_ok = false;
bool s_obd_connected = false;
uint8_t s_obd_fail_streak = 0;
uint32_t s_last_obd_connect_try = 0;
uint32_t s_last_obd_verify = 0;

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(300);
  }
  if (WiFi.status() == WL_CONNECTED && !s_time_ok) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    struct tm ti;
    for (int i = 0; i < 40; i++) {
      if (getLocalTime(&ti, 500)) {
        s_time_ok = true;
        break;
      }
      delay(250);
    }
  }
}

void reconnectMqtt() {
  snprintf(topic, sizeof(topic), "obd2/%s/telemetry", s_device_code);
  while (!mqtt.connected()) {
    String cid = String("esp32-") + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
      break;
    }
    delay(2000);
  }
}

void sanitizeDeviceCode(const char* src, char* dst, size_t cap) {
  size_t j = 0;
  for (size_t i = 0; src[i] != '\0' && j + 1 < cap; i++) {
    char c = src[i];
    bool ok = (c >= 'a' && c <= 'z') ||
              (c >= 'A' && c <= 'Z') ||
              (c >= '0' && c <= '9') ||
              c == '-' || c == '_' || c == '.';
    if (ok) {
      dst[j++] = c;
    } else if (c == ' ' || c == '/' || c == '\\' || c == ':') {
      dst[j++] = '-';
    }
  }
  dst[j] = '\0';
}

void resolveDeviceCode() {
  sanitizeDeviceCode(DEVICE_CODE, s_device_code, sizeof(s_device_code));
  if (s_device_code[0] == '\0') {
    sanitizeDeviceCode(DEVICE_CODE, s_device_code, sizeof(s_device_code));
  }
}

void serviceObdConnection() {
  uint32_t now = millis();
  if (s_obd_connected) {
    if (now - s_last_obd_verify < kObdConnectTryMs) return;
    s_last_obd_verify = now;

    // Link check only (not used for trip boundaries). Any live PID ⇒ bus OK.
    float rpm = OBD2.pidRead(ENGINE_RPM);
    float speed = OBD2.pidRead(VEHICLE_SPEED);
    float vbat = OBD2.pidRead(CONTROL_MODULE_VOLTAGE);
    bool any = !isnan(rpm) || !isnan(speed) || !isnan(vbat);
    if (!any) {
      if (++s_obd_fail_streak >= 6) {
        s_obd_fail_streak = 0;
        s_obd_connected = false;
        OBD2.end();
        Serial.println("OBD2 session lost (no PID responses)");
      }
    } else {
      s_obd_fail_streak = 0;
    }
    return;
  }

  s_obd_fail_streak = 0;
  if (now - s_last_obd_connect_try < kObdConnectTryMs) return;
  s_last_obd_connect_try = now;

  Serial.println("Trying OBD2 (CAN)...");
  int err = OBD2.begin();
  if (err == 1) {
    s_obd_connected = true;
    s_last_obd_verify = millis();
    Serial.println("OBD2 connected");
  } else {
    s_obd_connected = false;
    OBD2.end();
    Serial.printf("OBD2 not connected (begin=%d)\n", err);
  }
}

void tripEventTimestamp(char* ts, size_t cap) {
  time_t now = time(nullptr);
  if (s_time_ok && now > 1700000000) {  // roughly 2023-11-14 UTC
    struct tm tinfo;
    gmtime_r(&now, &tinfo);
    strftime(ts, cap, "%Y-%m-%dT%H:%M:%SZ", &tinfo);
    return;
  }
  // Unknown clock: let backend assign server time.
  ts[0] = '\0';
}

float readPidIfSupported(uint8_t pid) {
  if (!OBD2.pidSupported(pid)) return NAN;
  return OBD2.pidRead(pid);
}

void fillTelemetryJson(
  JsonDocument& doc,
  float rpm,
  float speed,
  float coolant,
  float throttle,
  float load,
  float vbat,
  float oilTemp,
  float ambientTemp,
  float mapKpa,
  float maf,
  float timingAdvance,
  float runtimeSec,
  float fuelLevel,
  float fuelRate,
  float fuelType,
  float hybridBatteryPct
) {
  char ts[40];
  tripEventTimestamp(ts, sizeof(ts));

  doc["device_id"] = s_device_code;
  if (ts[0] != '\0') {
    doc["timestamp"] = ts;
  }

  doc["rpm"] = isnan(rpm) ? 0 : (int)rpm;
  doc["speed"] = isnan(speed) ? 0.0 : (double)speed;
  doc["coolant_temp"] = isnan(coolant) ? 0.0 : (double)coolant;
  doc["throttle"] = isnan(throttle) ? 0.0 : (double)throttle;
  doc["engine_load"] = isnan(load) ? 0.0 : (double)load;
  doc["battery_voltage"] = isnan(vbat) ? 0.0 : (double)vbat;
  doc["engine_oil_temp"] = isnan(oilTemp) ? 0.0 : (double)oilTemp;
  doc["ambient_air_temp"] = isnan(ambientTemp) ? 0.0 : (double)ambientTemp;
  doc["intake_map_kpa"] = isnan(mapKpa) ? 0.0 : (double)mapKpa;
  doc["maf_air_flow_rate"] = isnan(maf) ? 0.0 : (double)maf;
  doc["timing_advance"] = isnan(timingAdvance) ? 0.0 : (double)timingAdvance;
  doc["engine_runtime_sec"] = isnan(runtimeSec) ? 0.0 : (double)runtimeSec;
  doc["fuel_tank_level"] = isnan(fuelLevel) ? 0.0 : (double)fuelLevel;
  doc["engine_fuel_rate"] = isnan(fuelRate) ? 0.0 : (double)fuelRate;
  doc["fuel_type"] = isnan(fuelType) ? 0.0 : (double)fuelType;
  doc["hybrid_battery_remaining_life"] =
    isnan(hybridBatteryPct) ? 0.0 : (double)hybridBatteryPct;
  doc["mil_status"] = false;
  doc["dtc_count"] = 0;
}

void setup() {
  Serial.begin(115200);
  resolveDeviceCode();
  snprintf(topic, sizeof(topic), "obd2/%s/telemetry", s_device_code);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  Serial.printf("Device identity: %s\n", s_device_code);

  CAN.setPins(CAN_RX_PIN, CAN_TX_PIN);
  Serial.printf("CAN RX=%d TX=%d\n", CAN_RX_PIN, CAN_TX_PIN);

  s_last_obd_connect_try = millis() - kObdConnectTryMs;
}

void loop() {
  ensureWifi();
  if (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    return;
  }
  if (!mqtt.connected()) {
    reconnectMqtt();
  }
  mqtt.loop();

  serviceObdConnection();

  static uint32_t lastPublish = 0;
  uint32_t now = millis();
  if (now - lastPublish < kPublishMs) {
    return;
  }
  lastPublish = now;

  if (!s_obd_connected) {
    return;
  }

  float rpm = OBD2.pidRead(ENGINE_RPM);
  float speed = OBD2.pidRead(VEHICLE_SPEED);
  float coolant = OBD2.pidRead(ENGINE_COOLANT_TEMPERATURE);
  float throttle = OBD2.pidRead(THROTTLE_POSITION);
  float load = OBD2.pidRead(CALCULATED_ENGINE_LOAD);
  float vbat = OBD2.pidRead(CONTROL_MODULE_VOLTAGE);
  float oilTemp = readPidIfSupported(ENGINE_OIL_TEMPERATURE);
  float ambientTemp = readPidIfSupported(AMBIENT_AIR_TEMPERATURE);
  float mapKpa = readPidIfSupported(INTAKE_MANIFOLD_ABSOLUTE_PRESSURE);
  float maf = readPidIfSupported(MAF_AIR_FLOW_RATE);
  float timingAdvance = readPidIfSupported(TIMING_ADVANCE);
  float runtimeSec = readPidIfSupported(RUN_TIME_SINCE_ENGINE_START);
  float fuelLevel = readPidIfSupported(FUEL_TANK_LEVEL_INPUT);
  float fuelRate = readPidIfSupported(ENGINE_FUEL_RATE);
  float fuelType = readPidIfSupported(FUEL_TYPE);
  float hybridBatteryPct = readPidIfSupported(HYBRID_BATTERY_PACK_REMAINING_LIFE);

  JsonDocument doc;
  fillTelemetryJson(
    doc,
    rpm,
    speed,
    coolant,
    throttle,
    load,
    vbat,
    oilTemp,
    ambientTemp,
    mapKpa,
    maf,
    timingAdvance,
    runtimeSec,
    fuelLevel,
    fuelRate,
    fuelType,
    hybridBatteryPct
  );

  char buf[768];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (mqtt.publish(topic, (const uint8_t*)buf, n, false)) {
    Serial.printf("Published %u bytes -> %s\n", (unsigned)n, topic);
  } else {
    Serial.println("MQTT publish failed");
  }
}
