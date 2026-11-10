# enki-bridge

APK en Rust que mantiene un canal con Enki y opera **la aplicacion real** de la
red social que ya esta instalada y con sesion iniciada en el movil.

No suplanta ningun cliente ni guarda contrasenas de redes: el puente recibe una
orden de Enki y pulsa lo que pulsarias tu.

## Estado

| Fase | Que hace | Estado |
|---|---|---|
| F1 | Canal MQTT con Enki desde el movil | **nucleo probado** (falta la APK) |
| F2 | Recibir una pieza compartida (imagen/video) | esqueleto |
| F3 | Abrir la red y publicar con la app real | pendiente |

## Como se habla con Enki

El movil se conecta al broker por WebSocket seguro con la llave en la query,
igual que el panel de cocina:

```
wss://enki-ai.online/mqtt?k=<llave>
```

Topics:

```
core/core-a/events/bridge/orden/#      Enki -> movil (ordenes)
core/core-a/events/bridge/resultado    movil -> Enki (resultados)
```

Una orden:

```json
{"accion":"publicar","red":"instagram","texto":"...","archivo":"/sdcard/f.jpg","simulacion":true}
```

## Probar el nucleo en un escritorio

```bash
ENKI_BRIDGE_URL='wss://enki-ai.online/mqtt?k=LLAVE' cargo run
# CONECTADO · escuchando core/core-a/events/bridge/orden/#
```

## Compilar la APK (en el portatil)

Requisitos:

- Rust (`rustup`)
- `cargo install cargo-ndk`
- Android Studio con **SDK 35** y **NDK r30**
- JDK 17

Y despues:

```powershell
.\compilar.ps1
```

El script compila el `cdylib` para `arm64-v8a` y `x86_64`, copia las `.so` a
`android/app/src/main/jniLibs/` y lanza Gradle.

## Detalles de build que no hay que tocar

- `.cargo/config.toml` anade `--build-id=sha1` y `max-page-size=16384` (el
  requisito de 16 KiB de Android 15+). **No definir `RUSTFLAGS`**: sustituye
  esos flags en silencio.
- `cargo` debe ejecutarse desde la raiz del crate (lee `.cargo/config.toml` del
  directorio actual hacia arriba).
- El perfil `android-jni` usa `panic = "unwind"` y `strip = "none"`: hace falta
  para que Gradle extraiga los simbolos de depuracion.

## Por que un cliente MQTT propio

Los clientes MQTT de Rust descartan el path y la query de la URL, y la llave del
broker viaja en la query. `src/bus.rs` implementa lo minimo (CONNECT,
SUBSCRIBE, PUBLISH, QoS 0) sobre `async-tungstenite`, con un framer que acumula
bytes porque el broker entrega el CONNECT-ACK en trozos de un byte.
