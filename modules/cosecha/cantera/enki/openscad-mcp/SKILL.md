---
name: openscad-mcp
description: >-
  Cómo conectarse y usar el servidor MCP de OpenSCAD (modelado 3D paramétrico)
  desplegado en enki-ai.online. Endpoint, token, tools, flujo de render/export,
  y los pitfalls pagados en vivo (DNS, env vars, entrypoint, healthcheck, .env
  persistente). Úsala cuando el dueño pida diseñar piezas 3D, modelar con
  OpenSCAD, exportar STL para impresión, o conectar un cliente MCP a OpenSCAD.
when-to-use: >-
  El dueño dice "diseña una pieza", "modela algo en 3D", "exporta a STL",
  "conecta OpenSCAD", o hay que usar el servidor MCP de OpenSCAD desde Enki,
  Hermes o Claude. También al diagnosticar por qué el contenedor openscad-mcp
  no responde o el endpoint da 401/404.
source: hermes
tags: [enki, openscad, mcp, 3d, stl, impresion, cupula]
---

# OpenSCAD MCP — servidor de modelado 3D

> **Propósito**: recuperar en segundos cómo conectarse y usar el servidor MCP
> de OpenSCAD, sin re-investigar el código ni los pitfalls que ya pagamos.
> Todo lo que hay que saber está aquí.

## Qué es

OpenSCAD es una **app de modelado 3D paramétrico** (escribes código `.scad` y
genera piezas 3D). El servidor **`openscad-mcp`** la envuelve en un servicio
MCP remoto: un agente (Enki, Hermes, Claude) llama a tools por HTTP y OpenSCAD
renderiza/exporta la pieza.

## Endpoint y token

| Dato | Valor |
|---|---|
| **Endpoint** | `https://enki-ai.online/scad/mcp` |
| **Token** | `ENKI_MCP_TOKEN` (en `/opt/enki/data/.env`) |
| **Auth** | Header `Authorization: Bearer <token>` |
| **Contenedor** | `openscad-mcp` (docker, puerto interno 3000 → host 3100) |

**El token actual es `nonina`** (débil, decisión del dueño). Se lee del `.env`
persistente (`data/.env`), NUNCA del `.env` de la raíz (el deploy lo borra).

## Cómo conectarse

### Desde Enki (Hermes worker — el chat de un proyecto)
El MCP ya está registrado en el config del worker (`/home/hermes/.hermes/config.yaml`):
```yaml
mcp_servers:
  openscad:
    url: https://enki-ai.online/scad
    headers:
      Authorization: "Bearer nonina"
```
Tras cambiar el config, **reiniciar `hermes-gateway`** para que cargue el MCP.

### Desde Claude Desktop
```json
{
  "mcpServers": {
    "openscad": {
      "url": "https://enki-ai.online/scad/mcp",
      "headers": { "Authorization": "Bearer nonina" }
    }
  }
}
```

### Desde cualquier cliente MCP (curl)
El servidor responde en **SSE** (`event: message` + `data:`), no JSON plano.
Flujo: `initialize` → te da `mcp-session-id` en el header → usa esa sesión.

```bash
# 1. initialize (crea sesión, devuelve mcp-session-id en el header)
curl -s -i -X POST https://enki-ai.online/scad/mcp \
  -H "Authorization: Bearer nonina" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'

# 2. tools/list (con la sesión)
curl -s -N -X POST https://enki-ai.online/scad/mcp \
  -H "Authorization: Bearer nonina" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <SID>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

## Las 15 tools

| Categoría | Tools |
|---|---|
| Render | `render_single`, `render_perspectives`, `compare_renders` |
| Export | `export_model` (STL, 3MF, AMF, OFF, DXF, SVG) |
| Gestión | `create_model`, `get_model`, `update_model`, `list_models`, `delete_model` |
| Análisis | `validate_scad`, `analyze_model`, `check_openscad`, `get_libraries`, `get_project_files` |

## Flujo de render (vista previa)

```bash
curl -s -N -X POST https://enki-ai.online/scad/mcp \
  -H "Authorization: Bearer nonina" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <SID>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"render_single","arguments":{"scad_content":"cube([20,20,20]);"}}}'
