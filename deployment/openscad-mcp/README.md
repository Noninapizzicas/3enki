# OpenSCAD MCP Server — Deployment condicional por VPS

Servidor MCP de OpenSCAD en Docker con autenticación por token Bearer.
Solo se despliega en los VPS que lo declaran (`ENABLE_OPENSCAD=true` en `.env`).
Cualquier instancia de Enki con el token puede conectarse.

## Activar en un VPS

Añadir al `.env` del VPS (junto a `DOMAIN=`):

```bash
ENABLE_OPENSCAD=true
ENKI_MCP_TOKEN=<token generado con openssl rand -hex 32>
```

Al ejecutar `reconcile.js`, el snippet de Caddy se inyecta automáticamente
en el Caddyfile renderizado (solo si la flag está). En VPS sin la flag, no
llega nada.

## Setup

```bash
cd deployment/openscad-mcp

# 1. Construir y levantar
docker compose up -d --build

# 2. Verificar
docker logs openscad-mcp
curl -H "Authorization: Bearer $ENKI_MCP_TOKEN" http://localhost:3100/health

# 3. Reconciliar (inyecta el bloque Caddy si ENABLE_OPENSCAD=true)
sudo node deployment/reconcile.js
```

## Caddy — inyección automática

El bloque `scad.<dominio>` vive en `deployment/caddy/Caddyfile.openscad.snippet`.
El reconciliador:
1. Lee el `.env` del VPS
2. Si `ENABLE_OPENSCAD=true`, concatena el snippet al Caddyfile
3. Sustituye `pizzepos.es` por el dominio local (mismo mecanismo que todo)
4. Recarga Caddy solo si cambió

Caddy necesita `ENKI_MCP_TOKEN` en su entorno. Añadir a
`/etc/systemd/system/caddy.service.d/override.conf`:

```ini
[Service]
EnvironmentFile=/opt/enki/.env
```

## Conectar desde Claude Desktop

```json
{
  "mcpServers": {
    "openscad": {
      "url": "https://scad.<dominio>/mcp",
      "headers": {
        "Authorization": "Bearer <ENKI_MCP_TOKEN>"
      }
    }
  }
}
```

## Conectar desde Enki (portal-mcp)

```json
{
  "mcp_remotes": {
    "openscad": {
      "url": "https://scad.<dominio>",
      "token_env": "ENKI_MCP_TOKEN"
    }
  }
}
```

## Tools disponibles (15)

| Categoria | Tools |
|-----------|-------|
| Render    | `render_single`, `render_perspectives`, `compare_renders` |
| Export    | `export_model` (STL, 3MF, AMF, OFF, DXF, SVG) |
| Gestion   | `create_model`, `get_model`, `update_model`, `list_models`, `delete_model` |
| Analisis  | `validate_scad`, `analyze_model`, `check_openscad`, `get_libraries`, `get_project_files` |
