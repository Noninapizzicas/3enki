# Crawl4RS en el VPS — traer el Docker y usarlo

El motor vive en el repo hermano [D-os](https://github.com/noninapizzicas/d-os)
(Rust, 7 crates). Aquí solo vive su **provisioning**: el compose que lo trae al
VPS como contenedor `enki-crawl4rs`, y esta receta. El consumidor es el puente
`modules/crawl4rs` (bus↔HTTP), que ya apunta a `127.0.0.1:8081`.

## Por qué Docker (y no nativo, como crw-server)

La regla de la casa es "Rust estático → nativo". Crawl4RS es la excepción que
confirma el criterio: el binario es limpio pero **arrastra Chromium** — y
Chromium es la dependencia sucia. El reparto es por naturaleza, no por
lenguaje: lo sucio va contenido. La imagen por defecto de D-os (Debian slim +
Chromium, ~123 MB) deja el modo navegador funcionando de fábrica.

## Receta (una vez, en el VPS)

```bash
# 1 · Traer el repo del motor
git clone --depth 1 https://github.com/noninapizzicas/d-os /opt/d-os

# 2 · Secreto JWT propio (el default del Dockerfile es público — NO sirve)
echo "CRAWL4RS_JWT_SECRET=$(openssl rand -hex 32)" >> /opt/enki/data/.env

# 3 · Construir y levantar (lee el secreto del entorno)
set -a; source /opt/enki/data/.env; set +a
docker compose -f /opt/enki/deployment/crawl4rs/docker-compose.yml up -d --build

# 4 · Verificar
curl -s http://127.0.0.1:8081/health
docker logs enki-crawl4rs --tail 20
```

Actualizar el motor = `git -C /opt/d-os pull` + repetir el paso 3.

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

// crawl profundo BFS/DFS
const site = await bus.publishAndWait('crawl4rs.rastrear.request', {
  url: 'https://ejemplo.com', max_depth: 2, max_pages: 25
});
```

Degradación honesta: interruptor OFF o contenedor caído → `503 {degradado,
motivo}` con error fértil — nunca finge.

## Cuándo esta pieza y cuándo fastcrw

| | fastcrw (crw-server, nativo :3002) | Crawl4RS (Docker :8081) |
|---|---|---|
| Motor | fetch HTTP ligero | navegador real (CDP) + stealth |
| Para | páginas server-rendered, volumen | sitios JS-pesados / protegidos (Cloudflare) |
| Coste | mínimo | Chromium (RAM, ~1GB shm) |

Primero fastcrw; Crawl4RS cuando el fetch ligero no salta la puerta.

## Horizonte

La Fase 7 de D-os (`crawl4rs-mqtt`) hará que el motor hable MQTT nativo
(`core/<id>/api/request/crawl/*`). Ese día este puente HTTP se retira y el
compose solo cambia el comando (`mqtt` en vez de `serve`).
