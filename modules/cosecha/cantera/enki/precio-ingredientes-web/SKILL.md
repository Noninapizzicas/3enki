---
name: precio-ingredientes-web
description: Saca precio, cantidad y formato de un ingrediente de la web (soysuper) cuando no está en Mercadona o su API falla, conduciendo los reflejos de crawl4rs (leer/buscar sobre el contenedor enki-crawl4rs). CONDUCE las herramientas deterministas; el precio SIEMPRE sale de la ficha real, nunca inventado. Reemplazo del API de Mercadona no oficial y frágil como fuente de coste para escandallo.
fuente: enki
dominio: escandallo
lente_dominio: escandallo
lente_tarea: costear
tags: [precio, ingrediente, escandallo, coste, crawl4rs, soysuper, web, scraping, leer, mercadona, supermercado]
---

# Precio de ingredientes desde la web (crawl4rs · soysuper)

> El API de Mercadona es de prestado y falla. soysuper.com es un comparador con ficha
> **pública** (precio promedio + €/kg, sin login). crawl4rs la lee y te devuelve la ficha
> en markdown limpio. El coste del escandallo deja de depender de una puerta ajena que se cae.

**Tesis:** el precio nace SIEMPRE de la ficha real. Ni el LLM ni el usuario lo ponen — se
extrae. Si la web no lo da, se dice `sin_precio` (nunca se inventa). Es el mismo mandato del
freno de escandallo (`PRECIO_INVENTADO` / fuente `estimado_llm` → rechazo).

## Cuándo usar

Al costear una receta y necesitar el precio/cantidad/formato de un ingrediente que **no está
en Mercadona** (producto de otra tienda, marca que Mercadona no tiene) o cuando **el API de
Mercadona falla**. NO para inventar un precio: si la web no lo da, marca `sin_precio` y sigue.

**Precondición:** interruptor `crawl4rs` (grupo sistema) ON. Si está OFF, toda llamada responde
`503 {degradado, motivo:'apagado'}` — es la puerta cerrada, no un fallo: pide encenderlo.

## Contrato (JSON)

```json
{
  "entrada": { "ingrediente": "String", "url_soysuper?": "String (si ya la conoces)" },
  "salida": {
    "nombre": "String", "marca": "String|null",
    "cantidad": "String (ej. '3 kg')", "formato": "String (ej. 'garrafa')",
    "precio_eur": "Number|null", "precio_unitario": "String (ej. '5,65 €/kg')|null",
    "fuente": "'soysuper'", "url": "String",
    "estado": "'ok' | 'sin_precio'"
  }
}
```

## Cómo se INVOCA (autocontenido — NO curl por ejecutor)

crawl4rs vive en el bus; lo llamas con la tool universal que ya tienes, `bus.publishAndWait`:

```
res = bus.publishAndWait('crawl4rs.leer.request', { url: 'https://…' })
res.data.markdown        // con status 200, la página en markdown limpio
```

**NUNCA** curlees el contenedor por el `ejecutor` — pierdes el token JWT encapsulado y el
mensaje interpretado del fallo. Si `status` no es 200, lee `error.message` y sus `details`
(`{degradado, motivo}`) antes de concluir nada. (Detalle general: skill `leer-web`.)

## Mecanismo (pseudocódigo — CONDUCE los reflejos de crawl4rs)

```
FUNCION precioIngredienteWeb(ingrediente, url_soysuper?): FichaPrecio {
  // 1 · LOCALIZAR la ficha. VERIFICADO EN VIVO (era de fastcrw, la física del sitio no cambia):
  //     NO adivines el slug — /p/<inventado> devuelve una página vacía (404, sin precio).
  //     El descubrimiento FIABLE es LEER /search: la markdown trae los enlaces /p/ de los
  //     productos que matchean. crawl4rs además lleva navegador real (modo auto): si /search
  //     carga por JS, escala solo — sin timeout estructural.
  url ← url_soysuper
  SI !url:
      res ← bus.publishAndWait('crawl4rs.leer.request', { url: `https://soysuper.com/search?q=${encode(ingrediente)}` })
      // si status 504/throttle: reintenta con backoff; solo tras agotarlo → sin_precio
      fichas ← extraerLinks(res.data.markdown, /\/p\/[a-z0-9-]+/)   // los /p/<slug> de la markdown
      url ← elegirMejor(fichas, ingrediente)          // TÚ (LLM) casas nombre/marca/formato/tamaño
      SI !url: RETORNA { estado: 'sin_precio' }        // sin match razonable → honesto (no fuerces)

  // 2 · TRAER la ficha con crawl4rs.leer (markdown limpio, determinista — el motor no usa LLM).
  res ← bus.publishAndWait('crawl4rs.leer.request', { url })
  // si status 504/UNREACHABLE: reintenta con backoff; tras agotarlo → sin_precio

  // 3 · EXTRAER tú (LLM de página) de la markdown. La ficha trae la línea canónica:
  //     "Precio medio 16,94 € / 3 kg   5,65 € / 1 kg"  → precio · cantidad · precio_unitario.
  //     Es SOLO leer lo que está escrito, NO inventar (si la línea no está → sin_precio).
  ficha ← leerDeMarkdown(res.data.markdown)   // { nombre, marca?, cantidad, formato?, precio_eur, precio_unitario }

  // 4 · NORMALIZAR al contrato de escandallo (NO inventar)
  SI ficha.precio_eur == null:
      RETORNA { ...ficha, fuente: 'soysuper', url, estado: 'sin_precio' }
  RETORNA { ...ficha, fuente: 'soysuper', url, estado: 'ok' }
}

