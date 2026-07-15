# Crawl4RS en el VPS — traer el Docker y usarlo

El motor vive en el repo hermano [D-os](https://github.com/noninapizzicas/d-os)
(Rust, 7 crates). Aquí solo vive su **provisioning**: el compose que lo trae al
VPS como contenedor `enki-crawl4rs`, y esta receta. El consumidor es el puente
`modules/crawl4rs` (bus↔HTTP), que ya apunta a `127.0.0.1:8081`.

Desde el relevo de fastcrw (v0.2.0 del puente), Crawl4RS es **el único órgano
web del bus**: leer · buscar · mapear · rastrear. Su modo `auto` cubre también
el fetch ligero que hacía crw-server (HTTP puro primero; navegador real solo
ante 403/challenge/JS pesado) — un motor, todas las puertas.

## Por qué Docker (y no nativo)

La regla de la casa es "Rust estático → nativo". Crawl4RS es la excepción que
confirma el criterio: el binario es limpio pero **arrastra Chromium** — y
Chromium es la dependencia sucia. El reparto es por naturaleza, no por
lenguaje: lo sucio va contenido. La imagen por defecto de D-os (Debian slim +
Chromium, ~123 MB) deja el modo navegador funcionando de fábrica. El Chromium
de crawling vive SOLO aquí — el VPS no lo instala (las libs Chromium de
`vps-setup.sh` son de open-wa/WhatsApp, otro órgano).

## Instalación — la hace el setup, no tú

`sudo ./deployment/vps-setup.sh <dominio>` lo trae TODO (sección 3a-bis del script):
instala Docker + compose si faltan, retira el crw-server viejo si quedó, clona (o
actualiza) `/opt/d-os`, genera el secreto JWT una sola vez en `data/.env` (persiste:
`data/` está excluido del rsync), crea la red `enki-web` y levanta `enki-crawl4rs`
+ SearXNG. Idempotente: re-ejecutar el setup actualiza el motor y reconstruye.

```bash
# verificar tras el setup
curl -s http://127.0.0.1:8081/health     # → ok
docker logs enki-crawl4rs --tail 20
```

Actualizar el motor = volver a correr el setup (o `git -C /opt/d-os pull` + el
compose de abajo).

## Receta manual (plan B / debug — lo mismo que hace el setup)

```bash
git clone --depth 1 https://github.com/noninapizzicas/d-os /opt/d-os
echo "CRAWL4RS_JWT_SECRET=$(openssl rand -hex 32)" >> /opt/enki/data/.env
docker network create enki-web
set -a; source /opt/enki/data/.env; set +a
docker compose -f /opt/enki/deployment/crawl4rs/docker-compose.yml up -d --build
docker compose -f /opt/enki/deployment/python-tools/docker-compose.searxng.yml up -d
```

## Encender y usar desde Enki

El puente **nace OFF** (decisión consciente, como toda herramienta pesada):

1. Panel de interruptores → grupo `sistema` → **`crawl4rs` ON**
   (o por bus: `interruptor.cambiar {id:'crawl4rs', on:true}`).
2. Desde una página con la tool en scope, el LLM ya tiene **`leer_web`**:
   lee una URL con navegador real → markdown limpio (+ BM25 con `query`,
   `extract_semantic` opcional).
3. Por bus, desde cualquier módulo/skill (sin allowlist):

```js
// una URL → markdown + extracción
const r = await bus.publishAndWait('crawl4rs.leer.request', {
  url: 'https://tienda.com/producto', query: 'precio', extract_semantic: true
});

// búsqueda web (SearXNG detrás del servidor)
const s = await bus.publishAndWait('crawl4rs.buscar.request', {
  query: 'harina de fuerza', limit: 5
});

// enlaces de una página (ligero, sin contenido)
const m = await bus.publishAndWait('crawl4rs.mapear.request', { url: 'https://ejemplo.com' });

// crawl profundo BFS/DFS
const site = await bus.publishAndWait('crawl4rs.rastrear.request', {
  url: 'https://ejemplo.com', max_depth: 2, max_pages: 25
});
```

Degradación honesta: interruptor OFF o contenedor caído → `503 {degradado,
motivo}`; `buscar` sin SearXNG → 503 con la prescripción del servidor en
`message` ("define SEARXNG_URL") — nunca finge.

## Marcha larga (Playwright) — opt-in, no cambia lo de siempre

El motor tiene **dos marchas** (D-os). La corta (arriba) va siempre: HTTP
determinista + el navegador propio del contenedor. La **larga** es el wrapper
de Playwright (`bridge/playwright-wrapper` en D-os) — el que desbloquea
**login con sesión persistente, interacción (scroll/click), interceptar la API
interna de la página, stealth y emulación** (locale/timezone/geo/móvil).

Vive tras un **perfil de compose (`larga`)**: el `docker compose up` de siempre
**ni lo mira**, así que la marcha corta queda idéntica. Se enciende explícito:

```bash
# construye/levanta las DOS marchas y enruta la escalación al wrapper
CRAWL4RS_PLAYWRIGHT_URL=http://browser:8100 \
  docker compose -f deployment/crawl4rs/docker-compose.yml \
  --profile larga up -d --build

docker ps | grep enki-crawl4rs-browser          # el wrapper, en la red interna
```

- Sin `--profile larga` (o sin `CRAWL4RS_PLAYWRIGHT_URL`): la escalación usa el
  navegador propio de `enki-crawl4rs`, como hasta ahora. Aditivo puro.
- Con ambas: cuando la marcha corta topa con login/JS pesado/anti-bot, escala
  al wrapper por HTTP (`http://browser:8100`, solo red `enki-web`, sin puerto
  al host).
- Auto-login opcional: exporta `CRAWL4RS_LOGIN=/etc/crawl4rs/login.json` y monta
  la receta (`{ url, pasos:[{tipo,selector,valor}] }`) — descomenta el `volumes`
  del compose. El wrapper hace login, guarda `storageState` y re-loguea solo al
  perder sesión.
- Topología "embutido" (alternativa): si ya corre un contenedor con Chromium,
  mete el `server.js` del wrapper dentro y ponle `PLAYWRIGHT_CDP_URL` — se
  conecta al Chromium en marcha en vez de lanzar otro. El contrato no cambia.

Degradación honesta: con la marcha larga activa pero el wrapper caído, la
escalación responde el fallo real (`{ fallo }`) — nunca inventa HTML ni sesión.

## Horizonte

La Fase 7 de D-os (`crawl4rs-mqtt`) hará que el motor hable MQTT nativo
(`core/<id>/api/request/crawl/*`). Ese día este puente HTTP se retira y el
compose solo cambia el comando (`mqtt` en vez de `serve`).
