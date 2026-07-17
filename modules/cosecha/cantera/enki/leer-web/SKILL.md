---
name: leer-web
description: Leer la web DENTRO de un turno y SACARLE EL MÁXIMO — leer una página, buscar, mapear enlaces, rastrear un sitio, extraer imágenes/precios/datos estructurados, y ENTRAR en páginas con contraseña (login→sesión, la marcha larga). crawl4rs es un MÓDULO del bus (no un fichero ni un agente): se conduce por bus.publishAndWait, la herramienta que el diseño deja en segundo plano. Playbook con recetas concretas (imágenes de productos, fichas, catálogos, portales B2B tras login) + cómo leer el error para no rendirse.
fuente: enki
dominio: web
lente_dominio: web
lente_tarea: consultar
tags: [web, datos, crawl4rs, leer, buscar, mapear, rastrear, imagenes, scraping, bus, herramientas, precio, catalogo, investigacion, login, sesion, autenticado, contraseña, portal, b2b, mayorista, playwright, interceptar, stealth]
---

# Leer web — conduce crawl4rs por el bus y sácale el máximo

> **Lo primero, porque es donde todos se atascan:** crawl4rs **NO es un fichero, ni un agente,
> ni una skill instalada** — no lo busques con `fs.search` ni `buscar_agente`, no lo encontrarás.
> Es un **MÓDULO del bus**. Su tool de chat es `leer_web`, pero SIEMPRE puedes conducirlo directo
> por el canal universal que ya tienes: `bus.publishAndWait('crawl4rs.leer.request', {url})`.
> Las tools viven en segundo plano por diseño; este skill te enseña a alcanzarlas y exprimirlas.

## El precondicional (una sola cosa)

El puente **nace OFF**: el interruptor `crawl4rs` (grupo sistema) tiene que estar ON. Si está
apagado, TODA llamada responde `503 {degradado, motivo:'apagado'}` — no es un fallo del motor,
es la puerta cerrada: dilo, no lo rodees.

## Los cuatro verbos — cuál para qué

| Verbo | Evento | Para qué | Devuelve |
|---|---|---|---|
| **leer** | `crawl4rs.leer.request` | UNA página → su contenido | `data.markdown` (+ `data.extraido`) |
| **buscar** | `crawl4rs.buscar.request` | no sabes la URL → búscala | `data.resultados[{titulo,url,resumen}]` |
| **mapear** | `crawl4rs.mapear.request` | los ENLACES de una página (ligero) | `data.enlaces[]` |
| **rastrear** | `crawl4rs.rastrear.request` | un sitio ENTERO (BFS/DFS) | `data.paginas[{url,markdown,extraido}]` |

```
res = bus.publishAndWait('crawl4rs.leer.request', { url: 'https://…', query: 'precio' })
res = bus.publishAndWait('crawl4rs.buscar.request', { query: 'harina de fuerza', limit: 5 })
res = bus.publishAndWait('crawl4rs.mapear.request', { url: 'https://…' })
res = bus.publishAndWait('crawl4rs.rastrear.request', { url: 'https://…', max_depth: 2, max_pages: 10 })
```

Respuesta siempre `{status, data}` (o `{status, error}`). Con `status: 200`, lee `data`.
Motor: **Crawl4RS** (Rust, modo auto — fetch ligero primero, navegador real + stealth solo cuando
la página lo exige). NO uses `ejecutor` + `curl`: pierdes el endpoint encapsulado y el mensaje
interpretado del error.

## SACAR EL MÁXIMO — recetas

**1 · Imágenes de productos de una página** (el caso e-commerce: catálogo, tienda ajena).
El camino FIABLE es la **markdown**: `leer` a secas ya trae cada imagen en línea como
`![alt](url)` — extráelas con un regex `!\[[^\]]*\]\(([^)]+)\)`. Verificado en vivo:
una tienda real devolvió 15 URLs de imagen así, sin tocar selectores.
```
res  = bus.publishAndWait('crawl4rs.leer.request', { url: 'https://tienda.com/categoria/gafas' })
imgs = [...res.data.markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1])
```
`extract_css` sirve para **texto** con selectores CSS estándar (`.product-title`, `.price`) y
lo entrega en `data.extraido` — pero NO uses el pseudo `::attr(src)` (sintaxis Scrapy que este
motor no honra: `data.extraido` vuelve `null`). Para el `src` de una imagen, la markdown es la vía.
```
res = bus.publishAndWait('crawl4rs.leer.request', {
  url: 'https://tienda.com/categoria/gafas',
  extract_css: { nombres: '.product-title', precios: '.price' }   // texto, sí; ::attr(src), no
})
res.data.extraido   // { nombres:[...], precios:[...] }  ·  las imágenes salen de la markdown
```

