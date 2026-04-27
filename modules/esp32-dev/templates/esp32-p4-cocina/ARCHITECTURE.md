# ESP32-P4 Pantalla Cocina — Arquitectura de Firmware

**Versión:** 1.0.0  
**Board:** ESP32-P4 (10.1" 800×1280 display)  
**Framework:** ESP-IDF (RISC-V, dual-core 400MHz)  
**Modos:** CONFIG (setup) + TRABAJO (kiosko WebView)

---

## Visión General

```
┌─────────────────────────────────────────────┐
│  ESP32-P4 Pantalla Cocina                   │
├─────────────────────────────────────────────┤
│                                             │
│  STARTUP: Botones físicos seleccionan modo  │
│                                             │
│  ┌──────────────────┐  ┌─────────────────┐  │
│  │  MODO CONFIG     │  │  MODO TRABAJO   │  │
│  ├──────────────────┤  ├─────────────────┤  │
│  │ WiFi setup       │  │ WiFi auto       │  │
│  │ MQTT broker      │  │ MQTT auto       │  │
│  │ Server URL       │  │ WebView         │  │
│  │ Teclado virtual  │  │ Touch interactivo│  │
│  │ NVS persistente  │  │ Fullscreen      │  │
│  └──────────────────┘  └─────────────────┘  │
│                              ↓              │
│  ┌──────────────────────────────────────┐   │
│  │  MQTT Broker (VPS)                   │   │
│  ├──────────────────────────────────────┤   │
│  │ pedido.enviado_cocina                │   │
│  │ cocina.item_preparado                │   │
│  │ cocina.pedido_listo                  │   │
│  │ pedido.cancelado                     │   │
│  └──────────────────────────────────────┘   │
│                              ↓              │
│  ┌──────────────────────────────────────┐   │
│  │  WebView (HTML/CSS/JS)               │   │
│  │  Página web: /cocina                 │   │
│  │  - Recibe eventos via postMessage()  │   │
│  │  - Renderiza pantalla interactiva    │   │
│  │  - Envía acciones (prepare-item)     │   │
│  └──────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

---

## MODO CONFIG — WiFi + MQTT Setup

### Flujo de Usuario

```
STARTUP
  ↓
[GPIO_0 presionado 2+ segundos?]
  ├─ SÍ → MODO CONFIG
  └─ NO → MODO TRABAJO

MODO CONFIG:
  1. Pantalla de bienvenida: "CONFIG — Presione OK para continuar"
  2. Scan WiFi networks (5s)
  3. Mostrar lista de redes disponibles:
     [NOMBRE_RED (señal)] ← Usuario toca
  4. Ingresar password (teclado virtual)
  5. Intentar conectar
     Si éxito: ✓ Conectado
     Si fallo: ✗ Reintentar
  6. Opción guardar esta red? SÍ / NO
     - SÍ: Guardar en NVS (max 3 redes)
  7. ¿Otra red? SÍ / NO
     - SÍ: volver al paso 2
     - NO: continuar
  8. Ingresar MQTT Broker (IP:puerto)
     Default: 192.168.1.1:1883
  9. Ingresar Server URL
     Default: http://192.168.1.1:5173
  10. Ingresar Project ID
      Default: peppone
  11. Mostrar resumen:
      Redes: [Red1, Red2, Red3]
      MQTT: 192.168.1.1:1883
      Server: http://192.168.1.1:5173/peppone/cocina
      Brightness: 80%
  12. Botón GUARDAR → guarda en NVS
  13. Botón OK → timeout 10s, esperar a que usuario presione TRABAJO
```

### Almacenamiento NVS

```json
{
  "wifi_networks": [
    { "ssid": "PizzaWiFi", "password": "abc123", "priority": 1 },
    { "ssid": "Backup", "password": "xyz789", "priority": 2 }
  ],
  "mqtt_broker": "192.168.1.1",
  "mqtt_port": 1883,
  "server_url": "http://192.168.1.1:5173",
  "project_id": "peppone",
  "device_name": "Cocina-1",
  "brightness": 80,
  "orientation": "portrait"
}
```

### UI Elements

- **Input TextField**: SSID, Password, IP, URL, Project ID
- **Virtual Keyboard**: Teclado táctil para ingresar passwords
- **Button**: OK, GUARDAR, CANCELAR, SIGUIENTE
- **List**: Seleccionar red WiFi
- **Status Label**: "Conectando...", "Éxito", "Fallo"

---

## MODO TRABAJO — WebView Kiosko

### Flujo de Arranque

```
STARTUP
  ↓
[No CONFIG presionado] → MODO TRABAJO
  ↓
Leer NVS config (WiFi, MQTT, Server URL)
  ↓
Inicializar LVGL (display driver)
  ↓
Mostrar splash screen (logo Pizzicas + "Pantalla de Cocina")
  ↓
Conectar WiFi
  │
  ├─ Intentar red #1 (priority 1)
  │ ├─ Si éxito → Mostrar "✓ WiFi Conectado"
  │ └─ Si fallo → timeout 3s, intentar red #2
  │
  ├─ Intentar red #2
  │ └─ Si fallo → timeout 3s, intentar red #3
  │
  └─ Si todas fallan → Mostrar "✗ Sin WiFi" + reintentar cada 10s
  ↓
Conectar MQTT
  ├─ Conectar a broker en NVS
  ├─ Suscribirse a: pedido.enviado_cocina, cocina.item_preparado, cocina.pedido_listo, pedido.cancelado
  ├─ Si éxito → Mostrar "✓ MQTT Conectado"
  └─ Si fallo → Mostrar "✗ MQTT offline" + reintentar cada 5s
  ↓
Inicializar WebView
  ├─ Cargar HTML/CSS/JS
  ├─ Montar evento bridge MQTT ↔ WebView
  └─ Mostrar página fullscreen
  ↓
ESPERANDO EVENTOS
```

### Flujo de Eventos MQTT → WebView

El MQTT client en C++ **NO** procesa datos de cocina. Solo:
1. Recibe evento MQTT
2. Parsea JSON
3. Envía a WebView via `postMessage()`
4. WebView maneja lógica de UI

```cpp
// En mqtt_client.cpp
void on_mqtt_message(char *topic, uint8_t *payload, uint32_t len) {
  // Ejemplo: topic = "pedido.enviado_cocina"
  // Payload = JSON del pedido
  
  cJSON *json = cJSON_Parse((char *)payload);
  
  // Crear mensaje para WebView
  cJSON *msg = cJSON_CreateObject();
  cJSON_AddStringToObject(msg, "topic", topic);
  cJSON_AddItemToObject(msg, "data", json);
  
  // Enviar a WebView
  char *msg_str = cJSON_Print(msg);
  webview_post_message("mqtt_event", msg_str);
  
  free(msg_str);
  cJSON_Delete(msg);
}
```

### Flujo de Interacción WebView → MQTT

El usuario toca un item en la pantalla para marcarlo como listo. La acción ocurre en el frontend (JavaScript):

```javascript
// En el frontend cocina.ts (dentro de la página web)
async function prepararItem(itemId) {
  // 1. Actualizar UI inmediatamente (optimistic)
  updateItemUI(itemId, 'listo');
  
  // 2. Enviar MQTT request al backend
  try {
    const res = await mqttRequest('cocina', 'prepare-item', { item_id: itemId });
    // Backend responderá con cocina.item_preparado
  } catch (err) {
    // Revert si falla
    updateItemUI(itemId, 'anterior_estado');
  }
}

// mqttRequest() envía el request y espera respuesta via MQTT
// La respuesta llega en el tema complementario (ej: "cocina.response.prepare-item")
```

---

## Comunicación MQTT

### Topics Suscritos (C++ → WebView)

| Topic | Payload | Acción C++ | Acción WebView |
|-------|---------|-----------|----------------|
| `pedido.enviado_cocina` | `{pedido_id, items, ...}` | Parse JSON → postMessage | Mostrar nuevo pedido + sonido |
| `cocina.item_preparado` | `{item_id, estado, ...}` | Parse JSON → postMessage | Actualizar item a "listo" |
| `cocina.pedido_listo` | `{pedido_id, ...}` | Parse JSON → postMessage | Mostrar animación de salida |
| `pedido.cancelado` | `{pedido_id, ...}` | Parse JSON → postMessage | Remover pedido inmediatamente |

### Topics Publicados (WebView → MQTT)

Estos se publican desde el frontend (JavaScript) usando `mqttRequest()`:
- `cocina.prepare-item` → Marcar item individual
- `cocina.mark-ready` → Marcar pedido completo

---

## Gestión de Conexión

### WiFi Reconnect

```cpp
// En wifi_manager.cpp
void wifi_event_handler(void *handler_arg, esp_event_base_t base, int32_t event_id, void *event_data) {
  if (event_id == WIFI_EVENT_STA_DISCONNECTED) {
    // WiFi se desconectó
    // - Mostrar overlay "WiFi offline"
    // - WebView sigue visible (cache local)
    // - Reintentar conexión cada 10s
    retry_count++;
    if (retry_count < 5) {
      esp_wifi_connect(); // Reintentar con red #1
    } else {
      // Probar siguiente red
      wifi_connect_next_network();
    }
  } else if (event_id == WIFI_EVENT_STA_CONNECTED) {
    // WiFi conectado
    // - Remover overlay
    // - Mostrar IP en corner
    display_show_status("WiFi OK");
  }
}
```

### MQTT Reconnect

```cpp
// En mqtt_client.cpp
void mqtt_event_handler(esp_mqtt_event_handle_t event) {
  switch(event->event_id) {
    case MQTT_EVENT_DISCONNECTED:
      // Mostrar indicador offline
      display_show_mqtt_status("OFFLINE");
      // Reintentar cada 5s
      xTimerStart(mqtt_reconnect_timer, 0);
      break;
    
    case MQTT_EVENT_CONNECTED:
      // Suscribirse a topics
      esp_mqtt_client_subscribe(client, "pedido.enviado_cocina", 0);
      esp_mqtt_client_subscribe(client, "cocina.item_preparado", 0);
      // ...
      // Remover indicador
      display_show_mqtt_status("OK");
      break;
    
    case MQTT_EVENT_DATA:
      on_mqtt_message(event->topic, event->data, event->data_len);
      break;
  }
}
```

---

## Watchdog y Estabilidad

```cpp
// main.cpp
void app_main() {
  // Iniciar watchdog (30 segundos)
  esp_task_wdt_init(30, true);
  esp_task_wdt_add(NULL);
  
  // Inicializar componentes
  init_nvs();
  init_display();
  read_config();
  init_wifi();
  init_mqtt();
  init_webview();
  
  // Feed watchdog periodicamente
  while (1) {
    esp_task_wdt_reset();
    vTaskDelay(5000 / portTICK_PERIOD_MS);
    
    // Chequear conexión WiFi/MQTT y reintentrar si necesario
    check_connections();
  }
}
```

---

## OTA Firmware Updates

```cpp
// En main.cpp, handler para OTA
void ota_task() {
  esp_http_client_config_t config = {
    .url = "http://192.168.1.1:5173/firmware/esp32-p4-cocina/latest.bin",
  };
  
  esp_err_t ret = esp_https_ota(&config);
  if (ret == ESP_OK) {
    // Restart
    esp_restart();
  }
}

// Puede ser disparado por:
// 1. Endpoint MQTT especial: cocina.ota_update
// 2. Botón en CONFIG mode
// 3. Automático cada 24h a las 3 AM
```

---

## Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────┐
│                    ESP32-P4                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  NVS     │  │  LVGL    │  │ WebView  │             │
│  │ Storage  │  │  Display │  │ Browser  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│       ↑             ↑              ↑                   │
│       │             │              │                   │
│  ┌────────────────────────────────────┐               │
│  │      Main Control Loop             │               │
│  │  (Mode selection, Button handling) │               │
│  └────────────────────────────────────┘               │
│       ↑             ↑              ↑                   │
│       │             │              │                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │  Config  │  │  WiFi    │  │  MQTT    │             │
│  │  Mode    │  │ Manager  │  │  Client  │             │
│  └──────────┘  └──────────┘  └──────────┘             │
│                      ↑              ↑                   │
│                      │              │                   │
│  ┌───────────────────┴──────────────┘                  │
│  │                                                     │
│  │        Network: WiFi 6 + MQTT                      │
│  │                                                     │
│  └──────────────────┬──────────────────────┬──────────┘
│                     │                      │
│           ┌─────────▼──────┐      ┌────────▼────────┐
│           │  WiFi Networks │      │  MQTT Broker   │
│           │  (Multiple)    │      │  (VPS)         │
│           └────────────────┘      └─────────────────┘
│
└─────────────────────────────────────────────────────────┘
```

---

## Estructura de Carpetas

```
esp32-dev/templates/esp32-p4-cocina/
├── template.json                    ← Metadata (este archivo)
├── platformio-template.ini          ← Configuración PlatformIO
├── ARCHITECTURE.md                  ← Este documento
├── partitions-custom.csv            ← Tabla de particiones
└── src/
    ├── main.cpp                     ← Entry point + mode selection
    ├── config_mode.cpp              ← UI de setup WiFi/MQTT
    ├── trabajo_mode.cpp             ← WebView + MQTT subscribe
    ├── nvstorage.cpp                ← Persistencia de config
    ├── display.cpp                  ← Driver de pantalla (LVGL)
    ├── wifi_manager.cpp             ← WiFi scan + connect + retry
    ├── mqtt_client.cpp              ← MQTT client + event bridge
    ├── webview.cpp                  ← ESP Browser WebView
    ├── ui_config.cpp                ← Componentes UI (teclado, botones)
    └── utils.h                      ← Helpers y definiciones
```

---

## Build & Flash

```bash
# Crear proyecto desde template
mkdir ~/pizzepos-cocina && cd ~/pizzepos-cocina
cp -r ~/2enki/modules/esp32-dev/templates/esp32-p4-cocina/* .

# Compilar
idf.py build

# Flashear vía USB
idf.py flash -p /dev/ttyUSB0

# Monitor serial
idf.py monitor -p /dev/ttyUSB0

# OTA (si está conectado por WiFi)
# idf.py -p 192.168.1.XXX -P cocina123 app-flash
```

---

## Debugging

### Logs Serial

```
I (0) cpu_start: App partition offset 0x00010000
I (25) nvs: Setting up NVS flash...
I (115) display: Initializing LVGL display...
I (200) main: MODE SELECTION — esperando botón CONFIG/TRABAJO...
I (1250) main: CONFIG presionado — entrando CONFIG mode
...
I (5000) wifi: Scanning networks...
I (5500) wifi: Found 5 networks
I (8000) wifi: Connecting to "PizzaWiFi"...
I (9000) wifi: WiFi connected! IP: 192.168.1.100
I (10000) mqtt: Connecting to broker 192.168.1.1:1883...
I (11000) mqtt: MQTT connected
I (12000) mqtt: Subscribed to topics
I (13000) webview: Loading http://192.168.1.1:5173/peppone/cocina
I (15000) webview: Ready — touchscreen active
```

### Monitoreo Online

Existe endpoint en el backend para reportar logs:
```bash
POST /api/firmware-logs
Body: {device_id, logs: [...], timestamp}
```

---

## Testing en Desarrollo

### Opción 1: ESP32-P4 físico
Requiere hardware ($50-80)

### Opción 2: Simulación en PC
```bash
# Usar qemu para emular ESP32-P4
# O simular MQTT/WiFi localmente
# WebView funciona en navegador (Chrome/Firefox con WebSocket MQTT)
```

### Opción 3: Tablet Android
```bash
# Plan B si ESP32-P4 WebView falla
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main \
  -d 'http://192.168.1.1:5173/peppone/cocina' \
  --activity-clear-task
```

---

## Notas y Decisiones

1. **No hay autenticación** — Pantallas de cocina son devices confiables en red local
2. **MQTT transparente** — El firmware solo es un bridge WiFi ↔ WebView
3. **Lógica en frontend** — Cocina states y operaciones están en cocina.ts (frontend)
4. **OTA habilitado** — Firmware updates sin intervención física
5. **Watchdog activo** — Restartar si proceso cuelga
6. **WebView cache** — Si MQTT cae, pantalla sigue visible con datos cacheados

---

## Timeline de Implementación

- **Semana 1**: Boilerplate (main, config_mode, display)
- **Semana 2**: WiFi + MQTT client + NVS storage
- **Semana 3**: WebView + event bridge
- **Semana 4**: Testing en hardware + OTA
- **Semana 5**: Refinamiento y docs

Total: ~80-100 horas de desarrollo
