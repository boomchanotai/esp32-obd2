"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { getDeviceLatestTelemetry } from "@/actions/get-device-latest-telemetry";
import { listDeviceAlerts } from "@/actions/list-device-alerts";
import { listDeviceTelemetry } from "@/actions/list-device-telemetry";
import { listDevices } from "@/actions/list-devices";
import type { Alert, Device, TelemetryRow } from "@/types";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Legend,
  Tooltip,
);

function fmt(v: unknown, u = ""): string {
  if (v == null) return "—";
  return `${v}${u}`;
}

export default function HomePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [latest, setLatest] = useState<TelemetryRow | null | undefined>(
    undefined,
  );
  const [telem, setTelem] = useState<TelemetryRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  const refresh = useCallback(async () => {
    if (!deviceId) return;
    setStatus("");
    const [lat, t, a] = await Promise.all([
      getDeviceLatestTelemetry({ deviceId }),
      listDeviceTelemetry({ deviceId, limit: 60 }),
      listDeviceAlerts({ deviceId, limit: 20 }),
    ]);
    setLatest(lat);
    setTelem(t);
    setAlerts(a);
  }, [deviceId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listDevices();
        if (cancelled) return;
        setDevices(d);
        setDeviceId((prev) => prev || d[0]?.id || "");
        setStatus(
          d.length ? "" : "No devices — POST /api/devices or run seed SQL.",
        );
      } catch (e) {
        if (!cancelled)
          setStatus(e instanceof Error ? e.message : "Failed to load devices");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    refresh().catch((e) =>
      setStatus(e instanceof Error ? e.message : "Refresh failed"),
    );
  }, [deviceId, refresh]);

  useEffect(() => {
    if (!deviceId) return;
    const id = window.setInterval(() => {
      refresh().catch((e) =>
        setStatus(e instanceof Error ? e.message : "Refresh failed"),
      );
    }, 5000);
    return () => window.clearInterval(id);
  }, [deviceId, refresh]);

  const chartData = useMemo(() => {
    const asc = [...telem].reverse();
    return {
      labels: asc.map((t) => new Date(t.recorded_at).toLocaleTimeString()),
      datasets: [
        {
          label: "Speed km/h",
          data: asc.map((t) => t.speed ?? 0),
          borderColor: "#3b82f6",
          tension: 0.2,
          fill: false,
        },
        {
          label: "RPM",
          data: asc.map((t) => t.rpm ?? 0),
          borderColor: "#22c55e",
          tension: 0.2,
          fill: false,
          yAxisID: "y1",
        },
      ],
    };
  }, [telem]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: "#243044" } },
        y1: {
          position: "right" as const,
          beginAtZero: true,
          grid: { drawOnChartArea: false },
        },
        x: {
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
          grid: { color: "#243044" },
        },
      },
      plugins: {
        legend: { labels: { color: "#cbd5e1" } },
      },
    }),
    [],
  );

  return (
    <>
      <header>
        <h1>OBD2 telemetry</h1>
        <div>
          <label className="muted" htmlFor="device">
            Device
          </label>
          <br />
          <select
            id="device"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.device_code}
                {d.name ? ` — ${d.name}` : ""}
              </option>
            ))}
          </select>
        </div>
      </header>
      <main>
        {status ? <p className="muted">{status}</p> : null}
        <div className="grid">
          {latest === undefined ? null : latest === null ? (
            <div className="tile">
              <label>Latest</label>
              <div className="val">No rows yet</div>
            </div>
          ) : (
            <>
              <div className="tile">
                <label>Speed</label>
                <div className="val">{fmt(latest.speed, " km/h")}</div>
              </div>
              <div className="tile">
                <label>RPM</label>
                <div className="val">{fmt(latest.rpm, "")}</div>
              </div>
              <div className="tile">
                <label>Coolant °C</label>
                <div className="val">{fmt(latest.coolant_temp, "")}</div>
              </div>
              <div className="tile">
                <label>Battery V</label>
                <div className="val">{fmt(latest.battery_voltage, "")}</div>
              </div>
              <div className="tile">
                <label>Throttle %</label>
                <div className="val">{fmt(latest.throttle, "")}</div>
              </div>
              <div className="tile">
                <label>Engine load %</label>
                <div className="val">{fmt(latest.engine_load, "")}</div>
              </div>
              <div className="tile">
                <label>MIL</label>
                <div className="val">{latest.mil_status ? "ON" : "OK"}</div>
              </div>
              <div className="tile">
                <label>DTC count</label>
                <div className="val">{fmt(latest.dtc_count, "")}</div>
              </div>
              <div className="tile">
                <label>Last seen</label>
                <div className="val">
                  {new Date(latest.recorded_at).toLocaleString()}
                </div>
              </div>
            </>
          )}
        </div>
        <section>
          <h2>Speed &amp; RPM (recent)</h2>
          <div className="chart-wrap">
            <Line data={chartData} options={chartOptions} />
          </div>
        </section>
        <section>
          <h2>Alerts</h2>
          <ul className="alerts">
            {alerts?.length === 0 ? (
              <li className="muted">No alerts</li>
            ) : (
              alerts?.map((a) => (
                <li key={a.id}>
                  <span className="sev">{a.severity}</span>
                  <strong>{a.alert_type}</strong> — {a.message || ""}
                  {a.resolved_at ? (
                    <span className="muted"> resolved</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </>
  );
}
