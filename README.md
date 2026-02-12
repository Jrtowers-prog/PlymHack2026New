# 🌙 Safe Night Home

A cross-platform mobile app that helps pedestrians find **safer walking routes at night** by building a custom OSM walking graph, running **A\* pathfinding with a multi-factor safety cost function**, and visualising risk per segment on an interactive map — with **AI-powered route explanations** via GPT-4o-mini.

Built with **React Native (Expo SDK 54)**, **TypeScript**, and an **Express.js** backend deployed on **Render.com**.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Graph-based safe routing** | Builds a full OSM walking graph from Overpass data and runs A\* pathfinding with a safety-weighted cost function to find 3–5 optimally safe route alternatives. |
| **6-factor safety scoring** | Every graph edge is scored on **crime density, street lighting, CCTV coverage, road type, open businesses, and foot traffic** — with time-adaptive weights that shift for late night vs. daytime. |
| **Colour-coded segments** | Routes are split into ~50 m chunks and rendered green / yellow / red on the map so risk hotspots are visible at a glance. |
| **AI safety explanation** | GPT-4o-mini generates a plain-English summary explaining *why* the safest route was chosen, referencing specific safety metrics. |
| **Turn-by-turn navigation** | Full walking navigation with live GPS tracking, off-route detection, and step-by-step instructions. |
| **Place search** | Nominatim-powered autocomplete for origin and destination with reverse-geocoding support. |
| **Pin-drop routing** | Long-press to set origin/destination directly on the map. |
| **Cross-platform maps** | Leaflet (via WebView) on Android, `react-native-maps` on iOS, and Leaflet on web — with platform-specific implementations. |
| **Onboarding & disclaimer** | First-launch safety disclaimer persisted via AsyncStorage. |
| **Spatial indexing** | Grid-based spatial indices (~100 m cells) for O(1) proximity lookups, replacing brute-force distance checks. |
| **Coverage maps** | Pre-computed `Float32Array` grids with inverse-distance-squared falloff for lighting and crime density — O(1) per-edge safety lookups. |
| **Multi-layer caching** | Route cache (5 min), OSM data cache (30 min), crime data cache (24 h), and request coalescing for concurrent identical requests. |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Mobile App (Expo SDK 54)                    │
│                                                              │
│  app/              Expo Router screens                       │
│    _layout.tsx     Root layout (SafeAreaProvider + Stack)     │
│    index.tsx       Main screen (map, search, routes, nav)    │
│    modal.tsx       Generic modal route                       │
│                                                              │
│  src/                                                        │
│  ├── components/                                             │
│  │   ├── maps/         Platform-specific map views           │
│  │   ├── android/      Android WebView overlay z-ordering    │
│  │   ├── modals/       AI explanation & onboarding modals    │
│  │   ├── navigation/   Turn-by-turn overlay                  │
│  │   ├── routes/       Route list & route cards              │
│  │   ├── safety/       Safety panel & profile chart          │
│  │   ├── search/       Search bar with autocomplete          │
│  │   ├── sheets/       Draggable bottom sheet                │
│  │   └── ui/           Reusable widgets (progress, loading)  │
│  ├── config/env.ts     Centralised env-var config            │
│  ├── hooks/            12 custom React hooks                 │
│  ├── services/         API clients & scoring logic           │
│  ├── types/            TypeScript type definitions           │
│  └── utils/            Polyline, caching, spatial utils      │
└─────────────┬────────────────────────────────────────────────┘
              │  HTTPS
              ▼
