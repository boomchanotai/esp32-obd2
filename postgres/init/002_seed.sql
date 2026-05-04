INSERT INTO devices (device_code, name, vehicle_name)
VALUES ('obd-kicks-001', 'Kickstarter demo', 'Demo vehicle')
ON CONFLICT (device_code) DO NOTHING;
