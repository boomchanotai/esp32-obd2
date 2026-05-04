import { listDevices } from "@/actions/devices";

export default async function Home() {
  let devices: Awaited<ReturnType<typeof listDevices>> = [];
  let err: string | null = null;
  try {
    devices = await listDevices();
  } catch (e) {
    err = e instanceof Error ? e.message : "Failed to load devices";
  }

  return (
    <main className="mx-auto max-w-3xl p-8 font-sans">
      <h1 className="text-2xl font-semibold tracking-tight">OBD2 devices</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Data from server actions →{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
          listDevices()
        </code>
      </p>
      {err ? (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400">{err}</p>
      ) : devices.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No devices yet. Ensure the API is running and{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            API_URL
          </code>{" "}
          points at it (default{" "}
          <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
            http://127.0.0.1:8080/api
          </code>
          ).
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {devices.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
            >
              <span className="font-medium">{d.name ?? d.device_code}</span>
              {d.vehicle_name ? (
                <span className="text-zinc-500"> — {d.vehicle_name}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
