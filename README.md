i# 🌙 Safe Night Home

A cross-platform mobile app that helps pedestrians find **safer walking routes** in London by scoring route alternatives on crime data, street lighting, road type, and nearby open businesses — then explaining the results with an AI-generated summary.

Built with **React Native (Expo)** and **TypeScript**.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Multi-route comparison** | Fetches 3–5 walking route alternatives via OSRM and displays them on an interactive map. |
| **Per-segment safety scoring** | Each route is split into ~50 m segments and scored on crime density, lighting, road type, and open-business activity. |
| **Colour-coded map** | Route segments are rendered green / yellow / red so risk hotspots are visible at a glance. |
| **AI safety explanation** | An OpenAI-powered summary (GPT-4o-mini) explains *why* a route scored the way it did, in plain English. |
| **Place search** | Nominatim-powered autocomplete for origin and destination with reverse-geocoding support. |
| **Pin-drop routing** | Long-press (or tap in pin-mode) to set origin/destination directly on the map. |
| **Turn-by-turn navigation** | In-app walking navigation with live GPS tracking, off-route detection, and step-by-step instructions. |
| **Onboarding & disclaimer** | First-launch safety disclaimer persisted via AsyncStorage. |
| **Cross-platform maps** | Google Maps on web, OpenStreetMap tiles via `react-native-maps` on iOS/Android. |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────┐
│                   Mobile App (Expo)                 │
│                                                    │
│  app/              Expo Router screens             │
│    _layout.tsx     Root layout (SafeAreaProvider)   │
│    index.tsx       Main map + search + bottom sheet │
│    modal.tsx       Generic modal route              │
│                                                    │
│  src/                                              │
│  ├── components/maps/   Platform-specific map views │
│  ├── config/env.ts      Environment variable config │
│  ├── hooks/             React hooks (state + logic) │
│  ├── services/          API clients & scoring logic │
│  ├── types/             TypeScript type definitions  │
│  └── utils/             Polyline, segmentation, etc.│
└─────────────┬──────────────────────────────────────┘
              │
              ▼
  ┌───────────────────────────────────────┐
  │          External APIs                │
  │                                       │
  │  • OSRM (walking directions)          │
  │  • Nominatim (place search)           │
  │  • UK Police API (crime data)         │
  │  • Overpass API (OSM lighting & roads)│
  │  • Google Maps JS SDK (web map)       │
  │  • OpenAI API (AI summaries)          │
  └───────────────────────────────────────┘
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
```

### 2. Configure environment variables

Create a `.env` file in the project root (or set them via EAS):

```env
# ─── Required ───────────────────────────────────────
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=   # Google Maps JS API key (web map)
EXPO_PUBLIC_OPENAI_API_KEY=        # OpenAI API key (AI route explanations)

# ─── Recommended ────────────────────────────────────
EXPO_PUBLIC_OSM_USER_AGENT=        # Descriptive user-agent for Nominatim (required in prod)
EXPO_PUBLIC_OSM_EMAIL=             # Contact email for Nominatim (recommended)

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

### 3. Run the app

```bash
# Start Expo dev server
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
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout
│   ├── index.tsx                 # Main screen (map, search, routes)
│   └── modal.tsx                 # Modal route
├── src/
│   ├── components/maps/          # Map implementations
│   │   ├── RouteMap.tsx          # Platform switch (web ↔ native)
│   │   ├── RouteMap.web.tsx      # Google Maps (web)
│   │   ├── RouteMapNative.tsx    # react-native-maps (iOS/Android)
│   │   ├── RouteMap.fallback.tsx # Fallback when maps unavailable
│   │   └── RouteMap.types.ts    # Shared RouteMapProps type
│   ├── config/
│   │   └── env.ts               # Centralised env-var access
│   ├── hooks/
│   │   ├── useAIExplanation.ts   # Triggers OpenAI route explanation
│   │   ├── useAllRoutesSafety.ts # Parallel safety scoring for all routes
│   │   ├── useAutoPlaceSearch.ts # Debounced Nominatim place search
│   │   ├── useCurrentLocation.ts # GPS location with permission handling
│   │   ├── useDirections.ts      # Fetches OSRM walking directions
│   │   ├── useNavigation.ts      # Turn-by-turn navigation state
│   │   ├── useOnboarding.ts      # Onboarding/disclaimer persistence
│   │   ├── usePlaceAutocomplete.ts # Simpler place autocomplete variant
│   │   ├── useRouteSafety.ts     # Full safety map data for selected route
│   │   └── useSegmentSafety.ts   # Per-segment scoring for a route
│   ├── services/
│   │   ├── googleMaps.ts         # Google Maps REST client (native)
│   │   ├── googleMaps.web.ts     # Google Maps JS SDK client (web)
│   │   ├── location.ts           # expo-location wrapper
│   │   ├── onboarding.ts         # AsyncStorage persistence
│   │   ├── openai.ts             # OpenAI chat completions client
│   │   ├── openStreetMap.ts      # Nominatim + OSRM client
│   │   ├── osMaps.ts             # OS Maps tile URL builder
│   │   ├── routeSegmentEnricher.ts # Spatial-grid segment enrichment
│   │   ├── safety.ts             # Core safety pipeline (crime + OSM)
│   │   ├── safetyMapData.ts      # Map-oriented safety data aggregator
│   │   └── segmentScoring.ts     # Weighted segment risk scoring
│   ├── types/
│   │   ├── errors.ts             # AppError class
│   │   ├── google.ts             # Core domain types (LatLng, Route, etc.)
│   │   ├── googleMapsWeb.ts      # Google Maps JS API type declarations
│   │   ├── osm.ts                # Nominatim & OSRM response types
│   │   └── safety.ts             # Safety analysis pipeline types
│   └── utils/
│       ├── colorCode.ts          # Score → colour/risk-level mapping
│       ├── lightingScore.ts      # Lighting score from OSM tags + time
│       ├── polyline.ts           # Google polyline encode/decode
│       └── segmentRoute.ts       # Route → 50 m segment splitter
├── android/                      # Android native project
├── assets/images/                # Static image assets
├── app.config.js                 # Expo config (API keys, permissions)
├── app.json                      # Expo project metadata
├── package.json                  # Dependencies & scripts
└── tsconfig.json                 # TypeScript configuration
```

