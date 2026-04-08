# CH2O Realtime Monitor

## Supabase + Next.js + ESP32

Realtime formaldehyde (CH2O) monitoring project using an ESP32 sensor node, Supabase for backend/realtime, and a Next.js dashboard for live visualization and alerts.

## Overview

This project is built to:

- Read CH2O values from an ESP32-connected gas sensor
- Push sensor data to Supabase
- Stream updates in realtime to a Next.js web dashboard
- Store historical readings for charts, analysis, and alerting

## Tech Stack

- **Frontend:** Next.js (App Router)
- **Backend/Data:** Supabase (Postgres + Realtime + Auth optional)
- **Device:** ESP32 (Wi-Fi sensor publisher)
- **Realtime:** Supabase channel subscriptions
