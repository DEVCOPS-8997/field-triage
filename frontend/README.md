# Field Triage: frontend

React web app for **Field Triage**, the crop-rotation decision-support tool built by team Krypton Knights for the NASA Space Apps 2026 **Field Shift** challenge. See the [project README](../README.md) and [DOCUMENTATION.md](../DOCUMENTATION.md) for the full picture.

## Stack

React 19 · TypeScript 7 · Vite 8 · Tailwind CSS 4 · React Router 7 · TanStack Query 5 · Zustand · Leaflet / react-leaflet · Recharts · lucide-react · Supabase JS · oxlint. English and Urdu (right-to-left) via `src/lib/i18n`.

## Pages

| Route | Page |
|---|---|
| `/` | Overview: map search, drop a pin, saved fields for signed-in users |
| `/location?lat&lon` | Location analysis: farm inputs, best fit, farm year, comparison, details, climate, site, data |
| `/account` | Sign up / sign in |
| `/my-fields`, `/my-fields/new`, `/my-fields/:id` | Saved fields and the field editor (draw polygon, rectangle or circle) |
| `/methodology` | Formulas and sources in plain language |
| `/fields/:fieldId` | Demo pilot fields |

## Run

```bash
npm install
cp .env.example .env.local   # VITE_API_URL, VITE_USE_MOCK, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173 (backend on :8000)
npm run build                # type-check + production build
npm run lint                 # oxlint
```

Set `VITE_USE_MOCK=true` to run offline on the mock responses in `public/mock/`.
