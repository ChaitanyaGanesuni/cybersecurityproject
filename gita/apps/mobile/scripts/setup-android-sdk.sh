#!/usr/bin/env bash
# One-time Android SDK setup for building the APK on Linux (CI or a cloud container).
# Installs exactly what the generated project needs (see android/build.gradle):
#   platform 35 · build-tools 35.0.0 · NDK 26.1.10909125 · CMake 3.22.1 · platform-tools
# Requires Java 17+ and network access to dl.google.com.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
# Command-line tools build number; update from https://developer.android.com/studio#command-tools
CMDLINE_TOOLS_VERSION="${CMDLINE_TOOLS_VERSION:-13114758}"
ZIP="commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip"

mkdir -p "$ANDROID_HOME/cmdline-tools"
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  echo "Downloading Android command-line tools ($CMDLINE_TOOLS_VERSION)…"
  tmp="$(mktemp -d)"
  curl -fL --retry 3 -o "$tmp/$ZIP" "https://dl.google.com/android/repository/$ZIP"
  unzip -q "$tmp/$ZIP" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf "$tmp"
fi

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null
"$SDKMANAGER" --sdk_root="$ANDROID_HOME" \
  "platform-tools" \
  "platforms;android-35" \
  "build-tools;35.0.0" \
  "ndk;26.1.10909125" \
  "cmake;3.22.1"

echo
echo "Android SDK ready at $ANDROID_HOME"
echo "Add to your shell before building:"
echo "  export ANDROID_HOME=$ANDROID_HOME"
echo "  export PATH=\$ANDROID_HOME/platform-tools:\$PATH"
