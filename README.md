# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Environment variables

Create a `.env` (or set EAS env vars) with:

- `EXPO_PUBLIC_OS_MAPS_API_KEY` - required for OS Maps tiles. TODO: Obtain from Ordnance Survey.
- `EXPO_PUBLIC_OS_MAPS_LAYER` - optional (default `Road_3857`).
- `EXPO_PUBLIC_OS_MAPS_BASE_URL` - optional (default `https://api.os.uk/maps/raster/v1/zxy`).
- `EXPO_PUBLIC_OSM_USER_AGENT` - required in production for Nominatim usage. TODO: Set a descriptive value.
- `EXPO_PUBLIC_OSM_EMAIL` - optional (recommended for Nominatim usage).
- `EXPO_PUBLIC_OSM_BASE_URL` - optional (default `https://nominatim.openstreetmap.org`).
- `EXPO_PUBLIC_OSM_TILE_URL` - optional (default `https://tile.openstreetmap.org/{z}/{x}/{y}.png`).
- `EXPO_PUBLIC_OSRM_BASE_URL` - optional (default `https://router.project-osrm.org`).
- `EXPO_PUBLIC_OVERPASS_API_URL` - optional (default `https://overpass-api.de/api/interpreter`).
- `EXPO_PUBLIC_POLICE_API_URL` - optional (default `https://data.police.uk/api`).
- `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` - still required for web map container.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
