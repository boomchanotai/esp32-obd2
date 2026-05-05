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
// Identity priority for cloud device key:
// 1) VIN (best, unique per car), 2) ECU_NAME, 3) fallback DEVICE_CODE.
static const char* DEVICE_CODE = "obd-kicks-001";
// Optional manual overrides (leave empty to auto-detect from OBD).
static const char* VIN = "";
static const char* ECU_NAME = "";

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
bool s_prev_obd_connected = false;
bool s_identity_locked = false;
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
  const char* preferred = DEVICE_CODE;
  if (VIN != nullptr && VIN[0] != '\0') {
    preferred = VIN;
  } else if (ECU_NAME != nullptr && ECU_NAME[0] != '\0') {
    preferred = ECU_NAME;
  }
  sanitizeDeviceCode(preferred, s_device_code, sizeof(s_device_code));
  if (s_device_code[0] == '\0') {
    sanitizeDeviceCode(DEVICE_CODE, s_device_code, sizeof(s_device_code));
  }
}

bool isEmptyOrUnknown(const String& s) {
  String t = s;
  t.trim();
  if (t.length() == 0) return true;
  String lower = t;
  lower.toLowerCase();
  return lower == "unknown" || lower == "n/a" || lower == "null";
}

void maybeResolveIdentityFromObd() {
  if (!s_obd_connected || s_identity_locked) return;

  // Respect explicit manual VIN first.
  if (VIN != nullptr && VIN[0] != '\0') {
    resolveDeviceCode();
    s_identity_locked = true;
    return;
  }

  String vin = OBD2.vinRead();
  if (!isEmptyOrUnknown(vin)) {
    sanitizeDeviceCode(vin.c_str(), s_device_code, sizeof(s_device_code));
    if (s_device_code[0] != '\0') {
      s_identity_locked = true;
      snprintf(topic, sizeof(topic), "obd2/%s/telemetry", s_device_code);
      Serial.printf("Device identity (VIN): %s\n", s_device_code);
      return;
    }
  }

  // If VIN is unavailable, use manual ECU_NAME or ECU-reported name.
  String ecu = (ECU_NAME != nullptr && ECU_NAME[0] != '\0') ? String(ECU_NAME)
                                                             : OBD2.ecuNameRead();
  if (!isEmptyOrUnknown(ecu)) {
    sanitizeDeviceCode(ecu.c_str(), s_device_code, sizeof(s_device_code));
    if (s_device_code[0] != '\0') {
      s_identity_locked = true;
      snprintf(topic, sizeof(topic), "obd2/%s/telemetry", s_device_code);
      Serial.printf("Device identity (ECU): %s\n", s_device_code);
      return;
    }
  }

  // Keep fallback until readable OBD identity becomes available.
  resolveDeviceCode();
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

bool publishTripSession(const char* action) {
  if (!mqtt.connected()) return false;
  char ts[40];
  tripEventTimestamp(ts, sizeof(ts));
  char tripTopic[64];
  snprintf(tripTopic, sizeof(tripTopic), "obd2/%s/trip", s_device_code);
  JsonDocument doc;
  doc["device_id"] = s_device_code;
  if (ts[0] != '\0') {
    doc["timestamp"] = ts;
  }
  doc["action"] = action;
  char buf[192];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (mqtt.publish(tripTopic, (const uint8_t*)buf, n, false)) {
    Serial.printf("Trip %s -> %s\n", action, tripTopic);
    return true;
  }
  Serial.println("MQTT trip publish failed");
  return false;
}

void fillTelemetryJson(JsonDocument& doc) {
  char ts[40];
  tripEventTimestamp(ts, sizeof(ts));

  doc["device_id"] = s_device_code;
  if (ts[0] != '\0') {
    doc["timestamp"] = ts;
  }

  float rpm = OBD2.pidRead(ENGINE_RPM);
  float speed = OBD2.pidRead(VEHICLE_SPEED);
  float coolant = OBD2.pidRead(ENGINE_COOLANT_TEMPERATURE);
  float throttle = OBD2.pidRead(THROTTLE_POSITION);
  float load = OBD2.pidRead(CALCULATED_ENGINE_LOAD);
  float vbat = OBD2.pidRead(CONTROL_MODULE_VOLTAGE);

  doc["rpm"] = isnan(rpm) ? 0 : (int)rpm;
  doc["speed"] = isnan(speed) ? 0.0 : (double)speed;
  doc["coolant_temp"] = isnan(coolant) ? 0.0 : (double)coolant;
  doc["throttle"] = isnan(throttle) ? 0.0 : (double)throttle;
  doc["engine_load"] = isnan(load) ? 0.0 : (double)load;
  doc["battery_voltage"] = isnan(vbat) ? 0.0 : (double)vbat;
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
  maybeResolveIdentityFromObd();

  bool obd = s_obd_connected;
  if (obd && !s_prev_obd_connected) {
    if (publishTripSession("start")) s_prev_obd_connected = true;
  } else if (!obd && s_prev_obd_connected) {
    if (publishTripSession("end")) s_prev_obd_connected = false;
  } else {
    s_prev_obd_connected = obd;
  }

  static uint32_t lastPublish = 0;
  uint32_t now = millis();
  if (now - lastPublish < kPublishMs) {
    return;
  }
  lastPublish = now;

  if (!s_obd_connected) {
    return;
  }

  JsonDocument doc;
  fillTelemetryJson(doc);

  char buf[384];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (mqtt.publish(topic, (const uint8_t*)buf, n, false)) {
    Serial.printf("Published %u bytes -> %s\n", (unsigned)n, topic);
  } else {
    Serial.println("MQTT publish failed");
  }
}