┌──────────────────────────────────────────────────────────────┐
│              Express.js Backend (Render.com)                  │
│                                                              │
│  Security: Helmet · CORS whitelist · Rate limiting           │
│            Input validation · Server-side API keys           │
│                                                              │
│  Endpoints:                                                  │
│    GET  /api/safe-routes       A* pathfinding + safety scores│
│    GET  /api/directions        OSRM walking directions       │
│    GET  /api/places/autocomplete  Nominatim place search     │
│    GET  /api/places/details    Place details                 │
│    GET  /api/places/nearby     Nearby amenities (Overpass)   │
│    POST /api/explain-route     AI explanation (OpenAI proxy) │
│    GET  /api/staticmap         Static map images             │
│    GET  /api/health            Health check                  │
│                                                              │
│  Services:                                                   │
│    safetyGraph.js    A* pathfinding + MinHeap + K-routes     │
│    crimeClient.js    UK Police API crime data                │
│    overpassClient.js Overpass with 3-server rotation + retry │
│    geo.js            Haversine, bounding boxes, polyline     │
└─────────────┬────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────┐
│                    External Data Sources                      │
│                                                              │
│  • Overpass API — roads, street lights, CCTV, transit, shops │
│  • UK Police API — street-level crime data (England & Wales) │
│  • OSRM — pedestrian walking directions                      │
│  • Nominatim — place search & reverse geocoding              │
│  • OpenAI API — GPT-4o-mini for route explanations           │
│  • OpenStreetMap Tiles — raster map tiles                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** or **yarn**
- **Expo CLI** (`npx expo`)
- For Android: Android Studio with an emulator or a physical device
- For iOS: Xcode with a simulator (macOS only)

### 1. Clone & install

```bash
git clone https://github.com/mobinzaki/PlymHack2026New.git
cd PlymHack2026New
npm install
cd backend && npm install && cd ..
```

### 2. Configure environment variables

**Frontend** — create `.env` in the project root:

```env
# ─── Required ───────────────────────────────────────
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001   # Backend URL

# ─── Recommended ────────────────────────────────────
EXPO_PUBLIC_OSM_USER_AGENT=        # Descriptive user-agent for Nominatim (required in prod)
EXPO_PUBLIC_OSM_EMAIL=             # Contact email for Nominatim

# ─── Optional (sensible defaults provided) ──────────
EXPO_PUBLIC_OS_MAPS_API_KEY=       # Ordnance Survey Maps API key
EXPO_PUBLIC_OS_MAPS_LAYER=Road_3857
EXPO_PUBLIC_OS_MAPS_BASE_URL=https://api.os.uk/maps/raster/v1/zxy
EXPO_PUBLIC_OSM_BASE_URL=https://nominatim.openstreetmap.org
EXPO_PUBLIC_OSM_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
EXPO_PUBLIC_OSRM_BASE_URL=https://router.project-osrm.org
EXPO_PUBLIC_OVERPASS_API_URL=https://overpass-api.de/api/interpreter
EXPO_PUBLIC_POLICE_API_URL=https://data.police.uk/api
```

**Backend** — create `.env` in `backend/`:

```env
PORT=3001
OPENAI_API_KEY=your-openai-key     # Required for AI explanations
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006
OSM_USER_AGENT=SafeNightHome/1.0
NODE_ENV=development
```

### 3. Start the backend

```bash
cd backend
npm run dev          # Starts Express server on port 3001
```

### 4. Run the app

```bash
# In a separate terminal, from project root:
npx expo start

# Platform-specific shortcuts
npx expo start --web        # Open in browser
npx expo run:android        # Build & run on Android
npx expo run:ios            # Build & run on iOS
```

---

## 📂 Project Structure