```
→ devuelve la imagen PNG en base64 (campo `data` del content).

## Flujo de export (STL para impresión)

```bash
curl -s -N -X POST https://enki-ai.online/scad/mcp \
  -H "Authorization: Bearer nonina" -H "Content-Type: application/json" \
  -H "Mcp-Session-Id: <SID>" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"export_model","arguments":{"scad_content":"cube([20,20,20]);","output_format":"stl"}}}'
```
→ devuelve JSON con la ruta del archivo DENTRO del contenedor
(`/tmp/openscad-mcp/exports/export_<hash>.stl`). Para sacarlo:
```bash
sudo docker cp openscad-mcp:/tmp/openscad-mcp/exports/export_<hash>.stl /tmp/pieza.stl
```

**IMPORTANTE**: el parámetro de formato es `output_format` (NO `format` — da
error de validación). El endpoint MCP es `/mcp` (NO `/health`).

## Pitfalls pagados en vivo (NO repetir)

1. **DNS**: `scad.enki-ai.online` NO resuelve (no hay registro DNS). Por eso se
   usa el **path `/scad/*`** en el dominio principal, no un subdominio.
2. **Env vars del contenedor**: el paquete lee `MCP_TRANSPORT`/`MCP_HOST`/`MCP_PORT`
   (NO `SERVER_TRANSPORT`/`MCP_SERVER_*`). Con el nombre equivocado arranca en
   `stdio` y no abre el puerto.
3. **Entrypoint**: `xvfb-run -a` como PID1 no mantiene el python vivo. Se usa un
   `entrypoint.sh` propio (Xvfb en background + `exec python -m openscad_mcp`).
4. **Healthcheck**: el paquete sirve `/mcp` (POST), no `/health`. El healthcheck
   hace un POST `/mcp` con `initialize`.
5. **`.env` persistente**: el `.env` de la raíz (`/opt/enki/.env`) NO sobrevive
   al deploy (rsync `--delete` lo borra). Los secretos van en `data/.env`
   (excluido del rsync). El override de Caddy apunta a `data/.env`.
6. **xauth**: el stage runtime necesita `xauth` (además de `xvfb`) o
   `xvfb-run` falla con "xauth command not found".
7. **`uv run python -m build`**: el build usa el python del venv (no el del
   sistema, donde `build` no está).

## Despliegue / activación

- El contenedor se activa por **dominio** en el reconcile (`dominios: ['enki-ai.online']`
  en `vps.manifest.js`), sin tocar `.env`.
- El bloque Caddy `/scad/*` está en `deployment/caddy/Caddyfile.vps` (auth Bearer
  + `rewrite * /mcp` + `reverse_proxy localhost:3100`).
- El override de Caddy (`/etc/systemd/system/caddy.service.d/override.conf`) apunta
  a `data/.env` y lo asegura el reconcile.
- Para que el chat de Enki use OpenSCAD: el MCP está en la plantilla del worker
  (`deployment/hermes-worker/config.yaml.tmpl`) + reiniciar `hermes-gateway`.

## Proyecto de diseño de piezas

- El proyecto **`impresion-3d`** existe en disco (UUID `f98a26cb-2b1b-4264-80b9-ac65184e7ece`)
  pero **NO está registrado en la tabla `projects` de la BD del sistema**
  (`/opt/enki/data/projects/system/db.sqlite`). Por eso el core no lo reconoce.
- Para registrarlo: evento `project.create` (vía canónica) o insertar en la tabla
  `projects` + reiniciar el core.
- El esquema de su BD estaba incompleto (2 tablas); se completó a 7 copiando el
  esquema de un proyecto sano (`a`).
