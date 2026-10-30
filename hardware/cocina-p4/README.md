# Cocina P4 — pantalla de cocina de Enki (GUITION JC8012P4A1C, 10.1")

Firmware ESP-IDF para una pantalla de cocina que se registra como dispositivo del
módulo **cocina** de Enki por MQTT y muestra los pedidos activos en tiempo real.

- **Placa**: **GUITION JC8012P4A1C** (a.k.a. `JC8012P4A1`) — etiqueta *SKU 10153001*,
  "P4-10.1 inch Capacitive touch".
- **Pantalla**: 10.1" **800x1280**, panel **JD9365** por **MIPI-DSI** (2 lanes).
- **Táctil**: capacitivo por **I2C** (GT911 en este firmware; ver aviso abajo).
- **Radio**: WiFi 6 / BLE por coprocesador **ESP32-C6** con `esp_hosted` (SDIO).
- **Flash**: 16 MB (según `device.yaml` de la placa) · **PSRAM** a 200 MHz.
- **Stack**: ESP-IDF **v5.4–5.5**, LVGL 9, `esp-mqtt` (TLS), cJSON.
- **Sin BSP**: no existe BSP publicado para esta placa. El panel, el táctil, el
  brillo y el puente a LVGL se inicializan en `main.c` con componentes oficiales
  del Component Registry.

## Diferencias con la Waveshare

Este firmware nació apuntando a la **Waveshare ESP32-P4-WIFI6-Touch-LCD-10.1** y se
ha reapuntado a la GUITION. Lo que cambia y lo que no:

| | Waveshare 10.1" | GUITION JC8012P4A1C |
|---|---|---|
| Controlador de panel | **JD9365**, MIPI-DSI | **JD9365**, MIPI-DSI (**el mismo**) |
| Resolución | 800x1280 | 800x1280 (el mismo) |
| **Pines** | GPIO 7/8 I2C, BL **26**, RST 27, táctil sin RST/INT | GPIO 7/8 I2C, BL **23**, RST 27, táctil RST **22**, INT **21** |
| Inicialización | BSP `waveshare/esp32_p4_wifi6_touch_lcd_x` v2.0.3 (`bsp_display_start_with_config`) | **init propio**: `esp_lcd_jd9365` + `esp_lcd_touch_gt911` + `esp_lvgl_port` |
| Puente LVGL | `esp_lv_adapter` del BSP | `esp_lvgl_port` (oficial) |
| Brillo | `bsp_display_brightness_set()` | LEDC propio en GPIO23 |
| Flash | 32 MB | 16 MB |
| Táctil (según la config pública de la placa) | GT911 | **GT911 o GSL3680** según revisión (ver abajo) |

O sea: **el panel es el mismo, la placa y los pines no**. Por eso el cambio no es
"otro driver de panel" sino "quitar el BSP y cablear a mano lo que el BSP hacía".

## Hardware y pinout

**Fuente única** (no se ha inventado ningún pin): la config ESPHome pública de la
propia placa, `jtenniswood/esphome-lvgl`, carpeta `guition-esp32-p4-jc8012p4a1`,
fichero `device/device.yaml`:

<https://raw.githubusercontent.com/jtenniswood/esphome-lvgl/main/guition-esp32-p4-jc8012p4a1/device/device.yaml>

