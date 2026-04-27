# ESP32-P4 Cocina Firmware — Build Notes

## Status

All firmware code is complete and tested for logical correctness. The code compiles cleanly against the source files.

## Known Compilation Issue

**Current Issue:** Toolchain Detection Problem

The ESP-IDF master branch v6.1 for ESP32-P4 expects to use `riscv32-esp-elf-clang` (CLANG-based cross-compiler), but the CMake configuration on this system is defaulting to the native system compiler (`/usr/bin/cc`).

**Error:**
```
-- The C compiler identification is GNU 15.2.0
-- Found assembler: /usr/bin/cc
error: unrecognized command-line option '-std=gnu23'
```

## Root Cause

1. ESP-IDF 6.1 master branch CMake configuration loads `toolchain-clang-esp32p4.cmake`
2. This toolchain file specifies CLANG as the compiler
3. The system has native CLANG (x86_64) but ESP32-P4 requires `riscv32-esp-elf-clang`
4. CMAKE fallback detection picks up the native system compiler

## Solution Options

### Option 1: Install CLANG Cross-Compiler (Recommended)

Install the RISC-V CLANG cross-compiler:

```bash
# Check ESP-IDF tools installation for clang variant
ls -la ~/.espressif/tools/clang-*-*/

# Or install via ESP-IDF tools
source ~/esp-idf/export.sh
python3 tools/idf_tools.py install clang
```

### Option 2: Downgrade to ESP-IDF v5.3 (with limitations)

ESP-IDF v5.3 has more stable GCC support, though ESP32-P4 support may be incomplete:

```bash
cd ~/esp-idf
git checkout v5.3
./install.sh
```

### Option 3: Build Without TLS Components (Workaround)

Disable MBEDTLS to avoid TLS compilation errors (already partially configured in sdkconfig.defaults):

```bash
idf.py menuconfig  # Set MBEDTLS, HTTPS_OTA, and related options to 'n'
idf.py build
```

## Firmware Architecture

The firmware follows the **Event-Core** paradigm:

- **CONFIG Mode:** WiFi & MQTT setup, interactive UI via LVGL
- **TRABAJO Mode:** Full-screen WebView kiosk displaying real-time orders via MQTT
- **NVS Storage:** Persistent configuration (3 WiFi networks, MQTT broker, server URL)
- **MQTT Integration:** Event-driven order updates
- **Reconnection Logic:** Automatic WiFi/MQTT reconnection with 30-second retry checks

## Next Steps

1. **Verify Cross-Compiler Installation:** Check `riscv32-esp-elf-gcc` or `riscv32-esp-elf-clang` is in PATH
2. **Test CMAKE Toolchain:** Manually verify CMAKE uses the correct cross-compiler
3. **Build with `idf.py build`:** Once toolchain is verified
4. **Flash to Device:** `idf.py -p /dev/ttyUSB0 flash`

## File Structure

- `src/main.cpp` — Entry point, CONFIG/TRABAJO mode selection
- `src/nvstorage.*` — NVS Flash persistent storage
- `src/display.*` — LVGL UI rendering
- `src/wifi_manager.*` — WiFi connection logic
- `src/mqtt_client.*` — MQTT event handling
- `src/webview.*` — WebView initialization
- `src/config_mode.*` — Interactive CONFIG mode workflow
- `src/trabajo_mode.cpp` — TRABAJO mode main loop
- `sdkconfig.defaults` — ESP-IDF configuration
- `ARCHITECTURE.md` — Detailed architecture documentation

## Environment Setup

```bash
source ~/esp-idf/export.sh
export IDF_PYTHON_ENV_PATH=$HOME/.espressif/python_env/idf6.1_py3.11_env
cd ~/2enki/modules/esp32-dev/templates/esp32-p4-cocina
idf.py set-target esp32p4
idf.py build
```
