# Cocina P4 — pantalla de cocina de Enki (ESP32-P4, 10.1")

Firmware ESP-IDF para una pantalla de cocina que se registra como dispositivo del
módulo **cocina** de Enki por MQTT y muestra los pedidos activos en tiempo real.

- **Placa**: Waveshare **ESP32-P4-WIFI6-Touch-LCD-10.1**
  (familia `ESP32-P4-WIFI6-Touch-LCD-X`: 7", 8" y 10.1").
- **Pantalla**: 10.1" **800x1280**, 32 MB PSRAM, táctil capacitivo I2C.
- **Radio**: WiFi 6 / BLE por coprocesador **ESP32-C6** con `esp_hosted` (SDIO).
- **Stack**: ESP-IDF **v5.5**, LVGL 9, `esp-mqtt` (TLS), cJSON, BSP oficial de Waveshare.

## Correcciones respecto al brief original

Tres cosas del encargo inicial no coincidían con el hardware real y se han corregido
contra las fuentes oficiales (no se ha inventado ningún pin):

| Brief decía | Realidad (verificado) | Qué se hizo |
|---|---|---|
| Panel **RGB** 800x1280 con pines PCLK/DE/HSYNC/VSYNC/DATA0..15 | El panel de 10" es un **JD9365 por MIPI-DSI** (2 lanes, 1500 Mbps/lane) | Se eliminaron todos los `#define` de pines RGB: no existen. El panel lo inicializa el BSP por DSI. |
| Init de display/táctil a mano | El repo de Waveshare trae **BSP reutilizable** (`waveshare/esp32_p4_wifi6_touch_lcd_x` v2.0.3, publicado en el Component Registry) | `main/idf_component.yml` depende del BSP; `main.c` usa `bsp_display_start_with_config()`. No se escribe ningún init de panel/táctil a mano. |
| "No se conocen los GPIO" | Pinout documentado en el header del BSP | `main/config.h` lleva los valores **reales**, citando fichero de origen, y `main.c` los blinda con `_Static_assert` contra el BSP. |

Fuentes usadas:

- Docs: <https://docs.waveshare.com/ESP32-P4-WIFI6-Touch-LCD-X>
- Guía ESP-IDF: <https://docs.waveshare.com/ESP32-P4-WIFI6-Touch-LCD-X/ESP-IDF>
- Recursos: <https://docs.waveshare.com/ESP32-P4-WIFI6-Touch-LCD-X/Resources-And-Documents>
- Ejemplos: <https://github.com/waveshareteam/ESP32-P4-WIFI6-Touch-LCD-X>
  (`examples/esp-idf/08_lvgl_demo_v9`, `04_wifistation`, `config/display-variants.json`)
- BSP: <https://components.espressif.com/components/waveshare/esp32_p4_wifi6_touch_lcd_x>

## Pinout (real, del BSP v2.0.3)

Fuente: `include/bsp/esp32_p4_wifi6_touch_lcd_x.h` del componente
`waveshare/esp32_p4_wifi6_touch_lcd_x` v2.0.3. Están replicados en `main/config.h`
y comprobados en compilación (`_Static_assert` en `main.c`).

| Función | GPIO | Macro del BSP | Macro en `config.h` |
|---|---|---|---|
| I2C SDA (táctil GT911 + codec) | 7 | `BSP_I2C_SDA` | `COCINA_I2C_SDA_GPIO` |
| I2C SCL | 8 | `BSP_I2C_SCL` | `COCINA_I2C_SCL_GPIO` |
| Retroiluminación (PWM LEDC) | 26 | `BSP_LCD_BACKLIGHT` | `COCINA_LCD_BL_GPIO` |
| Reset del panel | 27 | `BSP_LCD_RST` | `COCINA_LCD_RST_GPIO` |
| Reset del táctil | NC (-1) | `BSP_LCD_TOUCH_RST` | `COCINA_TOUCH_RST_GPIO` |
| Interrupción del táctil | NC (-1) | `BSP_LCD_TOUCH_INT` | `COCINA_TOUCH_INT_GPIO` |
| Datos de vídeo | **no hay** (MIPI-DSI) | — | — |

Táctil: **GT911** en I2C (0x5D; el BSP además prueba el alias 0x14). El bus y el
dispositivo los crea el BSP (`bsp_i2c_init()` dentro de `bsp_display_start_*`).

**No queda ningún pin "AJUSTAR A TU PLACA"**: todo sale del BSP. Si tu revisión de
placa cambia algo, el `_Static_assert` de `main.c` lo detecta en compilación.
Los únicos valores ajustables a mano son los flags del táctil
(`COCINA_TOUCH_SWAP_XY` / `MIRROR_X` / `MIRROR_Y`, por defecto `false` como en el
ejemplo oficial) por si el panel va montado girado.

## Estructura

```
hardware/cocina-p4/
├── CMakeLists.txt          proyecto ESP-IDF
├── sdkconfig.defaults      PSRAM octal, BSP 10.1", LVGL 9, MQTT+TLS, 32 MB flash
├── partitions.csv          factory 8M + storage 7M (sin OTA)
└── main/
    ├── CMakeLists.txt
    ├── idf_component.yml   BSP Waveshare + LVGL 9 + esp_hosted/esp_wifi_remote
    ├── Kconfig.projbuild   menuconfig -> "Cocina P4" (WiFi, broker, topics, identidad)
    ├── config.h            pines reales + valores por defecto
    ├── main.c              arranque: NVS, TWDT, BSP display, WiFi, SNTP, MQTT, task UI
    ├── ui.c / ui.h         UI LVGL 9 (barra de estado + tarjetas + parpadeo + táctil)
    └── mqtt_enki.c / .h    cliente MQTT: envelope, suscripción, registro, prepare-item
```

## Requisitos

- **ESP-IDF v5.5.x** (`idf.py`): <https://docs.espressif.com/projects/esp-idf/en/v5.5/>
- Cable USB-C conectado al puerto **USB** de la placa (el ESP32-P4 se flashea por el
  periférico USB nativo, suele aparecer como `/dev/ttyACM0`).
- Red para que el *component manager* descargue el BSP y LVGL la primera vez.
- **No hace falta** tener a mano el repo de Waveshare: el BSP viene del registry.

## Compilar y flashear

```bash
# 1. Entorno ESP-IDF (una vez por shell)
. $HOME/esp/esp-idf/export.sh

cd hardware/cocina-p4

# 2. Target
idf.py set-target esp32p4

# 3. Configurar (WiFi + broker + identidad)
idf.py menuconfig
#   -> "Cocina P4" -> WiFi SSID / password
#   -> "Cocina P4" -> MQTT broker URI  (wss://enki-ai.online/mqtt  o  mqtt://IP:1883)
#   -> "Cocina P4" -> device_id (vacío = cocina-p4-<mac>)
#   -> "Board Support Package(ESP32-P4)" -> LCD type = "Waveshare ESP32-P4-WIFI6-Touch-LCD-10.1"

# 4. Build
idf.py build

# 5. Flashear y ver el log
idf.py -p /dev/ttyACM0 flash monitor
```

Notas de build:

- `sdkconfig.defaults` ya fija `CONFIG_BSP_LCD_TYPE_800_1280_10_1_INCH=y`,
  RGB565, 3 framebuffers, 32 MB de flash, PSRAM a 200 MHz y XIP desde PSRAM.
- Si el panel sale **girado o espejado**, cambia `rotation` en `main.c`
  (`ESP_LV_ADAPTER_ROTATE_90`) o los flags del táctil en `config.h`.
- Si el `idf.py build` avisa de símbolos `CONFIG_...` desconocidos, es que tu
  versión del BSP/LVGL renombró alguna opción: se ignora sin romper el build.

## Contrato MQTT

Broker configurable (`wss://enki-ai.online/mqtt` por 443 con TLS, o `mqtt://IP:1883`
en LAN). `wss://` usa el bundle de CAs de mbedTLS (Let's Encrypt incluido); el
usuario/contraseña son opcionales.

| Dirección | Topic | QoS | Payload |
|---|---|---|---|
| SUSCRIBE | `core/+/events/periferico/display` | 1 | evento `periferico.display` |
| PUBLICA | `core/core-a/events/cocina/register-device-request` | 1 | `{"device_id","nombre","estacion","tipo_estacion"}` |
| PUBLICA | `core/core-a/events/cocina/prepare-item-request` | 1 | `{"item_id","device_id","done":true}` |

Envelope de publicación:

```json
{"request_id":"<uuid>","source":{"core_id":"external","module_id":"cocina-p4"},"data":{...}}
```

Evento recibido (`periferico.display`):

```json
{"destino":"<device_id>","data":{"accion":"...","modulo":"cocina","contenido":<libre>,"pedidos_activos":N},"prioridad":2}
```

Comportamiento implementado:

- **Filtro por destino**: si `destino` existe y no es nuestro `device_id`, el evento
  se ignora (varias pantallas pueden compartir el topic comodín). Si `destino` no
  viene, se acepta.
- `data.modulo` distinto de `"cocina"` ⇒ se ignora.
- `pedidos_activos` actualiza el contador grande de la barra.
- `accion` con `elimin`/`cancel`/`quitar`/`borr` ⇒ se retira la tarjeta.
- `accion` `limpiar`/`sin_pedidos`/`vacio` ⇒ se vacía la lista.
- `accion == "pedido_listo"` **o** `prioridad == 2` ⇒ la tarjeta parpadea.
- `contenido` admite tres formas:
  - **array** de objetos ⇒ snapshot completo (reemplaza la lista);
  - **objeto** con `item_id`/`id`, `mesa`/`identificador`, `texto`/`platos`/`descripcion`,
    opcionalmente `prioridad` y `cantidad`;
  - **string/número** ⇒ se pinta como texto; el `item_id` se deriva del texto
    (`auto-<hash>`), de forma que dos eventos del mismo pedido actualizan la misma tarjeta.
- Payload troceado por el broker ⇒ se reensambla por `data_offset` antes de parsear.

`device_id`: se toma de `menuconfig`; si está vacío se deriva de la MAC:
`cocina-p4-aabbccddeeff`.

## UI (LVGL 9)

Pantalla vertical 800x1280, fondo oscuro:

- **Barra superior** (108 px): nombre de estación · icono WiFi (verde/ámbar si RSSI
  < -75 dBm) · etiqueta MQTT · hora (SNTP, `--:--` hasta sincronizar) · contador
  grande de pedidos activos.
- **Zona central**: lista vertical scrolleable, una tarjeta por pedido, con
  identificador/mesa y el contenido en **32 px** (legible de pie).
- **Prioridad**: 2 (urgente) ⇒ fondo rojo y borde parpadeante cada **600 ms**
  (animación LVGL infinita); 3 ⇒ ámbar; resto ⇒ azul grisáceo.
- **Táctil**: tocar una tarjeta la marca como HECHA (verde, atenuada), publica
  `prepare-item-request` con `done:true` y la tarjeta desaparece tras **1 s**.
- **Sin pedidos**: la lista muestra "Sin pedidos" y la hora sigue refrescándose.
- Todo el texto está en español.

## Robustez

- **WiFi**: reintento indefinido con backoff exponencial 1→32 s (`esp_timer`, no
  bloquea el event loop), `WIFI_PS_NONE` para bajar latencia.
- **SNTP** (`pool.ntp.org` + TZ `CET-1CEST,...`): la hora aparece al sincronizar.
- **MQTT**: auto-reconexión de `esp-mqtt` (timeout 3 s) **+ re-suscripción y
  re-publicación de `register-device`** en cada `MQTT_EVENT_CONNECTED`.
- **Watchdog propio** (`esp_timer` cada 15 s): si el cliente lleva rato caído sin
  evento `DISCONNECTED`, fuerza `esp_mqtt_client_reconnect()`; si está conectado
  pero sin registrar, reenvía `register-device`.
- **Task watchdog** (`esp_task_wdt`, 15 s, panic) con `ui_task` suscrita y
  `esp_task_wdt_reset()` en cada vuelta del bucle.
- **Orden de arranque**: primero pantalla y UI, después red. Sin WiFi la pantalla
  sigue viva con un banner ("Sin WiFi - reintentando..." / "Configura WiFi en
  menuconfig > Cocina P4").
- Si el MQTT no está accesible, la lista conserva los últimos pedidos y el banner
  avisa; no se bloquea nada.
- Log por `ESP_LOGI`/`ESP_LOGW`/`ESP_LOGE` con tags `cocina-p4`, `cocina-ui`,
  `cocina-mqtt`.

## Verificación (leer antes de dar por bueno el firmware)

**NO se ha probado en hardware**: en el entorno donde se escribió este código no hay
placa, ni ESP-IDF instalado, ni toolchain RISC-V, así que no se ha podido compilar
con `idf.py` ni flashear. Lo que **sí** se verificó:

1. **Compilación estática** de `main.c`, `ui.c` y `mqtt_enki.c` con
   `gcc -fsyntax-only -std=gnu17 -Wall -Wextra` contra cabeceras stub de las APIs
   de ESP-IDF/LVGL/BSP usadas: 0 errores y 0 warnings.
2. **Simulación funcional** del módulo MQTT (`mqtt_enki.c` real) en nativo con un
   cJSON mínimo y stubs de UI/MQTT: 40+ aserciones cubriendo registro, envelope,
   filtro por `destino`, filtro por `modulo`, contador, `prioridad 2`,
   `pedido_listo`, snapshot en array, borrado, `limpiar`, payload troceado,
   `prepare-item`, JSON inválido, evento sin contenido y re-registro al reconectar.
   Todas en verde.
3. **Pinout**: valores copiados del BSP oficial v2.0.3 y blindados con
   `_Static_assert`.

Por tanto, lo primero al enchufar la placa es:

```bash
idf.py build          # aquí saldrán los errores reales si la versión del BSP difiere
idf.py -p /dev/ttyACM0 flash monitor
```

Riesgos conocidos a vigilar en el primer arranque real:

- La API del BSP (`bsp_display_start_with_config`, `ESP_LV_ADAPTER_*`) es la de
  **v2.x**; con v1.x no compila (por eso el `^2.0.3` está fijado).
- `esp_hosted` 1.4.x + `esp_wifi_remote` 0.14.x deben casar con el firmware del
  ESP32-C6 que trae la placa. Si el WiFi no levanta (`ESP_ERR_TIMEOUT` del hosted),
  es lo primero a revisar (versiones en `main/idf_component.yml`, alineadas con
  `examples/esp-idf/04_wifistation` del repo Waveshare).
- Los timings del panel y la secuencia de init del JD9365 son los del BSP; no se
  han tocado. Si la imagen sale con tearing, subir
  `CONFIG_BSP_LCD_DPI_BUFFER_NUMS` (ya está en 3) o ajustar `tear_avoid_mode`.
- El brillo inicial es 100 % (`COCINA_BL_DUTY_PCT`).

## Prueba rápida del contrato (sin la placa)

Con `mosquitto_sub/pub` contra el broker:

```bash
# Ver lo que publica la pantalla
mosquitto_sub -h enki-ai.online -p 1883 -t 'core/core-a/events/cocina/#' -v

# Simular un evento para la pantalla (sustituye el device_id real)
mosquitto_pub -h enki-ai.online -p 1883 \
  -t 'core/core-a/events/periferico/display' \
  -m '{"destino":"cocina-p4-aabbccddeeff","prioridad":2,
       "data":{"accion":"pedido_nuevo","modulo":"cocina",
               "contenido":{"item_id":"it-1","mesa":"MESA 4","texto":"2x Pizza Barbacoa"},
               "pedidos_activos":3}}'
```

Al tocar la tarjeta debe aparecer en el topic de `prepare-item-request`:
`{"request_id":"...","source":{"core_id":"external","module_id":"cocina-p4"},
"data":{"item_id":"it-1","device_id":"cocina-p4-...","done":true}}`.