| Función | GPIO | Origen en `device.yaml` | Macro en `config.h` |
|---|---|---|---|
| I2C SDA (táctil) | **7** | `i2c: sda: GPIO7` | `COCINA_I2C_SDA_GPIO` |
| I2C SCL | **8** | `i2c: scl: GPIO8` (sin pullups internos) | `COCINA_I2C_SCL_GPIO` |
| Frecuencia I2C | 400 kHz | `frequency: 400kHz` | `COCINA_I2C_FREQ_HZ` |
| Reset del panel | **27** | `display: reset_pin: GPIO27` | `COCINA_LCD_RST_GPIO` |
| Retroiluminación (LEDC) | **23** | `output: platform: ledc, pin: GPIO23` | `COCINA_LCD_BL_GPIO` |
| Reset del táctil | **22** | `touchscreen: reset_pin: GPIO22` | `COCINA_TOUCH_RST_GPIO` |
| Interrupción del táctil | **21** | `touchscreen: interrupt_pin: GPIO21` | `COCINA_TOUCH_INT_GPIO` |
| Orientación del táctil | — | `transform: swap_xy false, mirror_x false, mirror_y true` | `COCINA_TOUCH_SWAP_XY/MIRROR_*` |
| LDO del PHY MIPI-DSI | canal 3, 2.5 V | `esp_ldo: channel: 3, voltage: 2.5V` | `COCINA_LDO_CHAN` / `COCINA_LDO_MV` |
| Datos de vídeo | **no hay** (MIPI-DSI) | `display: model: JC8012P4A1` | — |
| Enlace P4 ↔ C6 (SDIO) | 54/19/18/14/15/16/17 | bloque `esp32_hosted` | documentado en `config.h`, lo configura `esp_hosted` |

Notas:

- `device.yaml` trae además un bloque SPI con GPIO 54/19/18/14-17. **No es del
  panel**: son los pines del bus SDIO que une el P4 con el ESP32-C6. Coinciden con
  el slot por defecto de `esp_hosted`, por eso la app no los toca y se dejan
  documentados en `config.h`.
- El brillo va por **LEDC** (timer 1, canal 1, 5 kHz, 10 bits) sobre GPIO23, igual
  que en la config de referencia (`output: platform: ledc`).

### Táctil: GT911 o GSL3680 (léelo si el táctil no responde)

La config de referencia monta, sobre ese mismo bus I2C 7/8, el componente externo
**`gsl3680`** (`github://kvj/esphome@jd9365_gsl3680`), no GT911. Es decir: el
**pinout está confirmado**, pero el controlador táctil de esa unidad concreta es un
**GSL3680**. Este firmware usa **GT911**, que es lo que declara la etiqueta del SKU
10153001 y lo que hay en el Component Registry de Espressif.

Consecuencia práctica: si el táctil no responde, el firmware **no se cae** — la
pantalla arranca igual y muestra el banner *"Táctil no detectado - revisa
GT911/GSL3680"*. Para salir de dudas, un scan I2C distingue los dos:

| Controlador | Dirección I2C |
|---|---|
| GT911 | `0x5D` (INT bajo al arrancar) o `0x14` (INT alto) |
| GSL3680 | `0x40` |

Si sale `0x40`, hay que añadir el driver GSL3680 (no existe en el registry de
Espressif; habría que portar el de la config ESPHome). No se ha inventado: está
documentado aquí y en el comentario de `config.h`.

## Estructura

```
hardware/cocina-p4/
├── CMakeLists.txt          proyecto ESP-IDF
├── sdkconfig.defaults      PSRAM octal, LVGL 9, MQTT+TLS, 16 MB flash (sin nada del BSP)
├── partitions.csv          factory 8M + storage 7M (sin OTA, cabe en 16 MB)
└── main/
    ├── CMakeLists.txt
    ├── idf_component.yml   esp_lcd_jd9365 + esp_lcd_touch_gt911 + esp_lvgl_port + LVGL 9 + esp_hosted
    ├── Kconfig.projbuild   menuconfig -> "Cocina P4" (WiFi, broker, topics, identidad)
    ├── config.h            pines de la Guition (con fuente) + valores por defecto
    ├── main.c              arranque: NVS, TWDT, LDO+DSI+JD9365, GT911, LVGL, LEDC, WiFi, SNTP, MQTT, task UI
    ├── ui.c / ui.h         UI LVGL 9 (barra de estado + tarjetas + parpadeo + táctil)
    └── mqtt_enki.c / .h    cliente MQTT: envelope, suscripción, registro, prepare-item
```

## Dependencias (verificadas en el Component Registry)

Consultadas en `components.espressif.com` el 2026-10-30; las APIs se han comprobado
**descargando los componentes y leyendo sus cabeceras reales**, no la documentación.

