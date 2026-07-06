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
  // 1 · LOCALIZAR la ficha (si no te la dan, descúbrela; NO adivines URLs)
  url ← url_soysuper
  SI !url:
      md ← fastcrw.scrape({ url: `https://soysuper.com/search?q=${encode(ingrediente)}` })
      url ← primeraFichaDe(md)            // primer /p/<slug> del resultado
      SI !url: RETORNA { estado: 'sin_precio', ... }   // no hay ficha → honesto

  // 2 · EXTRAER estructurado con esquema (fastcrw.extract → data.json)
  ficha ← fastcrw.extract({ url, schema: {
    type: 'object',
    properties: {
      nombre: { type: 'string' }, marca: { type: 'string' },
      cantidad: { type: 'string' }, formato: { type: 'string' },
      precio_promedio_eur: { type: 'number' }, precio_unitario: { type: 'string' }
    }
  }})

  // 3 · NORMALIZAR al contrato de escandallo (NO inventar)
  SI ficha.precio_promedio_eur == null:
      RETORNA { ...ficha, fuente: 'soysuper', url, estado: 'sin_precio' }
  RETORNA {
    nombre: ficha.nombre, marca: ficha.marca ?? null,
    cantidad: ficha.cantidad, formato: ficha.formato,
    precio_eur: ficha.precio_promedio_eur, precio_unitario: ficha.precio_unitario ?? null,
    fuente: 'soysuper', url, estado: 'ok'
  }
}
```

## Pasos

1. Si tienes la URL de soysuper (`soysuper.com/p/<slug>`), ve directo al paso 3.
2. Si no, `fastcrw.scrape` la búsqueda de soysuper y coge la primera ficha `/p/…`. Si no hay ninguna → `sin_precio`.
3. `fastcrw.extract` sobre la ficha con el esquema de arriba.
4. Normaliza a `{precio_eur, cantidad, formato, precio_unitario, fuente:'soysuper', url}`.
5. **Guard no-inventar:** si `precio_promedio_eur` viene vacío → `estado: 'sin_precio'`. Jamás rellenes el precio de tu cabeza.
6. Entrega la ficha a escandallo como fuente de coste (misma forma `{precio, cantidad, formato}`).

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
