package models

import "time"

type TelemetryPayload struct {
	DeviceID       string   `json:"device_id"`
	Timestamp      string   `json:"timestamp"`
	RPM            *int     `json:"rpm"`
	Speed          *float64 `json:"speed"`
	CoolantTemp    *float64 `json:"coolant_temp"`
	Throttle       *float64 `json:"throttle"`
	EngineLoad     *float64 `json:"engine_load"`
	BatteryVoltage *float64 `json:"battery_voltage"`
	MILStatus      *bool    `json:"mil_status"`
	DTCCount       *int     `json:"dtc_count"`
	Latitude       *float64 `json:"latitude"`
	Longitude      *float64 `json:"longitude"`
}

type Device struct {
	ID           string     `json:"id"`
	DeviceCode   string     `json:"device_code"`
	Name         *string    `json:"name,omitempty"`
	VehicleName  *string    `json:"vehicle_name,omitempty"`
	VehiclePlate *string    `json:"vehicle_plate,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

type TelemetryRow struct {
	ID              int64      `json:"id"`
	RecordedAt      time.Time  `json:"recorded_at"`
	RPM             *int       `json:"rpm,omitempty"`
	Speed           *float64   `json:"speed,omitempty"`
	CoolantTemp     *float64   `json:"coolant_temp,omitempty"`
	Throttle        *float64   `json:"throttle,omitempty"`
	EngineLoad      *float64   `json:"engine_load,omitempty"`
	BatteryVoltage  *float64   `json:"battery_voltage,omitempty"`
	MILStatus       *bool      `json:"mil_status,omitempty"`
	DTCCount        *int       `json:"dtc_count,omitempty"`
	Latitude        *float64   `json:"latitude,omitempty"`
	Longitude       *float64   `json:"longitude,omitempty"`
}

type Trip struct {
	ID              string     `json:"id"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at,omitempty"`
	DurationSeconds *int       `json:"duration_seconds,omitempty"`
	AvgSpeed        *float64   `json:"avg_speed,omitempty"`
	MaxSpeed        *float64   `json:"max_speed,omitempty"`
}

type Alert struct {
	ID          string     `json:"id"`
	AlertType   string     `json:"alert_type"`
	Severity    string     `json:"severity"`
	Message     *string    `json:"message,omitempty"`
	Value       *float64   `json:"value,omitempty"`
	Threshold   *float64   `json:"threshold,omitempty"`
	OccurredAt  time.Time  `json:"occurred_at"`
	ResolvedAt  *time.Time `json:"resolved_at,omitempty"`
}
