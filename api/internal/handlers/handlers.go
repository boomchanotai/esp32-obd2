package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/esp32-obd2/cloud/internal/store"
)

type Handlers struct {
	store *store.Store
}

func New(st *store.Store) *Handlers {
	return &Handlers{store: st}
}

func (h *Handlers) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/devices", h.listDevices)
	r.Post("/devices", h.createDevice)
	r.Get("/devices/{id}", h.getDevice)
	r.Get("/devices/{id}/telemetry", h.listTelemetry)
	r.Get("/devices/{id}/latest", h.latestTelemetry)
	r.Get("/devices/{id}/trips", h.listTrips)
	r.Get("/devices/{id}/alerts", h.listAlerts)
	return r
}

func (h *Handlers) listDevices(w http.ResponseWriter, r *http.Request) {
	devs, err := h.store.ListDevices(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, devs)
}

type createDeviceBody struct {
	DeviceCode   string  `json:"device_code"`
	Name         *string `json:"name"`
	VehicleName  *string `json:"vehicle_name"`
	VehiclePlate *string `json:"vehicle_plate"`
}

func (h *Handlers) createDevice(w http.ResponseWriter, r *http.Request) {
	var body createDeviceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	code := body.DeviceCode
	d, err := h.store.CreateDevice(r.Context(), &code, body.Name, body.VehicleName, body.VehiclePlate)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, d)
}

func parseDeviceID(p string) (uuid.UUID, error) {
	return uuid.Parse(p)
}

func (h *Handlers) getDevice(w http.ResponseWriter, r *http.Request) {
	id, err := parseDeviceID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	d, err := h.store.GetDevice(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if d == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, d)
}

func (h *Handlers) listTelemetry(w http.ResponseWriter, r *http.Request) {
	id, err := parseDeviceID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if d, err := h.store.GetDevice(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	} else if d == nil {
		http.NotFound(w, r)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	rows, err := h.store.ListTelemetry(r.Context(), id, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

func (h *Handlers) latestTelemetry(w http.ResponseWriter, r *http.Request) {
	id, err := parseDeviceID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if d, _ := h.store.GetDevice(r.Context(), id); d == nil {
		http.NotFound(w, r)
		return
	}
	row, err := h.store.LatestTelemetry(r.Context(), id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if row == nil {
		http.Error(w, "no telemetry", http.StatusNotFound)
		return
	}
	writeJSON(w, row)
}

func (h *Handlers) listTrips(w http.ResponseWriter, r *http.Request) {
	id, err := parseDeviceID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if d, _ := h.store.GetDevice(r.Context(), id); d == nil {
		http.NotFound(w, r)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	rows, err := h.store.ListTrips(r.Context(), id, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

func (h *Handlers) listAlerts(w http.ResponseWriter, r *http.Request) {
	id, err := parseDeviceID(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if d, _ := h.store.GetDevice(r.Context(), id); d == nil {
		http.NotFound(w, r)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	rows, err := h.store.ListAlerts(r.Context(), id, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}