**2 · Ficha de un producto** (precio, formato, descripción). Léela y saca de la markdown, o
`extract_css: { precio: '.price', desc: '.description' }` (texto por selector estándar). La imagen
principal, de la markdown (rec>1); no del `::attr(src)`, que este motor no honra.

**3 · No sabes la URL → busca primero, lee después** (el patrón de descubrimiento, verificado):
```
res  = bus.publishAndWait('crawl4rs.buscar.request', { query: 'esther volta paños gafas' })
url  = elegirMejor(res.data.resultados)        // TÚ casas el resultado
ficha= bus.publishAndWait('crawl4rs.leer.request', { url })
```
No ADIVINES slugs de URL (`/p/<inventado>` → 404 vacío). Descubre por búsqueda o por `mapear`.

**4 · El árbol de un sitio** (¿qué categorías/páginas tiene?): `mapear` la home → te da los
enlaces → eliges los que valen → `leer` cada uno. Barato antes de rastrear a ciegas.

**5 · Un catálogo entero** (varias páginas de golpe): `rastrear` con `max_depth`/`max_pages`
acotados. Trae `data.paginas[]` con markdown+extraido de cada una. Respeta el ritmo (abajo).

**6 · Filtrar por relevancia**: `query` en `leer` rankea el contenido por BM25 — útil en páginas
largas («dame solo lo que hable de precio»). `extract_semantic: true` saca el contenido principal.

**7 · Catálogo que renderiza con JS (WooCommerce/Shopify) — la trampa que hace rendirse.**
La HOME suele traer imágenes estáticas (banners) y parece que va; la página de CATEGORÍA devuelve
solo el menú de navegación (`status 200` pero 0 productos) porque el grid lo pinta JavaScript. NO
concluyas «crawl4rs no puede» — el contenido server-rendered SÍ está, en otra puerta:
- **El feed RSS de la categoría**: añade `/feed/` a la URL (WooCommerce/WordPress) → XML con
  nombre, precio e imagen de cada producto. Verificado en vivo: la categoría en página daba 0
  imágenes; su `/feed/` dio 21 con `crawl4rs.leer.request`. Es la MISMA fuente que un scraper RSS
  usaría — pero la lees por el bus, sin script aparte.
- **O mapea→lee**: `mapear` la categoría → coge los enlaces a cada producto → `leer` cada ficha
  (la ficha del producto sí trae su imagen en la markdown). El grid es un índice; la imagen vive
  en la ficha.
Nunca cambies crawl4rs por un scraper Python «porque la categoría no cargó»: es un falso dilema —
crawl4rs lee ese mismo RSS/ficha. La restricción no es el motor; es apuntar a la puerta correcta.

**8 · De la URL de imagen al PRODUCTO — dos caminos, ninguno con ejecutor.**
Ya tienes la url de la imagen (de la markdown o de `extract_css` de texto). Para ponerla en un
producto hay dos vías, según si la quieres *propia* o basta *apuntar*:
- **Referenciar (barato, por defecto)**: la imagen vive en un CDN público estable (`i0.wp.com`…) →
  apunta a ella, no la re-alojes. `bus.publishAndWait('contenido.add_imagen.request',
  { project_id, product_id, url_remota: 'https://i0.wp.com/…jpg' })`. La url ES la evidencia.
- **Re-alojar (cuando la necesitas propia)**: baja los bytes con **`descargar_web`** y pásalos:
  ```
  img = bus.publishAndWait('crawl4rs.descargar.request', { url: 'https://i0.wp.com/…jpg' })
  bus.publishAndWait('contenido.add_imagen.request',
    { project_id, product_id, content: img.data.base64, ext: img.data.ext })
  ```