---

## 🧮 Safety Scoring Model

Each route is split into **~50 m segments**. Every segment is scored on a **0–1 risk scale** using a weighted formula:

$$\text{risk}_{\text{segment}} = w_{\text{crime}} \times \text{crimeRisk} + w_{\text{light}} \times \text{lightingRisk} + w_{\text{road}} \times \text{roadRisk} + w_{\text{activity}} \times \text{activityRisk}$$

| Factor | Weight | Source | Description |
|---|---|---|---|
| **Crime** | 40 % | UK Police API | Recent crime incidents within ~50 m of the segment |
| **Lighting** | 40 % | Overpass API (OSM) | `lit` tags, road-type heuristics, and time-of-day weighting |
| **Activity** | varies | Google Places / OSM | Open shops and cafés nearby (reduces risk) |
| **Road type** | varies | Overpass API (OSM) | Main roads score safer than footpaths/alleys |

### Segment → Route aggregation

The overall route risk is a **length-weighted average** of all segment risks:

$$\text{risk}_{\text{route}} = \frac{\sum (\text{risk}_i \times \text{length}_i)}{\sum \text{length}_i}$$

$$\text{Safety Score} = (1 - \text{risk}_{\text{route}}) \times 100$$

A score of **100** means no detected risk factors; **0** means every segment flagged high risk. The safest route is auto-selected by default.

### Colour coding

| Colour | Risk range | Label |
|---|---|---|
| 🟢 Green | < 0.3 | Safer |
| 🟡 Yellow | 0.3 – 0.6 | Caution |
| 🔴 Red | > 0.6 | Higher risk |

---

## 🔌 External APIs & Data Sources

| Service | Purpose | Auth |
|---|---|---|
| [OSRM](https://project-osrm.org/) | Pedestrian walking directions (multiple alternatives) | None |
| [Nominatim](https://nominatim.openstreetmap.org/) | Place search, autocomplete, reverse geocoding | User-Agent header |
| [UK Police API](https://data.police.uk/docs/) | Street-level crime data for England & Wales | None |
| [Overpass API](https://overpass-api.de/) | OpenStreetMap road types, street lighting tags | None |
| [Google Maps JS SDK](https://developers.google.com/maps/documentation/javascript) | Interactive web map rendering | API key |
| [OpenAI API](https://platform.openai.com/) | GPT-4o-mini for natural-language safety explanations | API key |
| [OpenStreetMap Tiles](https://tile.openstreetmap.org/) | Raster map tiles for native (iOS/Android) | None |

---

## 📜 Available Scripts

| Command | Description |
|---|---|
| `npm start` | Start the Expo development server |
| `npm run web` | Start Expo for web |
| `npm run android` | Build and run on Android |
| `npm run ios` | Build and run on iOS |
| `npm run lint` | Run ESLint |

---

## ⚠️ Disclaimer

> **This app provides safety-related information but does not guarantee your safety.**
> Safety scores are estimates based on publicly available data (crime statistics, street lighting, road classification) and do not reflect the real-time state of any location. Always stay aware of your surroundings and exercise personal judgment while travelling. Data sources include UK Police open data (OGL), OpenStreetMap (ODbL), and Google Maps.

---

## 📄 Data Attribution

- **Crime data** — [data.police.uk](https://data.police.uk/) (Open Government Licence)
- **Map & road data** — © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL)
- **Map tiles** — © OpenStreetMap tile servers
- **Web map** — © Google Maps

---

## 🛣️ Roadmap

- [ ] User-submitted safety reports (Firebase Firestore backend)
- [ ] Robust OSM lighting integration (direct `lit=*` tag matching per segment)
- [ ] Dynamic weight adjustment by time of day (night vs. day)
- [ ] Turn-by-turn hazard alerts (vibration/voice when approaching a red segment)
- [ ] User accounts & preferences (custom safety weight tuning)
- [ ] Dark mode UI
- [ ] Expand beyond London to other UK cities

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
