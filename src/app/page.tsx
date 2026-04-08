"use client";

import { useMemo, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { motion } from "framer-motion";
import { useSensorRealtime, type SensorDataEntry, } from "@/lib/useSensorRealtime";

interface Props {
  deviceId?: string;
  initialLimit?: number;
}

const SAFE_LIMIT = 0.08;
const DANGER_LIMIT = 0.75;

function deriveLevel(ppm: number): "safe" | "warning" | "danger" {
  if (ppm <= SAFE_LIMIT) return "safe";
  if (ppm < DANGER_LIMIT) return "warning";
  return "danger";
}

function levelColor(level: string) {
  if (level === "danger") return "text-rose-400";
  if (level === "warning") return "text-amber-300";
  return "text-emerald-300";
}

function levelBadge(level: string) {
  if (level === "danger") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
  if (level === "warning") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
}

export default function RealtimeDashboard({
  deviceId = "esp32-ch2o-01",
  initialLimit = 200,
}: Props) {
  const { data, loading } = useSensorRealtime(deviceId, initialLimit);

  const latest = useMemo(
    () =>
      data.length
        ? data[data.length - 1]
        : {
          ch2o_ppm: 0,
          level: "safe",
          time: "--:--",
          created_at: null,
        },
    [data]
  );

  const lastUpdate = latest?.created_at
    ? new Date(latest.created_at as string).getTime()
    : null;

  const [visibleRows, setVisibleRows] = useState(10);
  const rowOptions = [10, 25, 50, 100, 200].filter(
    (n) => n === 10 || n <= data.length
  );

  useEffect(() => {
    if (rowOptions.length === 0) return;

    if (!rowOptions.includes(visibleRows)) {
      setVisibleRows(rowOptions[rowOptions.length - 1]); // highest valid option
    }
  }, [rowOptions, visibleRows]);

  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const diffSeconds =
    lastUpdate && now ? Math.max(0, Math.floor((now - lastUpdate) / 1000)) : null;

  const OFFLINE_THRESHOLD_SECONDS = 60; // 1 min before it's considered offline
  const isOnline = diffSeconds !== null && diffSeconds < OFFLINE_THRESHOLD_SECONDS;

  const formatRelativeTime = (timestamp: number, currentTimestamp: number) => {
    const diff = Math.max(0, Math.floor((currentTimestamp - timestamp) / 1000));
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-[#07070d] via-[#0b0b12] to-[#05050a] text-slate-100 p-4 md:p-6 font-sans">
      <div className="max-w-6xl mx-auto">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-wide text-white">
              {/* CH2O Monitoring — <span className="text-indigo-400">Realtime</span> */}
              <span className="text-indigo-400">CH2O</span> Realtime Monitor
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              ESP32 • ZE08-CH2O • Supabase · Realtime
            </p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="text-right">
              <div className="text-xs text-slate-400">Device</div>
              <div className="font-mono bg-[#0f1724] px-3 py-1 rounded-md text-sm">
                {deviceId}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">Last update</div>
              <div className="font-mono bg-[#0f1724] px-3 py-1 rounded-md text-sm">
                {lastUpdate && now
                  ? formatRelativeTime(lastUpdate, now)
                  : (latest as any).time}
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="border border-[#12203a] bg-linear-to-b from-[#061018] to-[#071022] rounded-xl p-4 shadow-md"
          >
            <div className="text-xs text-slate-400">CH2O Concentration</div>
            <div className={`text-3xl font-bold mt-2 ${levelColor(latest.level)}`}>
              {latest.ch2o_ppm.toFixed(3)} ppm
            </div>
            <div className="text-xs text-slate-500 mt-1">Current reading</div>
            <div className="mt-3 text-xs text-slate-500">
              Safe ≤ {SAFE_LIMIT} ppm • Danger ≥ {DANGER_LIMIT} ppm
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="border border-[#132030] bg-linear-to-b from-[#061018] to-[#071022] rounded-xl p-4 shadow-md"
          >
            <div className="text-xs text-slate-400">Gas Level</div>
            <div className="mt-3">
              <span
                className={`inline-flex items-center rounded-md border px-3 py-1 text-sm font-semibold uppercase tracking-wide ${levelBadge(
                  latest.level
                )}`}
              >
                {latest.level}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-3">
              Derived from CH2O thresholds
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="border border-[#122033] bg-linear-to-b from-[#061018] to-[#071022] rounded-xl p-4 shadow-md"
          >
            <div className="text-xs text-slate-400">Device Status</div>
            <div className="flex items-center gap-3 mt-2">
              <span
                className={`inline-block w-3 h-3 rounded-full shadow-sm ${isOnline ? "bg-emerald-400" : "bg-rose-500"
                  }`}
              />
              <div className="text-sm font-medium">
                {isOnline
                  ? "Online"
                  : `Offline (${lastUpdate && now
                    ? formatRelativeTime(lastUpdate, now)
                    : "--"
                  })`}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-6">
          <ChartCard title="CH2O (24h)" unit="ppm" data={data} />
          <BarChartCard title="CH2O Bars" unit="ppm" data={data} />
          <PieChartCard title="CH2O Levels (%)" data={data} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="p-4 rounded-xl bg-[#061017] border border-[#112034] shadow-md"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-slate-400">Recent readings</div>
              <div className="text-sm text-slate-300">Latest {visibleRows} sensor rows</div>
            </div>
            <select
              value={visibleRows}
              onChange={(e) => setVisibleRows(Number(e.target.value))}
              className="bg-[#0f1724] border border-[#122033] rounded-md px-2 py-1 text-xs"
            >
              {rowOptions.map((n) => (
                <option key={n} value={n}>
                  Show {n}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs border-b border-[#122033]">
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">CH2O</th>
                  <th className="py-2 px-3">Level</th>
                </tr>
              </thead>
              <tbody>
                {data
                  .slice(-visibleRows)
                  .reverse()
                  .map((r, i) => (
                    <tr
                      key={r.id ?? i}
                      className="border-b border-[#0f2233] hover:bg-[#071627]"
                    >
                      <td className="py-2 px-3 font-mono text-slate-300">
                        {r.time}
                      </td>
                      <td className="py-2 px-3">{Number(r.ch2o_ppm).toFixed(3)} ppm</td>
                      <td className="py-2 px-3">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${levelBadge(
                            r.level
                          )}`}
                        >
                          {r.level}
                        </span>
                      </td>
                    </tr>
                  ))}
                {data.length === 0 && !loading && (
                  <tr>
                    <td className="py-4 px-3 text-slate-400" colSpan={3}>
                      No data yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        <footer className="mt-6 text-center text-xs text-slate-500">
          Built with ESP32 • ZE08-CH2O • Supabase • Next.js
        </footer>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  unit,
  data,
}: {
  title: string;
  unit: string;
  data: Array<SensorDataEntry & { ch2o_ppm?: number; level?: string }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="p-4 rounded-xl bg-[#061017] border border-[#112034] shadow-md"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-400">{title}</div>
          <div className="text-sm text-slate-300">Realtime and historical</div>
        </div>
        <div className="text-xs text-slate-400">{unit}</div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#0b2233" strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tick={{ fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{
                background: "#071327",
                border: "1px solid #13314a",
              }}
              itemStyle={{ color: "#fff" }}
            />
            <ReferenceLine y={SAFE_LIMIT} stroke="#60a5fa" strokeDasharray="4 6" />
            <ReferenceLine y={DANGER_LIMIT} stroke="#ef4444" strokeDasharray="4 6" />
            <Line
              type="monotone"
              dataKey="ch2o_ppm"
              stroke="#f59e0b"
              strokeWidth={2.4}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

function BarChartCard({
  title,
  unit,
  data,
}: {
  title: string;
  unit: string;
  data: Array<SensorDataEntry & { ch2o_ppm?: number; level?: string }>;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="p-4 rounded-xl bg-[#061017] border border-[#112034] shadow-md"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs text-slate-400">{title}</div>
          <div className="text-sm text-slate-300">Bar view</div>
        </div>
        <div className="text-xs text-slate-400">{unit}</div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data.slice(-40)} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#0b2233" strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tick={{ fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{ background: "#071327", border: "1px solid #13314a" }}
              itemStyle={{ color: "#fff" }}
            />
            <ReferenceLine y={SAFE_LIMIT} stroke="#60a5fa" strokeDasharray="4 6" />
            <ReferenceLine y={DANGER_LIMIT} stroke="#ef4444" strokeDasharray="4 6" />
            <Bar dataKey="ch2o_ppm" fill="#38bdf8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

function PieChartCard({
  title,
  data,
}: {
  title: string;
  data: Array<SensorDataEntry & { ch2o_ppm?: number; level?: string }>;
}) {
  const pieData = useMemo(() => {
    const counts = { safe: 0, warning: 0, danger: 0 };
    for (const row of data) {
      if (row.level === "safe") counts.safe += 1;
      else if (row.level === "warning") counts.warning += 1;
      else if (row.level === "danger") counts.danger += 1;
    }

    const total = counts.safe + counts.warning + counts.danger;
    if (total === 0) return [];

    return [
      { name: "Safe", value: (counts.safe / total) * 100, raw: counts.safe, color: "#34d399" },
      { name: "Warning", value: (counts.warning / total) * 100, raw: counts.warning, color: "#fbbf24" },
      { name: "Danger", value: (counts.danger / total) * 100, raw: counts.danger, color: "#f43f5e" },
    ].filter((x) => x.raw > 0);
  }, [data]);

  return (
    <motion.div className="p-4 rounded-xl bg-[#061017] border border-[#112034] shadow-md">
      <div className="text-xs text-slate-400">{title}</div>
      <div className="text-sm text-slate-300 mb-3">Distribution by percentage</div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={90}
              label={({ name, value }) => `${name} ${Number(value).toFixed(1)}%`}
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => {
                const num =
                  typeof value === "number"
                    ? value
                    : Number(Array.isArray(value) ? value[0] : value ?? 0);

                const raw = Number((item?.payload as { raw?: number } | undefined)?.raw ?? 0);
                const label = (item?.payload as { name?: string } | undefined)?.name ?? "Level";

                return [`${num.toFixed(1)}% (${raw} readings)`, label];
              }}
              contentStyle={{ background: "#071327", border: "1px solid #13314a" }}
              itemStyle={{ color: "#fff" }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}