// Atajo determinista opcional: crawl4rs.leer acepta extract_css ({campo:'selector'} y ::attr(...))
// y extract_semantic:true → data.extraido llega YA estructurado, sin LLM en ningún lado. Útil
// cuando los selectores de la ficha son estables; el camino markdown+leer no depende de ellos.
```

## Pasos

1. **Descubre por `/search`, NO adivines el slug** (verificado: `/p/<inventado>` → 404 vacío). `bus.publishAndWait('crawl4rs.leer.request', {url:'https://soysuper.com/search?q=<ingrediente>'})` → `data.markdown` con los enlaces `/p/<slug>` de los productos que matchean. Si ya tienes la URL de ficha, salta al paso 3.
2. **Elige tú la mejor ficha** de esos `/p/<slug>` casando nombre/marca/formato/tamaño con el ingrediente. Sin match razonable → `sin_precio` (no fuerces).
3. **`bus.publishAndWait('crawl4rs.leer.request', {url})`** de la ficha elegida → `data.markdown` (determinista, el precio viene en texto). NO curl por ejecutor.
4. **Lee tú el precio de la markdown** (eres el LLM de página): busca `Precio medio X,XX € / <cantidad>  Y,YY € / 1 kg`. Saca `{nombre, cantidad, precio_eur, precio_unitario}`. Es LEER, no inventar.
5. Normaliza a `{precio_eur, cantidad, formato, precio_unitario, fuente:'soysuper', url}`.
6. **Guard no-inventar:** si la línea de precio no está, o `crawl4rs.leer` dio `UPSTREAM_TIMEOUT`/`UNREACHABLE` tras los reintentos → `estado: 'sin_precio'`. Jamás rellenes el precio de tu cabeza.
7. Entrega la ficha a escandallo como fuente de coste (misma forma `{precio, cantidad, formato}`).

## Herramientas que conduce

Vía el skill genérico **`leer-web`** (el canal correcto — `bus.publishAndWait`, NO curl
por ejecutor). Léelo si dudas cómo invocar:

- `bus.publishAndWait('crawl4rs.leer.request', {url})` — leer la búsqueda o la ficha de soysuper (markdown).
- `bus.publishAndWait('crawl4rs.buscar.request', {query})` — búsqueda web general (SearXNG detrás del servidor), por si soysuper no da match.

Requieren el contenedor `enki-crawl4rs` corriendo (`:8081`; ver `deployment/crawl4rs/`) y el
interruptor `crawl4rs` ON. Un `504`/throttle NO es `sin_precio` definitivo → reintenta con
backoff; solo tras agotarlo, `sin_precio`.

## Ritmo — soysuper throttlea las ráfagas (VERIFICADO en vivo)

Soysuper **bloquea tras ~15-20 requests seguidos**: empieza a devolver `504`/timeout aunque la
ficha exista y el motor esté sano (comprobado: example.com sigue dando 200 mientras soysuper
504-ea). NO es fallo del motor; es el sitio protegiéndose. Mandato:

- **UN ingrediente a la vez, con pausa** entre llamadas (≈2-4 s). Jamás dispares el lote de golpe.
- **`504`/timeout = transitorio, no `sin_precio` definitivo**: reintenta con backoff (4 s, 8 s); si
  persiste, marca `sin_precio` y **sigue con el siguiente** (no bloquees el escandallo entero).
- **Cachea**: escandallo persiste el precio en la sub-receta del ingrediente. Un ingrediente ya
  con precio NO se vuelve a pedir. La carta comparte ingredientes (masa/tomate/mozzarella en casi
  todas) → costear 31 pizzas son ~39 fichas ÚNICAS, no cientos. Pídelas una vez.
- Un lote grande (39 ingredientes) es trabajo de **obrero paciente**, no de un turno: si la página
  se satura, va por tandas. (Aquí encaja un agente perspectiva-c con throttle+retry, si se escala.)

## Filosofía

El precio público de soysuper es un **promedio** (la ficha lo avisa). Basta para escandallar;
el precio exacto por súper y código postal pide cuenta y queda fuera de esta skill. El mandato
que no se negocia: la fuente es la web real o es `sin_precio` — la coherencia del coste depende
de que el precio no sea una invención.
