# OpenSCAD MCP Server — Deployment para pizzepos.es

Servidor MCP de OpenSCAD en Docker con autenticación por token Bearer.
Cualquier instancia de Enki (Claude Desktop, Hermes, portal-mcp) que tenga
el token puede conectarse.

## Setup rápido

```bash
cd deployment/openscad-mcp

# 1. Generar el token secreto (una sola vez)
echo "ENKI_MCP_TOKEN=$(openssl rand -hex 32)" > .env

# 2. Construir y levantar
docker compose up -d --build

# 3. Verificar
docker logs openscad-mcp
curl -H "Authorization: Bearer $(grep ENKI_MCP_TOKEN .env | cut -d= -f2)" \
     http://localhost:3100/health

# 4. Añadir bloque Caddy (ver abajo) y recargar
sudo systemctl reload caddy
```

## Caddy — añadir a Caddyfile.vps

```
scad.pizzepos.es {
    @no_token {
        not header Authorization "Bearer {env.ENKI_MCP_TOKEN}"
    }
    respond @no_token 401

    reverse_proxy localhost:3100

    header {
        X-Content-Type-Options nosniff
    }

    log {
        output file /var/log/caddy/scad.pizzepos.log
        format json
    }
}
```

Caddy necesita la variable `ENKI_MCP_TOKEN` en su entorno. Añadir a
`/etc/systemd/system/caddy.service.d/override.conf`:

```ini
[Service]
EnvironmentFile=/ruta/a/deployment/openscad-mcp/.env
```

## Conectar desde Claude Desktop

```json
{
  "mcpServers": {
    "openscad": {
      "url": "https://scad.pizzepos.es/mcp",
      "headers": {
        "Authorization": "Bearer <ENKI_MCP_TOKEN>"
      }
    }
  }
}
```

## Conectar desde Enki (portal-mcp)

El portal-mcp lee el token desde `config.json`:

```json
{
  "mcp_remotes": {
    "openscad": {
      "url": "https://scad.pizzepos.es",
      "token_env": "ENKI_MCP_TOKEN"
    }
  }
}
```

## Tools disponibles (15)

| Categoría | Tools |
|-----------|-------|
| Render    | `render_single`, `render_perspectives`, `compare_renders` |
| Export    | `export_model` (STL, 3MF, AMF, OFF, DXF, SVG) |
| Gestión   | `create_model`, `get_model`, `update_model`, `list_models`, `delete_model` |
| Análisis  | `validate_scad`, `analyze_model`, `check_openscad`, `get_libraries`, `get_project_files` |
