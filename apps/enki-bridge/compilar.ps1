# Compila el nucleo Rust para Android y deja las .so donde Gradle las espera.
# Uso (PowerShell, desde apps/enki-bridge):
#   .\compilar.ps1
# Requisitos: rustup, cargo-ndk, Android SDK + NDK r30, JDK 17.
$ErrorActionPreference = "Stop"

Write-Host "== 1/3  targets de Rust =="
rustup target add aarch64-linux-android x86_64-linux-android

Write-Host "== 2/3  cargo ndk =="
# Deja los .so en jniLibs/<abi>/listos para que Gradle los empaquete.
cargo ndk -t arm64-v8a -t x86_64 -o android/app/src/main/jniLibs build --release --target-dir target/android

Write-Host "== 3/3  APK =="
Push-Location android
.\gradlew.bat assembleDebug
Pop-Location

Write-Host ""
Write-Host "APK: android/app/build/outputs/apk/debug/app-debug.apk"
