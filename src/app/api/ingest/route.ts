import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const DEVICE_SECRET = process.env.DEVICE_SECRET!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DEVICE_SECRET) {
  throw new Error("Missing required env vars for ingest route");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const TIMEZONE = process.env.TIMEZONE || "Asia/Manila";
const MINUTES_BETWEEN = Number(process.env.ALERT_MINUTES_BETWEEN || 10);

// Match your ESP32 logic defaults
const SAFE_LIMIT = Number(process.env.CH2O_SAFE_LIMIT || 0.08);
const DANGER_LIMIT = Number(process.env.CH2O_DANGER_LIMIT || 0.75);

function normalizeSecret(headerSecret: string | null): string {
  if (!headerSecret) return "";
  return headerSecret.startsWith("Bearer ")
    ? headerSecret.slice("Bearer ".length)
    : headerSecret;
}

function deriveLevel(ch2o: number): "safe" | "warning" | "danger" {
  if (ch2o <= SAFE_LIMIT) return "safe";
  if (ch2o < DANGER_LIMIT) return "warning";
  return "danger";
}

async function sendTelegramMessage(text: string) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    return { ok: false, reason: "no_telegram" as const };
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });

    const json = await res.json();
    return { ok: res.ok, json };
  } catch (e) {
    console.error("telegram send error", e);
    return { ok: false, reason: "send_failed" as const };
  }
}

export async function POST(req: Request) {
  try {
    const rawHeaderSecret =
      req.headers.get("device-secret") ||
      req.headers.get("x-device-secret") ||
      req.headers.get("authorization");

    const providedSecret = normalizeSecret(rawHeaderSecret);
    if (!providedSecret || providedSecret !== DEVICE_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { device_id, ch2o_ppm, level } = body || {};

    if (!device_id || ch2o_ppm === undefined) {
      return NextResponse.json(
        { error: "Bad request - missing device_id or ch2o_ppm" },
        { status: 400 }
      );
    }

    const ppm = Number(ch2o_ppm);
    if (!Number.isFinite(ppm) || ppm < 0) {
      return NextResponse.json(
        { error: "Bad request - invalid ch2o_ppm" },
        { status: 400 }
      );
    }

    const normalizedLevel =
      level === "safe" || level === "warning" || level === "danger"
        ? level
        : deriveLevel(ppm);

    // Store reading
    const { data, error } = await supabase
      .from("sensor_data")
      .insert({
        device_id,
        ch2o_ppm: ppm,
        level: normalizedLevel,
      })
      .select()
      .single();

    if (error) {
      console.error("supabase insert error:", error);
      return NextResponse.json(
        { error: error.message || "Insert failed" },
        { status: 500 }
      );
    }

    // Only alert for warning/danger
    const alertsToSend: { type: "ch2o_warning" | "ch2o_danger"; value: number }[] = [];
    if (normalizedLevel === "warning") {
      alertsToSend.push({ type: "ch2o_warning", value: ppm });
    } else if (normalizedLevel === "danger") {
      alertsToSend.push({ type: "ch2o_danger", value: ppm });
    }

    for (const a of alertsToSend) {
      const { data: lastAlerts, error: lastErr } = await supabase
        .from("alerts")
        .select("created_at")
        .eq("device_id", device_id)
        .eq("alert_type", a.type)
        .order("created_at", { ascending: false })
        .limit(1);

      if (lastErr) console.warn("error fetching last alert", lastErr);

      let shouldSend = true;
      if (lastAlerts && lastAlerts.length > 0) {
        const lastTime = new Date(lastAlerts[0].created_at).getTime();
        const diffMin = (Date.now() - lastTime) / (1000 * 60);
        if (diffMin < MINUTES_BETWEEN) shouldSend = false;
      }

      if (shouldSend) {
        const createdAtIso = data.created_at ?? new Date().toISOString();
        const createdAtDate = new Date(createdAtIso);

        const formattedTime = createdAtDate.toLocaleString("en-US", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        const message =
          `<b>CH2O ALERT</b>\n` +
          `Device: <code>${device_id}</code>\n` +
          `Type: ${a.type}\n` +
          `Level: ${normalizedLevel}\n` +
          `CH2O: ${a.value.toFixed(3)} ppm\n` +
          `Time (${TIMEZONE}): ${formattedTime}\n` +
          `Timestamp (UTC): ${createdAtIso}\n\n` +
          `URL: ${process.env.NEXT_PUBLIC_SITE_URL || "Demo URL"}`;

        const sent = await sendTelegramMessage(message);

        const { error: recordErr } = await supabase.from("alerts").insert({
          device_id,
          alert_type: a.type,
          ch2o_ppm: a.value,
          level: normalizedLevel,
        });

        if (recordErr) {
          console.warn("failed to record alert", recordErr);
        } else {
          console.log("alert recorded", { device_id, type: a.type, sent: sent.ok });
        }
      }
    }

    return NextResponse.json({ success: true, row: data }, { status: 201 });
  } catch (err) {
    console.error("ingest handler error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}