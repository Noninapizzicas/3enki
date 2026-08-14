# enki-movil — App nativa de Enki (Dioxus)

Cara nueva de la plataforma: app nativa (desktop/móvil) que se conecta al bus
MQTT de Enki como una isla más. NO toca el core — habla el mismo contrato que
el frontend SvelteKit (`ui/request` → `ui/response`).

## Qué hace (v0.1)

- Conecta al bus: `ws://localhost:9001/mqtt` (dev) / `wss://enki-ai.online/mqtt` (prod)
- Refleja: módulos del sistema (estado) + señales del radar de nichos (banco)
- Botones: Alternar interruptor de cada módulo + Disparar ciclo del radar
- Todo por MQTT, sin HTTP inventado

## Stack

- Dioxus 0.6 (Rust) — UI declarativa multiplataforma
- rumqttc — cliente MQTT
- Bridge: `src/bridge.rs` porta `mqtt-request.ts` del frontend a Rust

## Build

```bash
sudo -S -p '' apt-get install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev libxdo-dev
cargo build          # dev
cargo build --release  # release (<10 MB)
```

## Token

El token del bus se lee de `enki-token.txt` (junto al binario). En prod:
copiar `/opt/enki/data/.hermes-bridge-token`.

## Estado

v0.1 — monitor + acciones básicas. Próximos: suscripción a eventos (tiempo
real), notificaciones push, Android/iOS (`dx serve --platform android`).
