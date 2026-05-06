package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/esp32-obd2/cloud/internal/models"
)

var ErrUnknownDevice = errors.New("unknown device")

type Store struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) Pool() *pgxpool.Pool { return s.pool }

func normalizeEventTime(raw string, now time.Time) time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return now.UTC()
	}
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return now.UTC()
	}
	t = t.UTC()

	// Protect against bad device clocks (e.g. 1970 fallback) and extreme skew.
	if t.Year() < 2020 {
		return now.UTC()
	}
	if t.Before(now.Add(-24 * time.Hour)) || t.After(now.Add(5*time.Minute)) {
		return now.UTC()
	}
	return t
}

func (s *Store) DeviceIDByCode(ctx context.Context, code string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `SELECT id FROM devices WHERE device_code = $1`, code).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrUnknownDevice
	}
	return id, err
}

func (s *Store) EnsureDeviceIDByCode(ctx context.Context, code string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO devices (device_code, name)
		VALUES ($1, $2)
		ON CONFLICT (device_code) DO UPDATE
		SET updated_at = now()
		RETURNING id
	`, code, "Auto-registered device").Scan(&id)
	return id, err
}

func (s *Store) IngestTelemetry(ctx context.Context, topicDevice string, p *models.TelemetryPayload, raw []byte) error {
	if p.DeviceID == "" {
		return errors.New("missing device_id")
	}
	if p.DeviceID != topicDevice {
		return errors.New("device_id does not match MQTT topic")
	}

	deviceID, err := s.EnsureDeviceIDByCode(ctx, topicDevice)
	if err != nil {
		return err
	}

	recordedAt := normalizeEventTime(p.Timestamp, time.Now())

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var telID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO telemetry (
			device_id, recorded_at, rpm, speed, coolant_temp, throttle, engine_load,
			battery_voltage, engine_oil_temp, ambient_air_temp, intake_map_kpa, maf_air_flow_rate,
			timing_advance, engine_runtime_sec, fuel_tank_level, engine_fuel_rate, fuel_type,
			hybrid_battery_remaining_life, mil_status, dtc_count, latitude, longitude, raw
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
		RETURNING id
	`, deviceID, recordedAt, p.RPM, p.Speed, p.CoolantTemp, p.Throttle, p.EngineLoad,
		p.BatteryVoltage, p.EngineOilTemp, p.AmbientAirTemp, p.IntakeMapKpa, p.MafAirFlowRate,
		p.TimingAdvance, p.EngineRuntimeSec, p.FuelTankLevel, p.EngineFuelRate, p.FuelType,
		p.HybridBatteryRemainingLife, p.MILStatus, p.DTCCount, p.Latitude, p.Longitude, raw,
	).Scan(&telID)
	if err != nil {
		return err
	}

	if err := s.processAlerts(ctx, tx, deviceID, telID, recordedAt, p); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// finalizeTripInTx sets ended_at, duration, and speed aggregates for a trip row.
func engineRunning(rpm *int, speed *float64) bool {
	if rpm != nil && *rpm > 400 {
		return true
	}
	if speed != nil && *speed > 1 {
		return true
	}
	return false
}

func (s *Store) processAlerts(ctx context.Context, tx pgx.Tx, deviceID uuid.UUID, telID int64, _ time.Time, p *models.TelemetryPayload) error {
	const sev = "HIGH"

	if p.CoolantTemp != nil && *p.CoolantTemp >= 100 {
		if err := s.raiseAlert(ctx, tx, deviceID, telID, "ENGINE_OVERHEAT", sev, "Coolant temperature high", p.CoolantTemp, ptrF(100)); err != nil {
			return err
		}
	} else {
		_ = s.resolveAlertType(ctx, tx, deviceID, "ENGINE_OVERHEAT")
	}

	if p.BatteryVoltage != nil {
		run := engineRunning(p.RPM, p.Speed)
		th := 12.0
		if run {
			th = 13.0
		}
		low := false
		if run && *p.BatteryVoltage < 13 {
			low = true
		}
		if !run && *p.BatteryVoltage < 12 {
			low = true
		}
		if low {
			if err := s.raiseAlert(ctx, tx, deviceID, telID, "LOW_BATTERY", sev, "Battery voltage low", p.BatteryVoltage, &th); err != nil {
				return err
			}
		} else {
			_ = s.resolveAlertType(ctx, tx, deviceID, "LOW_BATTERY")
		}
	}

	mil := p.MILStatus != nil && *p.MILStatus
	dtc := p.DTCCount != nil && *p.DTCCount > 0
	if mil || dtc {
		if err := s.raiseAlert(ctx, tx, deviceID, telID, "CHECK_ENGINE_ON", sev, "MIL on or DTCs present", nil, nil); err != nil {
			return err
		}
	} else {
		_ = s.resolveAlertType(ctx, tx, deviceID, "CHECK_ENGINE_ON")
	}

	if p.RPM != nil && *p.RPM > 4000 {
		th := 4000.0
		v := float64(*p.RPM)
		if err := s.raiseAlert(ctx, tx, deviceID, telID, "HIGH_RPM", sev, "Engine RPM high", &v, &th); err != nil {
			return err
		}
	} else {
		_ = s.resolveAlertType(ctx, tx, deviceID, "HIGH_RPM")
	}

	return nil
}

