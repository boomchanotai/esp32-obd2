package worker

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"github.com/esp32-obd2/cloud/internal/models"
	"github.com/esp32-obd2/cloud/internal/store"
)

type Worker struct {
	store  *store.Store
	client mqtt.Client
}

func New(st *store.Store, c mqtt.Client) *Worker {
	return &Worker{store: st, client: c}
}

func (w *Worker) Subscribe() error {
	if token := w.client.Subscribe("obd2/+/telemetry", 1, w.onTelemetry); token.Wait() && token.Error() != nil {
		return token.Error()
	}
	return nil
}

func (w *Worker) onTelemetry(_ mqtt.Client, m mqtt.Message) {
	parts := strings.Split(m.Topic(), "/")
	if len(parts) != 3 || parts[0] != "obd2" || parts[2] != "telemetry" {
		log.Printf("mqtt: skip topic %q", m.Topic())
		return
	}
	topicDevice := parts[1]

	var payload models.TelemetryPayload
	if err := json.Unmarshal(m.Payload(), &payload); err != nil {
		log.Printf("mqtt: bad json on %s: %v", m.Topic(), err)
		return
	}

	raw := m.Payload()
	ctx := context.Background()
	if err := w.store.IngestTelemetry(ctx, topicDevice, &payload, raw); err != nil {
		if errors.Is(err, store.ErrUnknownDevice) {
			log.Printf("mqtt: unknown device %q", topicDevice)
			return
		}
		log.Printf("mqtt: ingest %s: %v", m.Topic(), err)
	}
}