| Componente | Versión usada | Para qué |
|---|---|---|
| `espressif/esp_lcd_jd9365` | `^2.0.2` (última 2.0.2) | panel JD9365 por MIPI-DSI: `esp_lcd_new_panel_jd9365()`, `JD9365_PANEL_BUS_DSI_2CH_CONFIG()`, `JD9365_PANEL_IO_DBI_CONFIG()`, `JD9365_800_1280_PANEL_60HZ_DPI_CONFIG()` |
| `espressif/esp_lcd_touch` | `^1.2.1` | capa común de táctil (`esp_lcd_touch_config_t`, `esp_lcd_new_panel_io_i2c`) |
| `espressif/esp_lcd_touch_gt911` | `^1.2.1` | `esp_lcd_touch_new_i2c_gt911()` |
| `espressif/esp_lvgl_port` | `^2.9.0` | puente LVGL 9 ↔ esp_lcd: `lvgl_port_init()`, `lvgl_port_add_disp_dsi()`, `lvgl_port_add_touch()`, `lvgl_port_lock()` |
| `lvgl/lvgl` | `^9.2.0` | LVGL 9 (la UI usa API v9) |
| `espressif/esp_hosted` | `1.4.7` | WiFi 6/BLE del C6 por SDIO |
| `espressif/esp_wifi_remote` | `0.14.5` | API `esp_wifi` remota sobre esp_hosted |

`idf: ">=5.4,<6.0"`: el driver del JD9365 exige ≥5.4 y su macro de timing solo
existe por debajo de IDF 6.

**Fuera**: `waveshare/esp32_p4_wifi6_touch_lcd_x` y su `esp_lvgl_adapter` (eran el
BSP de la otra placa). Ya no se usa ninguna API `bsp_*` ni `ESP_LV_ADAPTER_*`.

## Requisitos

- **ESP-IDF v5.4 o v5.5** (`idf.py`): <https://docs.espressif.com/projects/esp-idf/en/v5.5/>
- Cable USB-C al puerto **USB** de la placa (el P4 se flashea por su USB nativo,
  suele aparecer como `/dev/ttyACM0`).
- Red la primera vez, para que el *component manager* descargue los componentes.

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
#   (ya no hay "Board Support Package" que elegir: no hay BSP)

# 4. Build
idf.py build

