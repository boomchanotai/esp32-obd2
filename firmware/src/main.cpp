/**
 * ESP32 OBD2 cloud MVP — Wi-Fi + MQTT telemetry publisher.
 * Replace WIFI_SSID / WIFI_PASS / MQTT_HOST and optionally add ELM327 OBD reads.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <time.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#ifndef WIFI_SSID
#define WIFI_SSID "Centos"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "password"
#endif
#ifndef MQTT_HOST
#define MQTT_HOST "192.168.1.10"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 1883
#endif
#ifndef MQTT_USER
#define MQTT_USER "esp32_device"
#endif
#ifndef MQTT_PASS
#define MQTT_PASS "obd_dev_mqtt"
#endif
#ifndef DEVICE_CODE
#define DEVICE_CODE "obd-kicks-001"
#endif

static constexpr uint32_t kPublishMs = 5000;

WiFiClient wifi;
PubSubClient mqtt(wifi);
char topic[64];
static bool s_time_ok;

static void ensure_wifi() {
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

static void reconnect_mqtt() {
  snprintf(topic, sizeof(topic), "obd2/%s/telemetry", DEVICE_CODE);
  while (!mqtt.connected()) {
    String cid = String("esp32-") + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(cid.c_str(), MQTT_USER, MQTT_PASS)) {
      break;
    }
    delay(2000);
  }
}

void setup() {
  Serial.begin(115200);
  snprintf(topic, sizeof(topic), "obd2/%s/telemetry", DEVICE_CODE);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  ensure_wifi();
  if (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    return;
  }
  if (!mqtt.connected()) {
    reconnect_mqtt();
  }
  mqtt.loop();

  static uint32_t last = 0;
  uint32_t now = millis();
  if (now - last < kPublishMs) return;
  last = now;

  // MVP: mock OBD-style fields. Replace with ELM327 PID reads when hardware is wired.
  struct tm tinfo;
  char ts[40];
  if (s_time_ok && getLocalTime(&tinfo, 0)) {
    strftime(ts, sizeof(ts), "%Y-%m-%dT%H:%M:%SZ", &tinfo);
  } else {
    snprintf(ts, sizeof(ts), "1970-01-01T00:00:00Z");
  }

  JsonDocument doc;
  doc["device_id"] = DEVICE_CODE;
  doc["timestamp"] = ts;
  doc["rpm"] = 900 + (int)(now % 700);
  doc["speed"] = 0.0;
  doc["coolant_temp"] = 84.0;
  doc["throttle"] = 8.5;
  doc["engine_load"] = 18.0;
  doc["battery_voltage"] = 13.6;
  doc["mil_status"] = false;
  doc["dtc_count"] = 0;

  char buf[384];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (mqtt.publish(topic, reinterpret_cast<const uint8_t*>(buf), n, false)) {
    Serial.printf("Published %u bytes to %s\n", (unsigned)n, topic);
  } else {
    Serial.println("Publish failed");
  }
}
