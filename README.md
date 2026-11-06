<div align="center">

# 🌹 Red Rose Sweets — Digital Ordering & Restaurant Management Platform

### An end-to-end, real-time ordering, billing, and operations suite built for a premium sweets & dessert house in **Kuwait** 🇰🇼

*A full-scale production system delivered for an international client, engineered and maintained by **Cenexa Systems**.*

![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Realtime-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

</div>

---

## 🌍 About the Project

**Red Rose Sweets** is a bespoke, mobile-first digital platform built for a premium dessert and sweets brand based in **Kuwait**. Delivered for an **overseas client**, the system runs a complete restaurant operation — from the moment a customer scans a table QR code or opens the website, to the kitchen, the waiter floor, the delivery driver, and the owner's analytics dashboard — all synchronized **in real time**.

It is not a template. Every flow — dine-in, takeaway, and delivery — was designed around the client's real-world workflow in the Kuwaiti market: Arabic-aware branding, KWD currency, governorate-based delivery zones, GST/non-GST tax handling, and WhatsApp-first order dispatch, which is the primary ordering channel in the region.

---

## ✨ Highlights

- 🔴 **Real-time everything** — orders, tables, billing, and kitchen tickets update live across every device using Supabase Realtime. No refreshes, no polling delays.
- 📱 **Mobile-first, portrait-optimized** — designed for phones first, where the customers actually are.
- 🧾 **Full POS & billing engine** — invoicing, discounts, coupons, tax, and printable receipts with a shareable invoice link.
- 💬 **WhatsApp order dispatch** — one tap sends a fully formatted order (with a live invoice link) to the shop's WhatsApp.
- 🛵 **Complete delivery pipeline** — governorate-based zones, admin-editable pricing, driver assignment, and live status tracking.
- 🎛️ **Owner-controlled content** — a built-in CMS lets the owner swap homepage photos & videos with zero code.
- 🔐 **Role-isolated portals** — separate secured surfaces for admin, chef, waiter, and driver.

---

## 🏗️ System Architecture

A single Next.js App Router codebase powering **five distinct user surfaces**, each on its own obfuscated route:

| Surface | Route | Purpose |
|---|---|---|
| 🛍️ **Customer Storefront** | `/` · `/menu` | Landing page, live menu, cart, dine-in / takeaway / delivery checkout |
| 🧑‍💼 **Admin Console** | `/admin-portal-xyz-987` | Billing/POS, analytics, inventory, tables, coupons, deliveries, homepage CMS |
| 👨‍🍳 **Chef Station** | `/chef-station-abc-123` | Live kitchen tickets & order status |
| 🧑‍🔧 **Waiter Dashboard** | `/waiter-dashboard-def-456` | Table service, open tabs, customer call alerts |
| 🛵 **Driver Station** | `/driver-station-ghi-789` | Delivery queue & status updates |

### Admin Console modules

> Billing / POS · Incoming Orders · Open Tabs · Analytics · Orders History · Inventory · Tables (QR) · Coupons · Deliveries · Delivery Zones · **Homepage CMS**

---

## 🧩 Feature Breakdown

### For the Customer
- Browse a live, category-organized menu with **best-seller** highlights
- Order via **dine-in** (table QR), **takeaway** (with pickup time), or **delivery**
- Apply **coupon codes** (percentage or fixed-amount)
- Governorate → area delivery address capture with transparent delivery fees
- One-tap **WhatsApp** order submission + a **view-your-invoice** link
- Customer accounts with order history and Google sign-in

### For the Business
- **Point-of-sale billing** with discounts, tax, and printable invoices
- **Real-time analytics** — today's sales, trends, and performance at a glance
- **Inventory & menu management** — add products, create categories, set best-sellers, upload photos
- **Table management** with live occupancy and session locking
- **Coupon engine** with targeting rules
- **Delivery operations** — editable governorate pricing, driver dispatch, live tracking
- **Homepage CMS** — upload portrait photos (≤5 MB) and videos (≤10 MB) straight to cloud storage
- **Tax handling** — GST / non-GST, inclusive or exclusive pricing

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16 (App Router, Turbopack, Server Components) |
| **UI** | React 19 · Tailwind CSS v4 · lucide-react icons |
| **Language** | TypeScript (strict) |
| **Backend & Data** | Supabase — Postgres, Realtime, Storage, Row-Level Security |
| **Media** | Client-side WebP compression · cloud storage buckets |
| **Integrations** | WhatsApp deep-link dispatch · QR code generation · payment flow |
| **Architecture** | Optimistic realtime stores · graceful schema degradation · server-rendered storefront |

### Engineering notes
- **Realtime store pattern** — a custom `createRealtimeStore` layer gives every surface optimistic updates with automatic reconciliation against Postgres.
- **Graceful degradation** — stores strip-and-retry on missing columns/tables, so the app never hard-crashes against an older schema.
- **Security-first** — writes go through a service-role API with per-table whitelisting; anon clients get read-only access via RLS.
- **Server-rendered storefront** — the public homepage is a cached Server Component for speed and SEO, with CMS media fetched server-side.

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see below)
cp .env.example .env.local   # then fill in your values

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the storefront.

### Environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=         # your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # anon public key
SUPABASE_SERVICE_ROLE_KEY=        # server-side service role key
NEXT_PUBLIC_SHOP_WHATSAPP=        # shop WhatsApp number, digits only
```

> 🔒 Secrets, phone numbers, keys, and URLs are **always** read from environment variables — never hardcoded.

### Database setup

Run the SQL migrations in `supabase/` from the Supabase SQL editor (schema and security first, then feature migrations):

```
schema.sql · security.sql · storage.sql
delivery.sql · delivery_areas.sql · add_customer_columns.sql
app_settings.sql · homepage_media.sql · best_seller.sql · coupon_targeting.sql
```

---

## 📦 Build & Deploy

```bash
npm run build    # production build
npm run start    # serve the production build
```

Deploys cleanly to any Next.js-compatible host (Vercel recommended), with Supabase as the managed backend.

---

<div align="center">

### Crafted with care for a global client. 🌹

**Powered by Cenexa Systems** · © 2026

</div>
