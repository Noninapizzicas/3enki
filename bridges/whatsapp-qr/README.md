# WhatsApp por QR — el canal de entrada de pedidos (puente Rust + lector)

> **Qué es.** El camino que convierte un mensaje de WhatsApp en un pedido dentro
> del POS de Enki **sin depender de la WhatsApp Cloud API de Meta**. Vive aquí, en
> el repo, para que un clon del sistema pueda reproducirlo entero.

## Las dos puertas de WhatsApp (no son la misma)

Enki tiene **dos** formas de hablar con WhatsApp y conviven:

| | `modules/whatsapp-bot` (v1.5.0) | `bridges/whatsapp-qr` (esto) |
|---|---|---|
| Protocolo | WhatsApp **Cloud API** (Meta, oficial) | **WhatsApp Web** (QR, como el móvil vinculado) |
| Requisito | WABA + número verificado + token Meta | un móvil con WhatsApp y cámara |
| Entrada | webhook HTTPS de Meta | proceso local que mantiene la sesión vinculada |
| Re-tasado del pedido | sí (snapshot de carta + `_shared/pedido-tasador`) | sí, delegado en el POS (`POST /tienda/pedido/<slug>`) |
| Credenciales | `credential-manager` (META_WHATSAPP) | sesión en SQLite, **nace escaneando el QR** |

**Por qué existe la segunda.** El número de la tienda no está dado de alta como
WABA. La puerta de los 8 dígitos (`pair code`) devuelve **429 RateOverlimit** en
cuanto se piden códigos en ráfaga — y cada arranque del puente pide uno nuevo, así
que reintentar rearma el freno. El QR no pasa por ese limitador: es el mismo
camino que "Dispositivos vinculados" del móvil.

## El recorrido (una línea)

```
móvil del cliente ──WhatsApp──▶ puente Rust (:8235)
                                   │  anexa 1 línea JSON por evento
                                   ▼
                        data/eventos-<slug>.jsonl
                                   │  ingest.js (offset en .offset-<slug>)
                                   ▼
              parser real de Enki (_shared/pedido-mensaje-parser.js)
                                   │  re-tasa contra la carta viva del proyecto
                                   ▼
                 POST /modules/tienda-api/tienda/pedido/<slug>   ← la MISMA puerta que la web
                                   │
                                   ▼
                     cuenta en el POS + confirmación por /send al cliente
```

El puente **no habla con el bus de Enki a propósito**: deja JSONL y el lector lo
mete por la puerta pública de la tienda. Así el binario no arrastra credenciales
del broker y el pedido pasa por el mismo camino (y el mismo re-tasado) que un
pedido de la web.

## Piezas

```
bridge/            el puente (crate Rust standalone)
  main.rs          N sesiones en un proceso · API local /health /codigo/<slug> /send
  Cargo.toml       whatsapp-rust pineado por REV (no por rama)
  accounts.example.json
ingest/ingest.js   lector JSONL → pedido en el POS (Node, sin dependencias)
servicio/          servicio.sh (2 hilos) · watchdog.sh (1 tiro) · pair-pirata.sh · unit systemd
build.sh           compila el puente
install.sh         reproduce el layout vivo en otra máquina
```

**Supervisor (`servicio.sh`)** — dos hilos independientes, por el fallo que no se ve:
- hilo 1: levanta el puente si no hay proceso; si el proceso vive pero lleva 3
  revisiones sin contestar `/health`, lo mata y arranca uno limpio (dos clientes
  con la misma sesión = WhatsApp los echa por turnos).
- hilo 2: relanza el lector si muere, y no lo arranca hasta que el POS contesta
  (`:3000/health`), para no leer con el POS caído tras un reinicio.

Cerrojo por **pidfile** (`kill -0`), no por `flock`: el cerrojo de flock lo hereda
el nieto y deja el servicio sin poder levantarse.

**Watchdog (`watchdog.sh`)** — un tiro, silencio si todo bien. Pensado para el cron
de Hermes cada 2 minutos: Hermes corre como `hermes-gateway.service`, que sí arranca
con la máquina, así que devuelve el servicio sin root tras un reinicio.

## Instalar en otra máquina

Un clon del repo basta: no hay binarios ni credenciales que copiar.

```bash
git clone <repo> && cd 3enki/bridges/whatsapp-qr
./install.sh                     # layout en $HOME (WA_BASE=... para otro sitio)
```

Dos slugs que **no** son el mismo y confundirlos deja el canal mudo:

| variable | qué es | ejemplo |
|---|---|---|
| `SLUG` | cuenta del **puente** (nombre del fichero `eventos-<slug>.jsonl`) | `tienda` |
| `PROYECTO` | proyecto de **Enki** donde nace el pedido (carta, POS) | `rapitvapers` |

```bash
SLUG=tienda PROYECTO=rapitvapers ./install.sh
```

El install deja las diferencias de la máquina en `wa-servicio/wa.env` (rutas,
slugs, `ENKI_HOME`), que `servicio.sh` lee al arrancar. El script que viaja en el
repo no lleva ni una ruta ni un slug de un cliente concreto.

O, como parte del alta de la VPS entera (instala pero **no arranca**):

```bash
sudo ./deployment/vps-setup.sh <dominio> --whatsapp [--whatsapp-slug=tienda]
```

El `install.sh` compila el puente desde las fuentes de `bridge/` (el `target/` no
viaja: son GB de caché) y escribe rutas y usuario de la máquina en la unit.

Después, vincular (una vez por máquina):

```bash
curl -s http://127.0.0.1:8235/codigo/<slug>     # QR + validez
```

Móvil: WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo.

**El QR caduca.** El primero tras arrancar dura 59 s; los renovados, ~20 s. Ten la
pantalla del escáner abierta **antes** de pedirlo.

## Lo que NO está en el repo (y no debe estarlo)

- `data/*.db` — la sesión de WhatsApp (credenciales E2E). Nace escaneando aquí.
- `data/accounts*.json` — config de cuentas locales (teléfonos, rutas).
- `data/eventos-*.jsonl`, `*.log`, `*.pid` — estado de ejecución.

Están en `.gitignore`. Un clon arranca **desvinculado** hasta que alguien escanee:
no hay forma de copiar una sesión de WhatsApp sin su dueño.

## Límites conocidos (no maquillados)

1. **Un slug por instalación** en `servicio.sh` (`--slug rapitvapers`). El puente sí
   es multi-cuenta; el supervisor vigila una.
2. **Emparejado por nombre exacto** cuando el mensaje no trae el `#P1` del carrito:
   si el cliente escribe el nombre a su manera, no cuadra y el pedido entra "sin
   producto en carta". El camino bueno es el carrito de la web, que manda ids.
3. **Tu propio móvil escribiendo al mismo número** no da tu teléfono, da un id
   interno (`@lid`). Con clientes reales llega su número; verificado el camino, no
   todos los casos.
4. **La sesión se cae sola** si el móvil queda sin red mucho rato; el supervisor la
   levanta, pero si WhatsApp invalida el dispositivo hay que volver a escanear.