NUNCA descargues con el `ejecutor`+curl (está gated y te atascas): `descargar_web` es el paso
url→bytes. Y para adjuntarla, `contenido.add_imagen` — no la dejes suelta en un fichero.

## Páginas con contraseña — la MARCHA LARGA (login → sesión)

> **El caso que los cuatro verbos NO cubren:** un portal B2B / mayorista / panel de cliente donde
> los precios (o el stock, o las fichas) **solo se ven tras iniciar sesión**. `leer`/`rastrear` van
> al **servidor** de Crawl4RS (marcha corta/auto: fetch ligero → navegador real), y ese servidor
> **no conserva una sesión con login**. Para entrar con usuario/contraseña el motor tiene una
> **segunda puerta**: la **marcha larga** = el *wrapper Playwright* (`CRAWL4RS_PLAYWRIGHT_URL`).
> Contrato `contrato-puente-v1`, verificado en vivo (Chromium real captura la cookie tras el guion).

### El contrato de la marcha larga (dos endpoints)

```
POST /login  { url, pasos }            → { sesion, final_url }   // sesion = storageState (cookies + localStorage)
POST /abrir  { url, sesion, ... }      → { html, final_url, status, intercepted }
```

- **`/login`** ejecuta un **guion de pasos** sobre el formulario y **captura la sesión** (el
  `storageState` de Playwright: cookies + localStorage). Es el objeto de intercambio.
- **`/abrir { url, sesion }`** abre **ya autenticado** reusando esa sesión. Una sola sesión sirve
  para **muchos `/abrir`** → volumen autenticado barato (esa es la palanca: logueas una vez,
  cosechas N páginas).

### El guion de `pasos` (el vocabulario)

Cada paso es `{ tipo, selector?, valor?, ms?, veces?, pausa_ms? }`:

| `tipo` | qué hace |
|---|---|
| `fill`  | escribe `valor` en el campo `selector` (email, contraseña) |
| `click` | pulsa `selector` (el botón de entrar, aceptar cookies) |
| `wait`  | espera un `selector` (algo del área privada) o `ms` milisegundos |
| `scroll`| baja al fondo `veces` veces con `pausa_ms` (scroll infinito / lazy-load) |

Receta de login típica (portal B2B, precios tras entrar):
```json
{
  "url": "https://portal.mayorista.com/login",
  "pasos": [
    { "tipo": "click", "selector": "#aceptar-cookies" },
    { "tipo": "fill",  "selector": "input[name='email']",    "valor": "<EMAIL>" },
    { "tipo": "fill",  "selector": "input[name='password']", "valor": "<SECRETO>" },
    { "tipo": "click", "selector": "button[type='submit']" },
    { "tipo": "wait",  "selector": "a[href*='my-account']" }
  ]
}
```
Los **selectores reales** (nombre del campo, botón) se sacan **abriendo la página una vez** con
`leer` y mirando su markdown/HTML: no los adivines. El `wait` final confirma que entraste — sin él,
capturas la sesión antes de que el login cuaje.

### La jugada que gana en precios: INTERCEPTAR la API interna

La web pinta la tabla de precios llamando a **su propia API** (`fetch('/api/precios')`). En vez de
raspar el DOM renderizado, **captura ese JSON directamente** — más limpio y completo, a veces te
saltas el HTML entero:
```
POST /abrir { url, sesion, interceptar: { contiene: ["/api/", "/precio"] } }
   → { ..., intercepted: [ { url, status, json } ] }   // json = {producto, precio, stock} tal cual
```
`interceptar: true` captura TODO JSON; `{contiene:[...]}` filtra por subcadena de URL. Espera
`networkidle` para los XHR tardíos. **Para un catálogo con precios de coste, esto suele SER la
solución** (mejor que `extract_css` sobre el grid).

### Revelar contenido dinámico e imitar un cliente real

- **`interactuar`** (mismo guion de `pasos`) en `/abrir`: scroll infinito, "cargar más", pestañas,
  contenido tras un clic — lo que solo aparece con interacción.
- **`stealth: true`**: parche ligero que oculta `navigator.webdriver`/`plugins`/`chrome` + UA y
  locale realistas. Verificado: `navigator.webdriver` pasa de `true` a `undefined`.
