"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// If you already have a shared supabase client, use that instead.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type GasLevel = "safe" | "warning" | "danger";

export interface SensorDataEntry {
  id?: string | number;
  device_id: string;
  ch2o_ppm: number;
  level: GasLevel;
  created_at: string | null;
  time: string; // preformatted local time for chart/table
}

type SensorRow = {
  id?: string | number;
  device_id: string;
  ch2o_ppm: number | string | null;
  level?: string | null;
  created_at: string | null;
};

const SAFE_LIMIT = Number(process.env.NEXT_PUBLIC_CH2O_SAFE_LIMIT || 0.08);
const DANGER_LIMIT = Number(process.env.NEXT_PUBLIC_CH2O_DANGER_LIMIT || 0.75);

function deriveLevel(ppm: number): GasLevel {
  if (ppm <= SAFE_LIMIT) return "safe";
  if (ppm < DANGER_LIMIT) return "warning";
  return "danger";
}

function normalizeLevel(raw: unknown, ppm: number): GasLevel {
  if (raw === "safe" || raw === "warning" || raw === "danger") return raw;
  return deriveLevel(ppm);
}

function mapRow(row: SensorRow): SensorDataEntry {
  const ppm = Number(row.ch2o_ppm ?? 0);
  const created = row.created_at;
  const dt = created ? new Date(created) : null;

  return {
    id: row.id,
    device_id: row.device_id,
    ch2o_ppm: Number.isFinite(ppm) ? ppm : 0,
    level: normalizeLevel(row.level, Number.isFinite(ppm) ? ppm : 0),
    created_at: created,
    time: dt 
      ? dt.toLocaleTimeString("en-PH", { 
          hour: "2-digit", 
          minute: "2-digit",  
          second: "2-digit", 
          hour12: false, 
          timeZone: "Asia/Manila",
        }) 
      : "--:--",
  };
}

export function useSensorRealtime(deviceId: string, initialLimit = 200) {
  const [data, setData] = useState<SensorDataEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      setLoading(true);

      const { data: rows, error } = await supabase
        .from("sensor_data")
        .select("id, device_id, ch2o_ppm, level, created_at")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: true })
        .limit(initialLimit);

      if (!mounted) return;

      if (error) {
        console.error("Initial sensor_data load error:", error);
        setData([]);
      } else {
        setData((rows ?? []).map((r) => mapRow(r as SensorRow)));
      }

      setLoading(false);
    }

    loadInitial();

    const channel = supabase
      .channel(`sensor_data:${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "sensor_data",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const mapped = mapRow(payload.new as SensorRow);
          setData((prev) => {
            const next = [...prev, mapped];
            if (next.length > initialLimit) next.shift();
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [deviceId, initialLimit]);

  const latest = useMemo(
    () =>
      data.length
        ? data[data.length - 1]
        : ({
            device_id: deviceId,
            ch2o_ppm: 0,
            level: "safe",
            created_at: null,
            time: "--:--",
          } as SensorDataEntry),
    [data, deviceId]
  );

  return { data, latest, loading };
}