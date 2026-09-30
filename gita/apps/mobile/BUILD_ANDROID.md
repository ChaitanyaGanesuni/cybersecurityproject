# Building the Android APK

The app is an Expo (SDK 52) project. The native `android/` folder is **generated** by
`expo prebuild` and isn't committed: it's regenerated from `app.json` on every build.

## Option A — local build (Linux/macOS, or a cloud container)

Needs Java 17+ and network access to `dl.google.com` (Android SDK + Google Maven).

```bash
cd gita && npm install
bash apps/mobile/scripts/setup-android-sdk.sh        # one-time; installs SDK 35, NDK, CMake
export ANDROID_HOME=$HOME/android-sdk
npm run build:apk -w @gita/mobile
# → apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

`build:apk` targets **arm64-v8a**, which covers essentially every Android phone from the last
~8 years, and keeps the build fast and the APK small. For very old 32-bit phones, add
`armeabi-v7a` in `package.json` (`-PreactNativeArchitectures=arm64-v8a,armeabi-v7a`).

Install on a phone: copy the APK over and open it (allow "install unknown apps"), or
`adb install app-release.apk`.

## Option B — Expo cloud build (EAS)

No Android SDK needed locally. Needs an Expo account and network access to `expo.dev` /
`api.expo.dev`.

```bash
npm i -g eas-cli && eas login          # or set EXPO_TOKEN
cd gita/apps/mobile && npm run build:apk:eas
```

EAS prints a download link for the APK (profile `preview` in `eas.json`).

## Signing

Release builds are signed with the **debug keystore** so they install for testing. Before
publishing to the Play Store, create an upload keystore and configure release signing (EAS can
manage this for you: profile `production` builds an `.aab`).

## Checks that run without the Android SDK

```bash
npm run bundle:android -w @gita/mobile     # Metro bundles the JS for Android (Hermes bytecode)
npm run prebuild:android -w @gita/mobile   # generates android/ from app.json
```

## Before a real release

- App icon and splash image (currently solid-color placeholders).
- Point `expo.extra.aiBackendUrl` at the deployed `@gita/api` for live AI answers. Without it,
  the app uses its offline grounded fallback.
