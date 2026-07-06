# python-tools — Docker para correr herramientas Python

Lo pringoso (dependencias Python) va aislado en un contenedor, no en el VPS. Dos usos:

1. **Herramientas Python del ejecutor** — correr tus scripts/tools Python aislados, con la reja.
2. **SearXNG** (opcional) — el backend de búsqueda para `fastcrw.search`.

## 1. Imagen de herramientas Python

```bash
docker build -t enki-python-tools deployment/python-tools/
docker run --rm enki-python-tools python -c "import requests, bs4; print('ok')"
```

Base `python:3.12-slim` + `requests` · `beautifulsoup4` · `lxml` · `crw` (SDK de fastCRW).
Mínimo a propósito — añade libs en el `Dockerfile` según necesites.

### Cablearla al ejecutor (cero código)

El ejecutor ya toma la imagen de contenedor de su config (`config.contenedor_imagen`,
default `node:20-slim`). Para correr Python aislado, en `modules/ejecutor/module.json`:

```json
{ "config": { "contenedor_imagen": "enki-python-tools" } }
```

Luego `ejecutor.ejecutar` con `aislamiento: "contenedor"` corre el comando en la imagen
Python, con la reja completa: interruptor `ejecutor` OFF por defecto, `--rm` efímero,
`--cap-drop ALL`, `--security-opt no-new-privileges`, audit `ejecutor.invocado`.

> Nota: `contenedor_imagen` es global al ejecutor. Si necesitas node **y** python a la vez,
> deja el default node y construye una imagen que traiga ambos, o usa un segundo mecanismo.

## 2. SearXNG (opcional — solo para `fastcrw.search`)

`scrape`/`extract`/`map` NO lo necesitan. Solo la búsqueda de palabra-clave:

```bash
docker compose -f deployment/python-tools/docker-compose.searxng.yml up -d
```

Luego en `deployment/fastcrw/crw-server.service` descomenta:

```
Environment=CRW_SEARCH__SEARXNG_URL=http://127.0.0.1:8080
```

y `sudo systemctl restart crw-server`. Sin esto, `fastcrw.search` devuelve 503 y el resto sigue.

## 3. Headroom (compresión de contexto delante del ai-gateway)

Middleware Python que comprime todo lo que el agente LEE antes del LLM (60–95% menos tokens
facturados, reversible). El **código de enganche en Enki ya está** (interruptor `headroom` +
override en `base-provider._apiBase()`, test 8/8); esto es la FASE 0: el proxy corriendo.
Verificado contra `headroom-ai` 0.30.0.

```bash
docker compose -f deployment/python-tools/docker-compose.headroom.yml up -d
curl http://127.0.0.1:8787/livez        # → {"status":"healthy"}
```

Cablearlo a Enki (dos gestos, ninguno toca código):

1. En el arranque del core, una env: `HEADROOM_PROXY_URL=http://localhost:8787`.
2. Enciende el interruptor **`headroom`** (panel, grupo sistema, OFF por defecto).

El provider `deepseek-anthropic`/`anthropic` (marcados `headroom:true`) enruta por el proxy en
caliente. **Fallback seguro:** interruptor OFF o proxy caído → proveedor directo (sin reinicio).

- **Upstream:** el proxy reenvía a `ANTHROPIC_TARGET_API_URL` (en el compose; default deepseek
  `/anthropic`). Sobre Claude real, quita esa env → va a `api.anthropic.com`.
- **Fidelidad:** los frenos de blueprint (`<mod>.validar`, 422) son el test automático — si la
  compresión rompiera el contrato, se ve en el acto. Por eso la compresión nace OFF y se gradúa.
- El modelo Kompress se descarga en el primer arranque (cacheado en el volumen `headroom-cache`).

## El reparto (por qué así)

```
Rust (crw-server)   → NATIVO en el VPS   (binario limpio de una pieza)
Python (SearXNG,    → DOCKER aislado     (dependencias sucias, no ensucian el VPS)
        Headroom,
        tus tools)
```
