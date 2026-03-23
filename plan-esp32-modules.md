# Plan: Módulos ESP32 — esp32-dev + esp32-flasher + UI integrada

## Visión

3 módulos backend + 1 panel frontend que cubren el ciclo completo de desarrollo ESP32:
**Escribir código → Compilar → Grabar → Gestionar OTA**

Los proyectos ya tienen `workspaceType` y `features` — un proyecto tipo "esp32" activa
automáticamente estos módulos y el panel correspondiente.

## Estado actual

- `firmware-manager` ✅ Ya robusto: catálogo, OTA, timeout, métricas, schemas, tests (35/35)
- `device-registry` ✅ Registra dispositivos
- `device-shadow` ✅ Sync desired/reported/delta
- `gateway-manager` ✅ Gateways MQTT
- `device-health` ✅ Monitoring y alertas
- `firmware/print-proxy/` ✅ Firmware ESP32 real (PlatformIO + Arduino) como referencia

## Módulos a crear

### 1. Backend: `modules/esp32-dev/` (tier_3)

Especialista en desarrollo ESP32. Gestiona proyectos de firmware, templates y compilación.

**Responsabilidades:**
- Catálogo de templates por tipo de dispositivo y framework
- Scaffolding de proyectos (genera estructura PlatformIO/ESP-IDF/ESPHome/MicroPython)
- Gestión de board definitions (ESP32, S2, S3, C3, C6)
- Gestión de configuración de proyecto (pines, partitions, NVS, WiFi)
- Compilación delegada (invoca PlatformIO CLI, idf.py, esphome compile)
- Listado de proyectos de firmware del proyecto activo

**Eventos:**
- Publica: `esp32.project_created`, `esp32.build_started`, `esp32.build_completed`, `esp32.build_failed`
- Suscribe: (ninguno — es reactivo via UI handlers)

**UI Handlers:**
- `esp32.list-templates` → plantillas disponibles por framework/tipo
- `esp32.create-project` → scaffolding desde template
- `esp32.list-projects` → proyectos de firmware del proyecto activo
- `esp32.get-project` → detalle de un proyecto de firmware
- `esp32.build` → compilar proyecto (async, reporta progreso)
- `esp32.build-status` → estado de compilación en curso
- `esp32.list-boards` → boards soportados
- `esp32.get-config` → configuración de pines/partitions/NVS

**Almacenamiento:**
```
data/projects/{project_slug}/esp32/
├── projects/
│   └── {firmware_name}/
│       ├── platformio.ini / CMakeLists.txt / esphome.yaml
│       ├── src/
│       ├── include/
│       └── build/            ← output de compilación
├── templates/                ← templates custom del proyecto
└── boards/                   ← board definitions custom
```

**Templates incluidos:**
- `sensor-basic` — Sensor genérico (temp, humedad, etc.) con MQTT
- `actuator-basic` — Relé/motor con MQTT
- `gateway-printer` — Gateway impresora térmica (basado en print-proxy existente)
- `gateway-ble` — Gateway BLE genérico
- `display-oled` — Pantalla OLED/TFT con MQTT
- `esphome-basic` — YAML base ESPHome

**Boards soportados:**
- esp32dev, esp32-s2, esp32-s3, esp32-c3, esp32-c6
- Cada uno con su partition table y pinout defaults

**Config (module.json):**
```json
{
  "data_path": "./data/esp32-dev",
  "platformio_path": "platformio",
  "esphome_path": "esphome",
  "idf_path": null,
  "build_timeout_ms": 300000,
  "max_concurrent_builds": 2
}
```

---

### 2. Backend: `modules/esp32-flasher/` (tier_3)

Graba firmware en dispositivos. Soporta múltiples métodos de flash.

**Responsabilidades:**
- Detección de puertos serie (USB)
- Flash por serial via esptool.py
- Flash via PlatformIO (`pio run -t upload`)
- Flash via ESPHome (`esphome run`)
- Flash via MicroPython (`mpremote`)
- Monitor serial en tiempo real
- Progreso de grabación con eventos

**Eventos:**
- Publica: `flash.started`, `flash.progress`, `flash.completed`, `flash.failed`, `flash.serial_output`
- Suscribe: `esp32.build_completed` → auto-sugerir flash tras compilación exitosa

**UI Handlers:**
- `flash.list-ports` → puertos serie detectados
- `flash.start` → iniciar grabación { port, binary_path, method }
- `flash.status` → estado de flash en curso
- `flash.cancel` → cancelar flash en curso
- `flash.monitor-start` → abrir monitor serial { port, baud }
- `flash.monitor-stop` → cerrar monitor serial
- `flash.esphome-devices` → dispositivos ESPHome descubiertos en red

