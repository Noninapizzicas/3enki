---
id: plataforma/servir-www
dominio: plataforma
resumen: Árbol libre en /<ns>/<slug>/ servido por Caddy estático + symlink por proyecto; carta-digital publica el bundle; publicador escribe HTML.
fuentes:
  - modules/publicador/**
  - lib/public-ns.js
  - blueprints/project-types/www.json
  - deployment/caddy/**
  - deployment/reconcile.js
verificado: 2026-07-07
---

# SERVIR WWW POR PROYECTO — árbol libre en /<ns>/<slug>/ (Caddy estático + symlink)

> El www por proyecto NO lo sirve el gateway Node: lo sirve **Caddy** estático desde un
> namespace global, y el proyecto llega por un **symlink**. Sin resolución de proyecto en
> runtime — el SO resuelve el enlace. Un símbolo cambia el destino; Caddy no se toca.

## Contrato (JSON)

```json
{
  "esquema": "servir-www-por-proyecto-v1",
  "tesis": "el proyecto es dueño de su árbol; la URL espeja storage/www/ tal cual",
  "convencion_url_fs": "GET /<ns>/<slug>/<ruta>  →  /opt/enki/public/<ns>/<slug>/<ruta>  →symlink→  data/projects/<slug>/storage/www/<ruta>",
  "piezas": {
    "prefijo_ns":   "lib/public-ns.js — botón único: config.json web.public_ns (default 'a'). Global por VPS, no por proyecto.",
    "bloque_caddy": "deployment/reconcile.js renderBloqueNamespace → marca @@NAMESPACE@@: handle_path /<ns>/* { root /opt/enki/public/<ns>; try_files {path} {path}/index.html /index.html; file_server }. UN bloque para todos.",
    "symlink":      "project-manager al activar feature 'www': /opt/enki/public/<ns>/<slug> → <proyecto>/storage/www. Auto-heal en project.activated.",
    "feature":      "blueprints/project-types/www.json — directories:[storage/www] · symlink · public_url /<ns>/<slug> · initialFiles index.html placeholder"
  },
  "genera_el_contenido": {
    "carta-digital._publicarBundle": "VIVO — proyecta la carta pública al vuelo, escribe el bundle PWA en la RAÍZ de www/ (la carta ES la home). AUTO-ACTIVA la feature www antes de escribir.",
    "árbol libre":  "lo que el comerciante suba a www/ (www/catalogo/…) convive al lado y se espeja en la URL"
  },
  "shop_desaparece": "el modelo viejo /<ns>/shop/<slug> (feature 'tienda', bundle rígido) queda LEGACY. Migración runtime: reactivar www + republicar.",
  "no_toca": ["Caddyfile (try_files ya sirve árbol)", "reconcile.js", "project-manager._applySymlinks (lo conduce el blueprint)"],
  "borde": "try_files … /index.html cae al índice del NAMESPACE, no al del proyecto, para rutas inexistentes bajo /<ns>/<slug>/ — irrelevante con árbol de ficheros real"
}
```

## Modelo (pseudocódigo tipado)

```
// El symlink es la ÚNICA frontera; project-manager su único dueño.
CLASE FeatureWww {                              // blueprints/project-types/www.json (datos, no código)
  directories  = ["storage/www"]
  symlink      = { source: "storage/www", target: "/opt/enki/public/{{public_ns}}/{{slug}}" }
  public_url   = "/{{public_ns}}/{{slug}}"
  initialFiles = { "storage/www/index.html": "<placeholder>" }
}

CLASE ProjectManager (ampliación) {
  _applySymlinks(basePath, symlinks, slug):     // sustituye {{public_ns}}+{{slug}} → symlink(source, target)
  _ensureFeatureSymlinks(project):              // auto-heal: rehace symlinks de TODAS las features en project.activated

  // RPC de bus NUEVO (patrón híbrido reflejo→reflejo): otro módulo pide asegurar la feature
  // sin pasar por la UI. Idempotente (no re-inicializa si ya está). Sigue siendo el único
  // dueño del symlink.
  onEnsureFeatureRequest(event):
    { request_id, id|project_id, features } ← event.data
    result ← handleUIAddFeatures({ id, features })        // reusa la vía existente
    publish('project.ensure-feature.response', { request_id, status: result.status, data: result.data, error })
}

CLASE CartaDigital._publicarBundle(project_id, slugHint) {   // VIVO — el generador
  guardCrossProject(project_id == ultimoActivo)             // fs escribe en el último activado
  data ← proyectarCartaPublica(project_id)                  // al vuelo: carta-manager + marketing + contenido
  ns   ← publicNs()
  base_href ← `/${ns}/${slug}/`                             // (antes /${ns}/shop/${slug}/)
  frenoRender(render.verificar.request)                     // no publica si renderiza roto (best-effort)
  featureOk ← _rpc('project.ensure-feature.request', { id: project_id, features: ['www'] })  // AUTO-ACTIVA
  escribir BUNDLE_DIR='/www' : { index.html, sw.js, manifest.json, icon-192.svg, icon-512.svg }  // fs.write.request
  emitir('cartadigital.publicado')
  RETORNA { alojada_url: `/${ns}/${slug}`, bundle_dir: 'storage/www', feature_www: featureOk, aviso }
}

CLASE BienvenidaTienda._resolvePwaUrl(config, slug) {       // URL por defecto alineada al modelo
  SI config.www.public_url   : RETORNA host + public_url    // /<ns>/<slug>/
  SI config.tienda.pwa_url   : RETORNA config.tienda.pwa_url // legacy
  SI config.pwa_url          : RETORNA config.pwa_url
  RETORNA `https://<host>/${publicNs()}/${slug}/`            // (antes /${slug}/ sin ns)
}
```

## Flujo (petición → disco)

```
GET https://<dominio>/a/regalos/catalogo/anillos
  → Caddy handle_path /a/* → root /opt/enki/public/a → try_files
  → /opt/enki/public/a/regalos/catalogo/anillos   (SYMLINK regalos → data/projects/regalos/storage/www)
  → data/projects/regalos/storage/www/catalogo/anillos.html   ← file_server

PUBLICAR (desde chat / RPC cartadigital.publicar.request):
  carta-digital._publicarBundle → ensure-feature('www') → escribe storage/www/index.html + assets
  → symlink ya existe → se ve en /a/regalos/ SIN paso manual
```

## Topics / eventos

```
project.ensure-feature.request → .response   { request_id, status, data }   (auto-activar feature desde otro módulo)
cartadigital.publicar.request → cartadigital.publicado   { project_id, slug, productos, imagenes }
```

## Estado

```
✓ VIVO  Caddy /a/* estático · symlink por proyecto (project-manager) · www.json · carta-digital publica a www/ raíz · auto-activación (ensure-feature) · URL por defecto /<ns>/<slug>/
◑ LEGACY  tienda.json (/<ns>/shop/<slug>) — proyectos vivos migran reactivando www + republicando
◑ RUNTIME  activar www en proyectos vivos + migrar los de tienda (no código)
[ ] prisma/escaparate genera bundle sobre este mismo modelo (hoy solo proyecta datos por bus)
VERSIONES  project-manager 4.2.0 · carta-digital 2.23.0 · bienvenida-tienda 1.1.0
```