```
PlymHack2026New/
├── app/                              Expo Router screens
│   ├── _layout.tsx                   Root layout (SafeAreaProvider + Stack)
│   ├── index.tsx                     Main screen (map, search, routes, nav)
│   └── modal.tsx                     Modal route
│
├── src/
│   ├── components/
│   │   ├── android/                  Android WebView overlay z-ordering
│   │   ├── maps/                     Platform-specific map implementations
│   │   │   ├── RouteMap.tsx          Platform switch
│   │   │   ├── RouteMap.android.tsx  Android (Leaflet via WebView)
│   │   │   ├── RouteMap.native.tsx   iOS (react-native-maps)
│   │   │   ├── RouteMap.web.tsx      Web (Leaflet)
│   │   │   ├── leafletMapHtml.ts     Leaflet HTML injection
│   │   │   └── mapConstants.ts       Shared map config
│   │   ├── modals/                   AI explanation & onboarding modals
│   │   ├── navigation/              Turn-by-turn overlay
│   │   ├── routes/                   Route list & route cards
│   │   ├── safety/                   Safety panel & profile chart
│   │   ├── search/                   Search bar with autocomplete
│   │   ├── sheets/                   Draggable bottom sheet
│   │   └── ui/                       Reusable widgets
│   │
│   ├── config/
│   │   └── env.ts                    Centralised env-var access
│   │
│   ├── hooks/
│   │   ├── useAIExplanation.ts       Triggers OpenAI route explanation
│   │   ├── useAllRoutesSafety.ts     Parallel safety scoring for all routes
│   │   ├── useCurrentLocation.ts     GPS location + permission handling
│   │   ├── useDirections.ts          Fetches OSRM walking directions
│   │   ├── useHomeScreen.ts          Main screen orchestration
│   │   ├── useNavigation.ts          Turn-by-turn navigation state
│   │   ├── useOnboarding.ts          Onboarding/disclaimer persistence
│   │   ├── usePlaceAutocomplete.ts   Place autocomplete
│   │   ├── useRouteSafety.ts         Full safety map data for selected route
│   │   ├── useSafeRoutes.ts          Backend safe-routes integration
│   │   └── useSegmentSafety.ts       Per-segment scoring for a route
│   │
│   ├── services/
│   │   ├── googleMaps.ts             Google Maps REST client
│   │   ├── location.ts              expo-location wrapper
│   │   ├── onboarding.ts            AsyncStorage persistence
│   │   ├── openai.ts                OpenAI client (backend proxy)
│   │   ├── openStreetMap.ts         Nominatim + OSRM client
│   │   ├── osMaps.ts               OS Maps tile URL builder
│   │   ├── osmDirections.ts        OSM directions service
│   │   ├── routeSegmentEnricher.ts  Spatial-grid segment enrichment
│   │   ├── safeRoutes.ts           Safe routes client + caching
│   │   ├── safety.ts               Core safety pipeline
│   │   ├── safetyMapData.ts        Map-oriented safety data aggregator
│   │   └── segmentScoring.ts       Weighted segment risk scoring
│   │
│   ├── types/
│   │   ├── errors.ts               AppError class with error codes
│   │   ├── google.ts               Core domain types (LatLng, Route, etc.)
│   │   ├── osm.ts                  Nominatim & OSRM response types
│   │   └── safety.ts              Safety analysis pipeline types
│   │
│   └── utils/
│       ├── colorCode.ts            Score → colour/risk-level mapping
│       ├── format.ts               Formatting utilities
│       ├── lightingScore.ts        Lighting score from OSM tags + time
│       ├── nearbyCache.ts          Nearby-places cache
│       ├── overpassQueue.ts        Overpass request queue
│       ├── polyline.ts             Google polyline encode/decode
│       └── segmentRoute.ts         Route → 50 m segment splitter
│
├── backend/
│   ├── package.json                 Backend dependencies
│   └── src/
│       ├── index.js                 Express server entry point
│       ├── validate.js              Input validation middleware
│       ├── routes/
│       │   ├── directions.js        OSRM walking directions proxy
│       │   ├── explain.js           OpenAI AI explanation endpoint
│       │   ├── nearby.js            Nearby amenities (Overpass)
│       │   ├── places.js            Place search (Nominatim)
│       │   ├── safeRoutes.js        A* safe routing + request coalescing
│       │   └── staticmap.js         Static map image proxy
│       └── services/
│           ├── crimeClient.js       UK Police API client
│           ├── geo.js               Haversine, bounding boxes, polyline
│           ├── overpassClient.js    Overpass with 3-server rotation
│           └── safetyGraph.js       A* pathfinding + MinHeap + K-routes
│
├── android/                         Android native project
├── ios/                             iOS native project
├── assets/images/                   Static image assets
├── app.config.js                    Expo config (permissions, plugins)
├── render.yaml                      Render.com backend deployment
├── netlify.toml                     Netlify web frontend deployment
├── package.json                     Frontend dependencies
└── tsconfig.json                    TypeScript configuration
```

---

## 🧠 Key Algorithms

### A\* Pathfinding with Safety Weighting

The backend builds a **full OSM walking graph** from Overpass data, then runs a custom A\* search:

1. **Graph construction** — indexes all OSM nodes, filters 14 walkable highway types, builds bidirectional adjacency lists
2. **Edge scoring** — every edge is scored on 6 safety factors using pre-computed coverage maps
3. **Cost function** — `cost = distance / safetyScore` — optimises for short AND safe
4. **Heuristic** — Haversine distance (admissible, never overestimates)
5. **K-diverse routes** — finds safest route, penalises used edges by +0.15, re-runs A\*; filters duplicates by >85% edge overlap
6. **Dead-end detection** — nodes with degree ≤ 1 receive a safety penalty (harder to escape danger)

### Spatial Indexing

Grid-based spatial indices (~100 m cells) provide **O(1) proximity lookups** for nearby features (lights, CCTV, businesses), replacing O(n×m) brute-force distance checks with 9-cell neighbourhood queries.

### Coverage Maps

Pre-computed `Float32Array` grids (~25 m cells) for:
- **Lighting** — inverse-distance-squared falloff from each street lamp (60 m effective radius), with lamp quality multipliers (LED = 1.4×, mercury/gas = 0.7×)
- **Crime density** — severity-weighted with distance decay: $\text{impact} = \frac{\text{severity}}{1 + (d/30)^{1.5}}$

---

## 🧮 Safety Scoring Model

### Per-Edge Scoring (Backend)

$$\text{safetyScore} = \sum_{i} w_i \times \text{factor}_i - \text{surfacePenalty}$$

**Time-adaptive weights** shift based on hour of day:

| Factor | Late Night (0–5 am) | Evening (6 pm–midnight) | Daytime |
|---|---|---|---|
| Road Type | 0.22 | 0.23 | 0.25 |
| Lighting | **0.28** | 0.25 | 0.15 |
| Crime | **0.25** | 0.22 | 0.20 |
| CCTV | 0.08 | 0.07 | 0.05 |
| Open Places | 0.07 | 0.12 | 0.15 |
| Foot Traffic | 0.10 | 0.11 | 0.20 |

### Crime Severity Weighting

Not all crimes are equal — violent crime/robbery = 1.0, shoplifting = 0.2.

### Per-Segment Scoring (Frontend)

Each route is split into ~50 m segments. Every segment is scored on a **0–1 risk scale**:

$$\text{risk}_{\text{segment}} = w_{\text{crime}} \times \text{crimeRisk} + w_{\text{light}} \times \text{lightingRisk} + w_{\text{road}} \times \text{roadRisk} + w_{\text{activity}} \times \text{activityRisk}$$

| Factor | Weight | Source | Description |
|---|---|---|---|
| **Crime** | 30 % | UK Police API | Recent crime incidents within ~50 m, severity-weighted |
| **Lighting** | 22 % | Overpass API | Street lamp density, lamp quality, `lit` tags, time-of-day |
| **Road type** | 15 % | Overpass API | Main roads score safer than footpaths/alleys |
| **Activity** | 13 % | Overpass API | Open shops and cafés nearby (reduces risk) |
| **Bus stops** | 10 % | Overpass API | Transit proximity |
| **Road lit fraction** | 10 % | Overpass API | Fraction of road tagged as lit |

### Route Aggregation

$$\text{risk}_{\text{route}} = \frac{\sum (\text{risk}_i \times \text{length}_i)}{\sum \text{length}_i}$$

$$\text{Safety Score} = (1 - \text{risk}_{\text{route}}) \times 100$$

### Colour Coding

| Colour | Risk Range | Label |
|---|---|---|
| 🟢 Green | < 0.3 | Safer |
| 🟡 Yellow | 0.3 – 0.6 | Caution |
| 🔴 Red | > 0.6 | Higher risk |

---

## 🤖 AI Integration

- **Model**: GPT-4o-mini via OpenAI Chat Completions API
- **Architecture**: Frontend sends route data → backend constructs a structured prompt with concrete safety metrics → calls OpenAI → returns ≤150-word explanation
- **Prompt engineering**: Includes per-route safety scores, crime counts, lit/unlit roads, bus stops, open places, main-road ratios. Instructs the model to reference specific numbers and avoid generic safety tips.
- **Security**: OpenAI API key is **server-side only** — the frontend only sends data to the backend proxy
- **Parameters**: `temperature: 0.3`, `max_tokens: 200`

