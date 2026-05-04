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
static const char* DEVICE_CODE = "obd-kicks-001";

// CAN (TWAI) pins — ESP-OBD2 boards often RX=27, TX=26
static const int CAN_RX_PIN = 27;
static const int CAN_TX_PIN = 26;

static const uint32_t kPublishMs = 5000;
static const uint32_t kObdConnectTryMs = 2000;

WiFiClient wifi;
PubSubClient mqtt(wifi);
char topic[64];
bool s_time_ok = false;
bool s_obd_connected = false;
uint32_t s_last_obd_connect_try = 0;

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
  snprintf(topic, sizeof(topic), "obd2/%s/telemetry", DEVICE_CODE);
  while (!mqtt.connected()) {
    String cid = String("esp32-") + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
      break;
    }
    delay(2000);
  }
}

void serviceObdConnection() {
  uint32_t now = millis();
  if (s_obd_connected) return;
  if (now - s_last_obd_connect_try < kObdConnectTryMs) return;
  s_last_obd_connect_try = now;

  Serial.println("Trying OBD2 (CAN)...");
  int err = OBD2.begin();
  if (err == 1) {
    s_obd_connected = true;
    Serial.println("OBD2 connected");
  } else {
    s_obd_connected = false;
    OBD2.end();
    Serial.printf("OBD2 not connected (begin=%d)\n", err);
  }
}

void fillTelemetryJson(JsonDocument& doc) {
  struct tm tinfo;
  char ts[40];
  if (s_time_ok && getLocalTime(&tinfo, 0)) {
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &tinfo);
  } else {
    snprintf(ts, sizeof(ts), "1970-01-01T00:00:00Z");
  }

  doc["device_id"] = DEVICE_CODE;
  doc["timestamp"] = ts;

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
  snprintf(topic, sizeof(topic), "obd2/%s/telemetry", DEVICE_CODE);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

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