**Métodos de flash:**
```
method: "esptool"     → esptool.py --port /dev/ttyUSB0 write_flash 0x0 firmware.bin
method: "platformio"  → pio run -t upload --upload-port /dev/ttyUSB0
method: "esphome"     → esphome run config.yaml --device /dev/ttyUSB0
method: "esphome-ota" → esphome run config.yaml --device 192.168.1.x
method: "mpremote"    → mpremote connect /dev/ttyUSB0 cp main.py :
```

**Config:**
```json
{
  "esptool_path": "esptool.py",
  "default_baud": 115200,
  "flash_baud": 460800,
  "monitor_baud": 115200,
  "flash_timeout_ms": 120000,
  "serial_scan_interval_ms": 5000
}
```

---

### 3. Frontend: `src/lib/modules/esp32/` — Panel único

Un solo panel con 3 tabs de servicio (patrón credential-manager):

```
┌─────────────────────────────────────────────────┐
│  📟 Dev    │  ⬆ Firmware   │  ⚡ Flash          │
├─────────────────────────────────────────────────┤
│                                                 │
│  [Sub-tabs según el servicio activo]            │
│                                                 │
│  Dev:      Templates | Proyectos | Build        │
│  Firmware: Catálogo  | OTAs      | Rollback     │
│  Flash:    Puertos   | Grabar    | Monitor      │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Tab "Dev" — Sub-tabs:**
- **Templates**: Grid de templates con icono, nombre, framework, descripción. Click → crear proyecto
- **Proyectos**: Lista de proyectos de firmware. Cada uno muestra: nombre, framework, board, última build
- **Build**: Seleccionar proyecto → compilar. Log de compilación en tiempo real. Estado: idle/building/success/error

**Tab "Firmware" — Sub-tabs:**
- **Catálogo**: Lo que ya tiene FirmwareTab (firmwares registrados por tipo)
- **OTAs**: Pendientes con elapsed/remaining, log reciente
- **Rollback**: Historial por dispositivo, botón rollback

**Tab "Flash" — Sub-tabs:**
- **Puertos**: Puertos serie detectados con auto-refresh. Muestra: puerto, chip, estado
- **Grabar**: Selector de binario (del catálogo o de build/) + puerto + método → flash con progreso
- **Monitor**: Terminal serial embebido. Baud selector. Start/stop. Output coloreado

**manifest.json:**
```json
{
  "id": "esp32",
  "name": "ESP32",
  "version": "1.0.0",
  "zone": "work-bar",
  "order": 2,
  "routes": ["/dispositivos"],
  "icon": "⚡",
  "label": "ESP32"
}
```

---

## Page Context para la IA

Actualizar `+page.svelte` de dispositivos para incluir las tools ESP32:

```
Tools disponibles:
- esp32.list-templates: plantillas de firmware
- esp32.create-project: crear proyecto desde template
- esp32.build: compilar proyecto
- esp32.list-boards: boards soportados
- flash.list-ports: puertos serie disponibles
- flash.start: grabar firmware en dispositivo
- flash.monitor-start: abrir monitor serial
- flash.esphome-devices: dispositivos ESPHome en red
+ todas las tools existentes de devices/shadow/firmware/gateways/health
```

---

## Orden de implementación

1. **esp32-dev backend** — module.json + index.js + schemas + templates
2. **esp32-flasher backend** — module.json + index.js + schemas
3. **ESP32 panel frontend** — manifest + index.ts + ESP32Panel.svelte
4. **Actualizar page context** — añadir tools ESP32 a las instrucciones de la IA
5. **Tests** — tests unitarios para ambos módulos backend
6. **Integración** — verificar flujo completo: template → build → flash → OTA

---

## Dependencias externas (deben estar instaladas en el server)

- `platformio` (PlatformIO CLI) — para Arduino/ESP-IDF
- `esptool.py` — para flash directo
- `esphome` (opcional) — para flujo ESPHome
- `mpremote` (opcional) — para MicroPython
- Acceso a puertos serie (`/dev/ttyUSB*`, `/dev/ttyACM*`)

---

## Notas arquitecturales

- Los 3 módulos son **tier_3** (dependen de módulos tier_2 existentes)
- `esp32-dev` NO depende de `esp32-flasher` ni viceversa — son independientes
- `firmware-manager` sigue siendo el owner del catálogo y OTA
- `esp32-dev` puede registrar binarios en `firmware-manager` tras compilar
- `esp32-flasher` puede consumir binarios de `firmware-manager` o de builds locales
- El panel frontend unifica todo en una sola interfaz
- La IA tiene contexto completo para asistir en cada paso
