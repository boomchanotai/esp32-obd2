export type Device = {
  id: string;
  device_code: string;
  name?: string | null;
  vehicle_name?: string | null;
};

export type TelemetryRow = {
  id: number;
  recorded_at: string;
  rpm?: number | null;
  speed?: number | null;
  coolant_temp?: number | null;
  throttle?: number | null;
  engine_load?: number | null;
  battery_voltage?: number | null;
  mil_status?: boolean | null;
  dtc_count?: number | null;
};

export type Alert = {
  id: string;
  alert_type: string;
  severity: string;
  message?: string | null;
  occurred_at: string;
  resolved_at?: string | null;
};
