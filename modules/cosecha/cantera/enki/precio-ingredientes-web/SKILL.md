---
name: precio-ingredientes-web
description: Saca precio, cantidad y formato de un ingrediente de la web (soysuper) cuando no está en Mercadona o su API falla, usando las tools de fastcrw (extract/scrape sobre crw-server). CONDUCE las herramientas deterministas; el precio SIEMPRE sale de la ficha real, nunca inventado. Reemplazo del API de Mercadona no oficial y frágil como fuente de coste para escandallo.
fuente: enki
dominio: escandallo
lente_dominio: escandallo
lente_tarea: costear
tags: [precio, ingrediente, escandallo, coste, fastcrw, soysuper, web, scraping, extract, mercadona, supermercado]
---

# Precio de ingredientes desde la web (fastcrw · soysuper)

> El API de Mercadona es de prestado y falla. soysuper.com es un comparador con ficha
> **pública** (precio promedio + €/kg, sin login). fastcrw lo lee y te devuelve la ficha
> estructurada. El coste del escandallo deja de depender de una puerta ajena que se cae.

**Tesis:** el precio nace SIEMPRE de la ficha real. Ni el LLM ni el usuario lo ponen — se
extrae. Si la web no lo da, se dice `sin_precio` (nunca se inventa). Es el mismo mandato del
freno de escandallo (`PRECIO_INVENTADO` / fuente `estimado_llm` → rechazo).

## Cuándo usar

Al costear una receta y necesitar el precio/cantidad/formato de un ingrediente que **no está
en Mercadona** (producto de otra tienda, marca que Mercadona no tiene) o cuando **el API de
Mercadona falla**. NO para inventar un precio: si la web no lo da, marca `sin_precio` y sigue.

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

## Mecanismo (pseudocódigo — CONDUCE las tools de fastcrw)

```
FUNCION precioIngredienteWeb(ingrediente, url_soysuper?): FichaPrecio {
  // 1 · LOCALIZAR la ficha. CLAVE (verificado en vivo): la FICHA /p/<slug> está
  //     SERVER-RENDERED → extract va rápido y limpio, sin JS. La BÚSQUEDA /search
  //     es JS-pesada → crw-server SIN render (CDP) le da TIMEOUT. Ataca por la ficha.
  url ← url_soysuper
  SI !url:
      // preferente: si sabes el slug, constrúyelo (p.ej. 'mozzarella-rallada-mercadona')
      url ← `https://soysuper.com/p/${slug(ingrediente)}`   // ficha directa (rápida)
      // solo si necesitas descubrir: /search es FRÁGIL (timeout sin CDP). Si peta,
      // NO lo trates como éxito → pide la URL de ficha o marca sin_precio.
      SI dudoso(url):
          md ← fastcrw.scrape({ url: `https://soysuper.com/search?q=${encode(ingrediente)}` })
          url ← primeraFichaDe(md)        // primer /p/<slug>; si timeout/vacío → sin_precio
      SI !url: RETORNA { estado: 'sin_precio', ... }   // no hay ficha → honesto

  // 2 · TRAER la ficha con fastcrw.scrape (markdown). CLAVE (verificado en vivo): usa
  //     SCRAPE, no extract. El `extract` (json) de crw-server necesita un LLM configurado
  //     dentro del servidor (422 si no) — y ese LLM ya lo tienes TÚ, el de página. scrape
  //     es determinista, sin LLM, y la ficha ya trae el precio en texto.
  md ← fastcrw.scrape({ url })            // markdown de la ficha (sin LLM en crw-server)
  SI md == UPSTREAM_*:  RETORNA { estado: 'sin_precio', url }   // motor caído/timeout → honesto

  // 3 · EXTRAER tú (LLM de página) de la markdown. La ficha trae la línea canónica:
  //     "Precio medio 16,94 € / 3 kg   5,65 € / 1 kg"  → precio · cantidad · precio_unitario.
  //     Es SOLO leer lo que está escrito, NO inventar (si la línea no está → sin_precio).
  ficha ← leerDeMarkdown(md)              // { nombre, marca?, cantidad, formato?, precio_eur, precio_unitario }

  // 4 · NORMALIZAR al contrato de escandallo (NO inventar)
  SI ficha.precio_eur == null:
      RETORNA { ...ficha, fuente: 'soysuper', url, estado: 'sin_precio' }
  RETORNA { ...ficha, fuente: 'soysuper', url, estado: 'ok' }
}

// Atajo opcional: fastcrw.extract({url, schema}) devuelve el JSON ya estructurado en UN paso,
// PERO exige [extraction.llm] en la config de crw-server (o llmApiKey en el body). Sin eso da
// 422. El camino scrape+leer de arriba NO necesita nada extra: úsalo por defecto.
```

## Pasos

1. **Ataca por la FICHA, no por la búsqueda.** La ficha `soysuper.com/p/<slug>` está server-rendered. Si tienes/deduces el slug, ve directo al paso 2.
2. **`fastcrw.scrape({url})`** de la ficha → markdown (determinista, sin LLM en crw-server; verificado en vivo que devuelve el precio).
   - Solo si necesitas descubrir la ficha: `fastcrw.scrape` de `/search?q=…`. **Aviso: `/search` es JS-pesado → timeout sin render (CDP).** Si tarda/vacío → pide la URL o `sin_precio`.
3. **Lee tú el precio de la markdown** (eres el LLM de página): busca la línea `Precio medio X,XX € / <cantidad>  Y,YY € / 1 kg`. Saca `{nombre, cantidad, precio_eur, precio_unitario}`. Es LEER, no inventar.
4. Normaliza a `{precio_eur, cantidad, formato, precio_unitario, fuente:'soysuper', url}`.
5. **Guard no-inventar:** si la línea de precio no está, o `fastcrw.scrape` dio `UPSTREAM_TIMEOUT`/`UNREACHABLE` → `estado: 'sin_precio'`. Jamás rellenes el precio de tu cabeza.
6. Entrega la ficha a escandallo como fuente de coste (misma forma `{precio, cantidad, formato}`).

> `fastcrw.extract` (json en un paso) existe pero pide un LLM configurado DENTRO de crw-server
> (`[extraction.llm]` o `llmApiKey`); sin él, 422. El paso 2–3 (scrape + tú lees) no necesita nada
> extra y usa el LLM que ya está en el turno. Ese es el camino por defecto.

## Herramientas que conduce

- `fastcrw.scrape` — leer la página de búsqueda de soysuper (markdown) para hallar la ficha.
- `fastcrw.extract` — sacar el JSON estructurado de la ficha (precio/cantidad/formato).

Requieren `crw-server` corriendo (nativo, `:3002`; ver `deployment/fastcrw/`). Si está caído,
las tools devuelven `UPSTREAM_UNREACHABLE` → trátalo como `sin_precio`, no como éxito.

## Filosofía

El precio público de soysuper es un **promedio** (la ficha lo avisa). Basta para escandallar;
el precio exacto por súper y código postal pide cuenta y queda fuera de esta skill. El mandato
que no se negocia: la fuente es la web real o es `sin_precio` — la coherencia del coste depende
de que el precio no sea una invención.
