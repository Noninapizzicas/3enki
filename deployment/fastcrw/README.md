# fastCRW en Enki — motor nativo + puente en el bus

`fastCRW` es un API de datos web en Rust (scrape · extract · search · crawl · map),
alternativa open-source a Firecrawl/Tavily. En Enki lo montamos con una separación limpia:

```
crw-server (Rust)   → NATIVO en el VPS · binario estático + systemd · :3002 · sin auth local
python-tools        → DOCKER · lo pringoso de Python aislado (SearXNG opcional, tus tools)
modules/fastcrw     → tools_http → http://localhost:3002/v1/* · el puente en el bus de Enki
```

**Por qué así:** el binario Rust es de una pieza → más limpio nativo que en contenedor.
Lo Python (dependencias sucias) va aislado en Docker. Cada lenguaje en su sitio. Sin cloud.

## Instalar el motor (nativo, sin Docker)

```bash
sudo deployment/fastcrw/install.sh
sudo cp deployment/fastcrw/crw-server.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now crw-server
curl http://localhost:3002/health          # comprobar
```

- Requiere el toolchain de Rust (no hay releases precompiladas; `install.sh` instala rustup si falta).
- Escucha en **:3002** (el core de Enki ocupa el :3000).
- El self-host local **no pide auth**.

## Qué funciona con qué

| Tool               | Necesita                     | Docker |
|--------------------|------------------------------|--------|
| `scrape`           | solo el binario              | no     |
| `extract`          | solo el binario              | no     |
| `map` / `crawl`    | solo el binario              | no     |
| `search`           | binario **+ SearXNG externo**| SearXNG (Python) → contenedor python-tools |

Sin `CRW_SEARCH__SEARXNG_URL`, el `/search` devuelve **503** (el resto sigue funcionando).
Para activarlo: levanta SearXNG (ver `deployment/python-tools/`) y descomenta la línea
`CRW_SEARCH__SEARXNG_URL` en `crw-server.service`, luego `systemctl restart crw-server`.

## El puente en Enki

El módulo `modules/fastcrw` expone las tools por el bus (`fastcrw.scrape`, `fastcrw.extract`,
`fastcrw.search`, `fastcrw.map`) apuntando a `http://localhost:3002/v1/*`. Cualquier LLM de
página (o un blueprint como escandallo) las invoca. Si crw-server no corre, devuelven
`UPSTREAM_UNREACHABLE` sin tumbar nada.

### Caso motivador: precio de ingredientes (soysuper)

El API de Mercadona no oficial falla y es de prestado. soysuper.com es un comparador con ficha
pública (`precio promedio` + `€/kg` sin login). `fastcrw.extract` sobre una ficha da:

```json
{ "nombre": "Mayonesa", "marca": "Hellmann's", "cantidad": "3 kg",
  "formato": "garrafa", "precio_promedio_eur": 16.94, "precio_unitario": "5,65 €/kg" }
```

→ fuente de precio para **escandallo** con su mismo contrato `{precio, cantidad, formato}`,
desacoplada del API prestado. (La integración fina en escandallo es el siguiente paso.)

## Usar la cloud en vez de nativo (opcional)

Cambia las `url` del `module.json` a `https://api.fastcrw.com/v1/*`, pon `auth_type: "bearer"`
con `credential_id: "FASTCRW"`, y da de alta la API key en credential-manager. No se instala nada.