func ptrF(f float64) *float64 { return &f }

func (s *Store) raiseAlert(ctx context.Context, tx pgx.Tx, deviceID uuid.UUID, telID int64, alertType, severity, msg string, value, threshold *float64) error {
	var exists bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM alerts WHERE device_id = $1 AND alert_type = $2 AND resolved_at IS NULL
		)
	`, deviceID, alertType).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO alerts (device_id, telemetry_id, alert_type, severity, message, value, threshold)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`, deviceID, telID, alertType, severity, msg, value, threshold)
	return err
}

func (s *Store) resolveAlertType(ctx context.Context, tx pgx.Tx, deviceID uuid.UUID, alertType string) error {
	_, err := tx.Exec(ctx, `
		UPDATE alerts SET resolved_at = now() WHERE device_id = $1 AND alert_type = $2 AND resolved_at IS NULL
	`, deviceID, alertType)
	return err
}

func (s *Store) ListDevices(ctx context.Context) ([]models.Device, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, device_code, name, vehicle_name, vehicle_plate, created_at, updated_at
		FROM devices ORDER BY device_code
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Device
	for rows.Next() {
		var id uuid.UUID
		var d models.Device
		if err := rows.Scan(&id, &d.DeviceCode, &d.Name, &d.VehicleName, &d.VehiclePlate, &d.CreatedAt, &d.UpdatedAt); err != nil {
			return nil, err
		}
		d.ID = id.String()
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) GetDevice(ctx context.Context, id uuid.UUID) (*models.Device, error) {
	var rowID uuid.UUID
	var d models.Device
	err := s.pool.QueryRow(ctx, `
		SELECT id, device_code, name, vehicle_name, vehicle_plate, created_at, updated_at
		FROM devices WHERE id = $1
	`, id).Scan(&rowID, &d.DeviceCode, &d.Name, &d.VehicleName, &d.VehiclePlate, &d.CreatedAt, &d.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	d.ID = rowID.String()
	return &d, nil
}

func (s *Store) CreateDevice(ctx context.Context, code, name, vname, vplate *string) (*models.Device, error) {
	if code == nil || *code == "" {
		return nil, errors.New("device_code required")
	}
	var rowID uuid.UUID
	var d models.Device
	err := s.pool.QueryRow(ctx, `
		INSERT INTO devices (device_code, name, vehicle_name, vehicle_plate)
		VALUES ($1,$2,$3,$4)
		RETURNING id, device_code, name, vehicle_name, vehicle_plate, created_at, updated_at
	`, *code, name, vname, vplate).Scan(&rowID, &d.DeviceCode, &d.Name, &d.VehicleName, &d.VehiclePlate, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}
	d.ID = rowID.String()
	return &d, nil
}

func (s *Store) ListTelemetry(ctx context.Context, deviceID uuid.UUID, limit int) ([]models.TelemetryRow, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, recorded_at, rpm, speed, coolant_temp, throttle, engine_load,
		       battery_voltage, engine_oil_temp, ambient_air_temp, intake_map_kpa, maf_air_flow_rate,
		       timing_advance, engine_runtime_sec, fuel_tank_level, engine_fuel_rate, fuel_type,
		       hybrid_battery_remaining_life, mil_status, dtc_count, latitude, longitude
		FROM telemetry WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT $2
	`, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TelemetryRow
	for rows.Next() {
		var t models.TelemetryRow
		if err := rows.Scan(&t.ID, &t.RecordedAt, &t.RPM, &t.Speed, &t.CoolantTemp, &t.Throttle, &t.EngineLoad,
			&t.BatteryVoltage, &t.EngineOilTemp, &t.AmbientAirTemp, &t.IntakeMapKpa, &t.MafAirFlowRate,
			&t.TimingAdvance, &t.EngineRuntimeSec, &t.FuelTankLevel, &t.EngineFuelRate, &t.FuelType,
			&t.HybridBatteryRemainingLife, &t.MILStatus, &t.DTCCount, &t.Latitude, &t.Longitude); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) LatestTelemetry(ctx context.Context, deviceID uuid.UUID) (*models.TelemetryRow, error) {
	rows, err := s.ListTelemetry(ctx, deviceID, 1)
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	return &rows[0], nil
}

func (s *Store) ListAlerts(ctx context.Context, deviceID uuid.UUID, limit int) ([]models.Alert, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, alert_type, severity, message, value, threshold, occurred_at, resolved_at
		FROM alerts WHERE device_id = $1 ORDER BY occurred_at DESC LIMIT $2
	`, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Alert
	for rows.Next() {
		var aid uuid.UUID
		var a models.Alert
		if err := rows.Scan(&aid, &a.AlertType, &a.Severity, &a.Message, &a.Value, &a.Threshold, &a.OccurredAt, &a.ResolvedAt); err != nil {
			return nil, err
		}
		a.ID = aid.String()
		out = append(out, a)
	}
	return out, rows.Err()
}