- **`emular: { locale, timezone, geo:{latitude,longitude}, movil }`**: precios por región, versión
  móvil, geolocalización con permiso.
- **`proxy: { server, username?, password? }`**: salida por proxy (residencial cuando el sitio lo pide).

### Si la sesión caduca → re-login automático

El motor (marcha larga cableada en el CLI con `CRAWL4RS_LOGIN`) trae un **lazo**: cuando una
descarga "huele a sesión perdida" (**401** o **redirección al login**), **re-loguea, refresca la
celda de sesión y reintenta UNA vez** (sin bucles). No tienes que orquestarlo: si logueaste, el
volumen sobrevive a que la cookie expire.

### Honestidad (dos verdades que evitan atascarte)

1. **Anti-bot, sin promesas.** El stealth es ligero y honesto: **NO** promete pasar
   DataDome / PerimeterX / Cloudflare Turnstile — esos detectan por *comportamiento* y señales de
   *headless*. Si un portal los usa, hace falta residencial + ritmo humano, y **a veces no hay
   solución**. Dilo, no lo rodees inventando.
2. **Por qué puerta se alcanza HOY.** La marcha larga vive en el **wrapper**
   (`CRAWL4RS_PLAYWRIGHT_URL`: `/login`, `/abrir`), **no** en los verbos del bus: `crawl4rs.leer`/
   `.rastrear` van al **servidor axum**, cuyo `/crawl` **aún no acepta `sesion`/`login`/`interceptar`**
   (`{url, query, mode, max_depth, max_pages, extract_css, extract_semantic, extract_jsonld}`). Por
   eso **NO existe `crawl4rs.login.request`** — no lo llames, no hay handler (404). Cuando el caso
   pida login: monta la receta contra el **contrato del wrapper** de arriba; y si esa puerta aún no
   está asomada a tu turno, **nómbralo como el paso que falta** (asomar `sesion`/`login` al puente
   del bus) en vez de fingir que ya está. El motor lo tiene; asomarlo al bus es lo pendiente.

### Credenciales — nunca en claro

El `<SECRETO>` de la receta se rellena **en caliente**: léelo de **credential-manager**, no lo
escribas en la skill, ni en un log, ni en la receta guardada. La sesión capturada (`storageState`)
es igual de sensible que la contraseña — trátala como secreto, no la persistas suelta.

## Leer el error — la parte que evita rendirse

Si `status` no es 200, `error.message` trae la interpretación (y la prescripción del servidor):

- **503 `{degradado, motivo:'apagado'}`** → interruptor OFF. No es el motor: pide encenderlo.
- **503 `{degradado, motivo:'sin_servicio'}`** → el contenedor no responde. Verifica
  `curl http://127.0.0.1:8081/health`; si responde, fue transitorio → reintenta con backoff (4s, 8s).
- **504 `UPSTREAM_TIMEOUT`** → la página tardó más que `timeout_ms`. Reintenta una vez; si repite,
  baja el alcance (menos `max_pages` / URL más concreta).
- **4xx `INVALID_INPUT`** → corrige los argumentos (URL absoluta, query no vacía); no reintentes igual.
- Jamás concluyas "la web es inscrapeable" por UN fallo transitorio: el motor lleva navegador real
  — prueba una URL neutra (example.com); si esa va, es el destino frenándote, no el motor.

## Ritmo (el sitio destino puede frenarte)

Muchos sitios throttlean las ráfagas (verificado con soysuper: ~15-20 seguidos → 504). Uno a la
vez, con pausa (~2-4s). `rastrear` ya acota con `max_pages` — úsalo bajo. Un lote grande NO se
dispara de golpe: va por tandas, y si es mucho volumen, es trabajo de un **agente** (perspectiva-c
con throttle+retry), no de un turno de chat.

## Filosofía

La tool vive en segundo plano para que no encadenes primitivas a ciegas. Este skill te da el mapa
completo —los cuatro verbos, la marcha larga (login→sesión) para lo que hay tras contraseña, cómo
extraer, cómo interceptar la API, cómo leer el error, el ritmo— para que lo exprimas sin improvisar.
La tool es la mano; este skill, cómo moverla; el saber de cada caso (precios, imágenes de un catálogo
concreto) vive en su skill de dominio. Tú, con el mapa entero, montas el trabajo.