---

## ⚡ Performance Optimisations

| Technique | Description |
|---|---|
| **Multi-layer caching** | Route cache (5 min TTL), OSM data cache (30 min), crime data cache (24 h), frontend in-memory caches |
| **Request coalescing** | Concurrent identical safe-route requests share a single computation via in-flight promise maps |
| **Combined Overpass query** | Consolidates 4 separate queries (roads, lights, places, transit) into 1 — ~70% latency reduction |
| **Overpass server rotation** | Rotates between 3 Overpass servers with automatic retry on 429/5xx |
| **Fast distance approximation** | Equirectangular approximation (5× faster than Haversine) for <5 km proximity checks |
| **Rate limiting** | Express: 100 req/15 min/IP; Overpass queue; Nominatim 300 ms throttle |
| **Spatial indexing** | Grid-based O(1) lookups instead of O(n×m) brute-force |

---

## 🔌 External APIs & Data Sources

| Service | Purpose | Auth |
|---|---|---|
| [Overpass API](https://overpass-api.de/) | OSM road network, street lights, CCTV, transit stops, open businesses | None |
| [UK Police API](https://data.police.uk/docs/) | Street-level crime data for England & Wales | None |
| [OSRM](https://project-osrm.org/) | Pedestrian walking directions (fallback + alternatives) | None |
| [Nominatim](https://nominatim.openstreetmap.org/) | Place search, autocomplete, reverse geocoding | User-Agent |
| [OpenAI API](https://platform.openai.com/) | GPT-4o-mini for natural-language safety explanations | API key (server-side) |
| [OpenStreetMap Tiles](https://tile.openstreetmap.org/) | Raster map tiles | None |

---

## 🚢 Deployment

### Backend → Render.com

- **Service**: `safenighthome-api`, Node.js runtime
- **Region**: `eu-west` (close to UK users)
- **Plan**: Free tier
- **Health check**: `/api/health`
- **Config**: See `render.yaml`

### Web Frontend → Netlify

- **Build**: `npx expo export --platform web`
- **Publish directory**: `dist/`
- **SPA**: `/* → /index.html` redirect
- **Config**: See `netlify.toml`

### Native Builds

```bash
npx expo run:android    # Android
npx expo run:ios        # iOS (macOS only)
```

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start the Expo development server |
| `npm run web` | Start Expo for web |
| `npm run android` | Build and run on Android |
| `npm run ios` | Build and run on iOS |
| `npm run lint` | Run ESLint |
| `npm run build:web` | Export web build for deployment |

### Backend

| Command | Description |
|---|---|
| `npm start` | Start Express server |
| `npm run dev` | Start with `--watch` (auto-restart on changes) |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React Native 0.81, Expo SDK 54, TypeScript 5.9 |
| **Routing** | Expo Router 6 (file-based) |
| **Maps (iOS)** | `react-native-maps` (Apple MapKit) |
| **Maps (Android/Web)** | Leaflet via `react-native-webview` |
| **Animations** | `react-native-reanimated` 4.1 |
| **Gestures** | `react-native-gesture-handler` 2.28 |
| **Location** | `expo-location` |
| **Storage** | `@react-native-async-storage/async-storage` |
| **Backend** | Express 4.21 (Node.js) |
| **Security** | Helmet, CORS, express-rate-limit, input validation |
| **AI** | OpenAI GPT-4o-mini |
| **Deployment** | Render.com (backend), Netlify (web) |

---

## ⚠️ Disclaimer

> **This app provides safety-related information but does not guarantee your safety.**
> Safety scores are estimates based on publicly available data (crime statistics, street lighting, CCTV locations, road classification) and do not reflect the real-time state of any location. Always stay aware of your surroundings and exercise personal judgment while travelling.

---

## 📄 Data Attribution

- **Crime data** — [data.police.uk](https://data.police.uk/) (Open Government Licence)
- **Map & road data** — © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- **Map tiles** — © OpenStreetMap tile servers

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📝 License

This project was created at **PlymHack 2026**. See the repository for licence details.
