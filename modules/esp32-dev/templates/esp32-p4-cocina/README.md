# ESP32-P4 Pantalla Cocina — Firmware WebView Kiosko

Firmware completo para pantalla digital de cocina en tiempo real con dos modos:
- **CONFIG**: Setup WiFi + MQTT
- **TRABAJO**: WebView kiosko con datos en vivo vía MQTT

## Requisitos

### Software
- **ESP-IDF** v5.0 o superior
- **CMake** 3.16+
- **GCC ARM Embedded** toolchain

### Hardware
- ESP32-P4 (Waveshare ESP32-P4-EV recomendado)
- Pantalla capacitiva 10.1" 800×1280 (incluida en algunos boards)
- Cable USB-C para programación

## Instalación del Entorno

### 1. Instalar ESP-IDF

```bash
# Clonar ESP-IDF
git clone -b v5.1 --recursive https://github.com/espressif/esp-idf.git
cd esp-idf

# Instalar herramientas
./install.sh esp32p4

# Activar environment
source export.sh
```

### 2. Compilar el Firmware

```bash
cd modules/esp32-dev/templates/esp32-p4-cocina

# Configurar (usar defaults)
idf.py set-target esp32p4
idf.py menuconfig  # Opcional: revisar opciones

# Compilar
idf.py build
```

### 3. Flashear a ESP32-P4

#### Vía USB-C

```bash
# Detectar puerto serial
ls /dev/ttyUSB*  # Linux/Mac
# o COM* en Windows

# Flashear
idf.py -p /dev/ttyUSB0 flash

# Ver logs
idf.py -p /dev/ttyUSB0 monitor
```

#### Vía WiFi OTA (posterior)

```bash
# Una vez que el firmware está en el device y WiFi conectado:
idf.py -p 192.168.1.XXX --auth=cocina123 app-flash
```

## Uso

### MODO CONFIG

1. Mantén presionado **GPIO_0** durante 2+ segundos al arrancar
2. La pantalla mostrará "CONFIG MODE"
3. Sigue los pasos en pantalla:
   - Selecciona red WiFi (SSID)
   - Ingresa password
   - Ingresa IP del broker MQTT (ej: 192.168.1.1)
   - Ingresa URL del servidor (ej: http://192.168.1.1:5173)
   - Ingresa Project ID (ej: peppone)
4. La configuración se guarda en NVS Flash (persistente)
5. Presiona **GPIO_1** o espera 10 segundos para pasar a MODO TRABAJO

### MODO TRABAJO

1. Inicio normal (sin presionar GPIO_0)
2. El firmware:
   - Lee configuración de NVS
   - Conecta WiFi (reintentos automáticos)
   - Conecta MQTT
   - Abre WebView fullscreen
   - Carga página: `http://[server]/[project]/cocina`
3. Pantalla interactiva: usuario toca items para marcar como listos
4. Eventos MQTT en tiempo real:
   - `pedido.enviado_cocina` → nuevo pedido
   - `cocina.item_preparado` → item listo
   - `cocina.pedido_listo` → pedido completo
   - `pedido.cancelado` → cancelado

## Estructura

```
.
├── src/
│   ├── main.cpp              Entry point + mode selection
│   ├── nvstorage.{h,cpp}     Persistencia NVS
│   ├── display.{h,cpp}       LVGL + pantalla
│   ├── wifi_manager.{h,cpp}  WiFi connect + scan
│   ├── mqtt_client.{h,cpp}   MQTT client + bridge
│   ├── webview.{h,cpp}       WebView browser
│   ├── config_mode.{h,cpp}   UI de setup
│   └── trabajo_mode.{h,cpp}  WebView kiosko
├── CMakeLists.txt            Build config (ESP-IDF)
├── sdkconfig.defaults        SDK defaults
├── platformio-template.ini   Alternative build (PlatformIO)
└── ARCHITECTURE.md           Documento de arquitectura
```

## Troubleshooting

### WebView no carga

- Verifica que el servidor web está disponible en la red
- Revisa logs: `idf.py monitor`
- Prueba con `curl http://[server]/[project]/cocina` desde otra máquina

### MQTT no conecta

- Verifica broker MQTT está disponible: `telnet 192.168.1.1 1883`
- Revisa configuración en CONFIG mode
- Chequea firewall

### WiFi se desconecta constantemente

- Verifica señal WiFi en el área
- Ajusta canal WiFi del router
- Considera usar 2.4 GHz (más rango)

### Pantalla en blanco

- Verifica driver LVGL está compilado
- Chequea display en ARCHITECTURE.md
- Revisa logs para errores de inicialización

## Notas

- **Sin autenticación**: Dispositivos locales, conexión confiable
- **Watchdog**: Reinicia automáticamente si se cuelga (30s timeout)
- **OTA**: Soportado, configurable desde CONFIG mode
- **MQTT Bridge**: Firebase style, sin procesamiento en C++
- **Offline**: WebView funciona con cache si MQTT se cae

## Próximas Mejoras

- [ ] UI táctil más pulida en CONFIG mode
- [ ] Teclado virtual implementado
- [ ] Soporte para múltiples displays
- [ ] Brightness control
- [ ] Deep sleep con wake-on-MQTT
- [ ] Gesture detection en pantalla

## Licencia

MIT - Pizzicas PizzaPOS System

## Soporte

Ver ARCHITECTURE.md para detalles técnicos completos.
