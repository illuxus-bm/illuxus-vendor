# Illuxus Vendor

The supplier-facing app in the Illuxus platform. Vendors (catering, AV,
photography, decor, etc.) sign up here, publish their services, respond to
organizer RFQs, send quotes, and manage bookings.

This app is **separate from the main illuxus app** but shares the same
Supabase backend. See `../illuxus/ARCHITECTURE.md` (if present) for the
"one backend, two apps" contract.

## Getting started

```sh
bun install                     # or: npm install / pnpm install
cp .env.example .env            # paste values from ../illuxus/.env
bun run dev                     # runs on http://localhost:8081
```

## Routes

| Route             | Audience   | Purpose                                                     |
| ----------------- | ---------- | ----------------------------------------------------------- |
| `/vendor/signup`  | Public     | Create a vendor business account                            |
| `/vendor/login`   | Public     | Sign in (supports `?next=`)                                 |
| `/vendor`         | Vendor     | Tabbed dashboard (Overview, Inbox, Quotes, Bookings, ...)   |

## Dashboard tabs

Overview · Inbox · Quotes · Bookings · Services · Portfolio · Availability · Reviews · Profile

## Stack

Vite + React 18 + TypeScript · Tailwind + shadcn/ui · TanStack Query ·
react-hook-form + zod · Supabase (auth, Postgres, storage, realtime).
