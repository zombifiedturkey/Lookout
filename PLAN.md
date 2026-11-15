# Lookout: plan

## Goal
A polished, glass-style web UI for a home camera system, built against Frigate's HTTP API (like a custom front end on a media server).
Audience: the owner and household. Desktop and mobile browser first, then an Android TV app and a Shield launcher widget reading from the same backend.

## Principles
- LAN only. No port forwarding.
- Credentials stay server-side (container environment variables). Clients only ever hold an optional Lookout token.
- Smallest working step, confirmed before the next.
- Visual style: floating glass panels, consistent with the owner's other apps.

## Architecture
Browser / TV app / launcher widget -> Lookout (Node + TypeScript) -> Frigate (`:8971`, authenticated) -> cameras.
Lookout logs in as a viewer account, caches snapshots for 1-2 s, and serves the API plus the built UI from one Docker image.

## Milestones
- **M0** Backend skeleton and `/health` (reports camera names). *Done, verified against real Frigate.*
- **M1** Snapshot proxy: `/api/cameras`, `/api/cameras/:name/snapshot.jpg` with short cache. *Done, verified against real Frigate.*
- **M2** React + Vite + Tailwind UI in `web/`: 2x2 grid (snapshots every 2 s), click for full-screen (1 s). *Written; needs testing.*
- **M3** Event timeline with thumbnails (`/api/events`).
- **M4** Clip playback for an event.
- **M5** Docker image built by GitHub Actions (`:edge`), Unraid template.
- **M6** Real live video via Frigate's go2rtc; Android TV app; Shield launcher widget; notifications.

## Open items
- Motion masks to cut detection load on the busiest cameras.
- Parcel detection needs a different Frigate model.
