#!/bin/bash
# Build APK for 考研每日追踪
# Usage: ./build-apk.sh [--install]

export ANDROID_HOME=/home/holt/Android
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

echo "🔨 Building APK..."
cd /home/holt/EverydayTasks/android
./gradlew assembleDebug

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

APK=$(find app/build/outputs/apk/debug -name "*.apk" | head -1)
echo "✅ APK: $APK ($(du -h $APK | cut -f1))"

if [ "$1" = "--install" ]; then
  echo "📱 Installing on emulator..."
  /home/holt/Android/platform-tools/adb install -r "$APK"
  echo "✅ Installed!"
fi