# 5. Flashear y ver el log
idf.py -p /dev/ttyACM0 flash monitor
```

Notas de build:

- `sdkconfig.defaults` fija 16 MB de flash, PSRAM a 200 MHz, XIP desde PSRAM,
  RGB565, 1 punto de contacto y las fuentes Montserrat que usa la UI.
- **Colores invertidos o rosa/azul**: cambiar `.swap_bytes` a `true` en
  `lvgl_port_display_cfg_t` (`main.c`). Es el ajuste típico de RGB565 por DSI.
- **Imagen espejada o girada**: el panel va en vertical 800x1280 sin rotación; si
  la unidad sale girada, se toca `.rotation` en `main.c`. La orientación del
  **táctil** es independiente y va en `config.h` (`COCINA_TOUCH_MIRROR_Y` = `true`,
  como en `device.yaml`).
- **Pantalla en negro pero el log avanza**: casi siempre es el LDO del PHY
  (`COCINA_LDO_CHAN`/`COCINA_LDO_MV`) o el reset del panel (GPIO27).

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

La UI es agnóstica de placa: todo lo suyo es LVGL puro, y el lock lo toma de
`lvgl_port_lock()/unlock()` (`esp_lvgl_port`). Es el único cambio que se hizo en
`ui.c` al quitar el BSP (3 líneas: include + las dos funciones del lock).

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
- **El táctil no es bloqueante**: si el GT911 no aparece, se registra el error, la
  UI arranca igual y el banner lo dice.
- Si el MQTT no está accesible, la lista conserva los últimos pedidos y el banner
  avisa; no se bloquea nada.
- Log por `ESP_LOGI`/`ESP_LOGW`/`ESP_LOGE` con tags `cocina-p4`, `cocina-ui`,
  `cocina-mqtt`.

## Blindaje del pinout (los 6 `_Static_assert`)

Antes había 6 `_Static_assert` que comparaban `config.h` con las macros del BSP
(`BSP_I2C_SDA`, `BSP_LCD_RST`...). **Al quitar el BSP desaparece ese contraste**:
no hay nada externo contra lo que blindar los pines.

Decisión: se mantienen **6 asserts**, mismo número y mismo propósito, pero ahora
comprueban la **coherencia entre los defines y lo que exigen los drivers**, que es
de donde vienen los fallos silenciosos:

1. `COCINA_LCD_MIPI_LANES == 2` — el macro del driver fija 2 lanes.
2. `COCINA_LCD_BPP == 16` — la UI y el buffer son RGB565.
3. La dirección del táctil es una de las dos válidas del GT911 (`0x5D`/`0x14`).
4. `COCINA_I2C_FREQ_HZ` dentro del máximo del GT911 (400 kHz).
5. Resolución LEDC y duty del brillo coherentes (10 bits, 0-100 %).
6. Ningún GPIO repetido entre panel, táctil y retroiluminación + buffer LVGL que
   cabe en la pantalla.

Lo que **no** se puede comprobar en compilación es el timing del panel: los macros
`JD9365_..._CONFIG()` son inicializadores con llaves y no son inspeccionables desde
un `_Static_assert`. Por eso hay un **chequeo en runtime** al principio de
`panel_init()`: si el `h_size`/`v_size`/`num_data_lanes` del driver no coinciden con
`config.h`, se aborta con `ESP_ERR_INVALID_SIZE` y un log claro, antes de tocar el
panel.

## Verificación (leer antes de dar por bueno el firmware)

**NO se ha probado en hardware**: en el entorno donde se escribió esto no hay placa,
ni ESP-IDF instalado, ni toolchain RISC-V. **No se ha podido ejecutar `idf.py build`
ni flashear.** Lo que **sí** se verificó:

1. **APIs reales, no de memoria**: se descargaron del Component Registry los `.zip`
   de `esp_lcd_jd9365` 2.0.2, `esp_lcd_touch` 1.2.1, `esp_lcd_touch_gt911` 1.2.1 y
   `esp_lvgl_port` 2.9.0, y el código se escribió **contra esas cabeceras**. De ahí
   salió, por ejemplo, que en 2.0.2 `lane_num` va **dentro de** `mipi_config` y que
   ya **no** existe `flags.use_mipi_interface` (el README del componente está
   desactualizado en ese punto).
2. **Compilación estática** de `main.c`, `ui.c` y `mqtt_enki.c` con
   `gcc -fsyntax-only -std=gnu17 -Wall -Wextra`: **0 errores, 0 warnings**, usando
   las cabeceras **reales** de los cuatro componentes + stubs de las cabeceras del
   core de IDF (i2c_master, ledc, gpio, ldo, mipi_dsi, esp_lcd_*).
3. **Simulación funcional** del módulo MQTT (`mqtt_enki.c` real) en nativo con un
   cJSON mínimo y stubs de UI/MQTT (verifícala con `sim/` si la tienes a mano):
   registro, envelope, filtro por `destino`, filtro por `modulo`, contador,
   `prioridad 2`, `pedido_listo`, snapshot en array, borrado, `limpiar`, payload
   troceado, `prepare-item`, JSON inválido y re-registro al reconectar. Todo verde.

Sin verificar (requiere placa):

- Que el `esp_lcd_jd9365` v2.0.2 inicialice **esta** variante del JD9365 (el driver
  trae una secuencia de init por defecto; si el panel sale en blanco o con imagen
  corrupta, el siguiente paso es pasar `init_cmds` propio en `vendor_config`).
- El `swap_bytes`/orden de color RGB565 por DSI (puede necesitar invertirse).
- El canal del LDO del PHY (3 a 2.5 V) y el reset en GPIO27.
- Si el táctil es **GT911** (este firmware) o **GSL3680** (lo que usa la config
  ESPHome de referencia). Ver la sección del táctil.
- Los pines SDIO del C6 con la versión de `esp_hosted` fijada.

```bash
idf.py build          # aquí saldrán los errores reales si algo no casa
idf.py -p /dev/ttyACM0 flash monitor
```

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
