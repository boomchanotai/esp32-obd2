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
	r.Get("/devices/{id}/alerts", h.listAlerts)
	return r
}

// listDevices returns all devices.
//
//	@Summary		List devices
//	@Description	Returns all registered OBD2 devices ordered by device code.
//	@Tags			devices
//	@Produce		json
//	@Success		200	{array}	models.Device
//	@Failure		500	{string}	string	"error message"
//	@Router			/devices [get]
func (h *Handlers) listDevices(w http.ResponseWriter, r *http.Request) {
	devs, err := h.store.ListDevices(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, devs)
}

// CreateDeviceBody is the JSON body for registering a device.
type CreateDeviceBody struct {
	DeviceCode   string  `json:"device_code" example:"esp32-001"`
	Name         *string `json:"name"`
	VehicleName  *string `json:"vehicle_name"`
	VehiclePlate *string `json:"vehicle_plate"`
}

// createDevice registers a new device.
//
//	@Summary		Create device
//	@Description	Creates a device row; device_code must be unique and match MQTT topic segments.
//	@Tags			devices
//	@Accept			json
//	@Produce		json
//	@Param			body	body		CreateDeviceBody	true	"Device payload"
//	@Success		201		{object}	models.Device
//	@Failure		400		{string}	string	"invalid json or validation error"
//	@Router			/devices [post]
func (h *Handlers) createDevice(w http.ResponseWriter, r *http.Request) {
	var body CreateDeviceBody
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

// getDevice returns one device by UUID.
//
//	@Summary		Get device
//	@Description	Returns device metadata for the given id.
//	@Tags			devices
//	@Produce		json
//	@Param			id	path		string	true	"Device UUID"
//	@Success		200	{object}	models.Device
//	@Failure		400	{string}	string	"invalid id"
//	@Failure		404	{string}	string	"not found"
//	@Failure		500	{string}	string	"error message"
//	@Router			/devices/{id} [get]
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

// listTelemetry returns recent telemetry rows for a device (newest first).
//
//	@Summary		List telemetry
//	@Description	Returns up to `limit` rows (default 100, max 500).
//	@Tags			telemetry
//	@Produce		json
//	@Param			id		path		string	true	"Device UUID"
//	@Param			limit	query		int		false	"Max rows (default 100, max 500)"
//	@Success		200		{array}		models.TelemetryRow
//	@Failure		400		{string}	string	"invalid id"
//	@Failure		404		{string}	string	"device not found"
//	@Failure		500		{string}	string	"error message"
//	@Router			/devices/{id}/telemetry [get]
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

// latestTelemetry returns the most recent telemetry sample.
//
//	@Summary		Latest telemetry
//	@Description	Returns the newest telemetry row for the device.
//	@Tags			telemetry
//	@Produce		json
//	@Param			id	path		string	true	"Device UUID"
//	@Success		200	{object}	models.TelemetryRow
//	@Failure		400	{string}	string	"invalid id"
//	@Failure		404	{string}	string	"device or telemetry not found"
//	@Failure		500	{string}	string	"error message"
//	@Router			/devices/{id}/latest [get]
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

// listAlerts returns recent alerts for a device.
//
//	@Summary		List alerts
//	@Description	Returns up to `limit` alerts (default 50, max 200), newest first.
//	@Tags			alerts
//	@Produce		json
//	@Param			id		path		string	true	"Device UUID"
//	@Param			limit	query		int		false	"Max rows (default 50, max 200)"
//	@Success		200		{array}		models.Alert
//	@Failure		400		{string}	string	"invalid id"
//	@Failure		404		{string}	string	"device not found"
//	@Failure		500		{string}	string	"error message"
//	@Router			/devices/{id}/alerts [get]
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
