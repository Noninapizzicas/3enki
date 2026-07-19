---
name: prisma-compuestos
description: El KNOW-HOW para dar de alta y costear COMPUESTOS (formulaciones/recetas) de prisma — la cadena insumo → compuesto → coste, prisma-pura (todo en /prisma/**, cero pizzepos). Reconcilia insumos antes de crear (typo/idioma/sinónimo), modela la formulación en refs+cantidades, cuesta RECETA A RECETA (nunca en bloque), y ante un dato ausente AVISA o PREGUNTA (nunca inventa). El LLM conduce; los reflejos (custodios) guardan.
when-to-use: Cuando entra una FORMULACIÓN (texto-receta, foto, CSV de recetas, alta de materia prima) y hay que darla de alta como compuesto/insumo y costearla. NO para producto de venta / precio de cliente / opciones (eso es parcela vecina). NO para coste REAL con facturas (eso es fase 2, post-venta).
fuente: enki
dominio: comercio
lente_dominio: prisma
lente_tarea: componer-compuesto
tags: [prisma, compuesto, insumo, receta, coste, formulacion, reconciliar, biblioteca, reflejo, blueprint, fase-1]
---

# Prisma · COMPUESTOS — dar de alta y costear formulaciones

> Parcela: **insumo → compuesto → COSTE. FIN.** Ni producto, ni venta, ni precio de cliente.
> Si aparece "precio de venta / opciones / cliente" → te saliste de la parcela.
>
> Referencia técnica viva: `arquitectura/decisiones/propuestas/prisma-compuestos.md` (el guión completo).
> El LLM (actor) conduce lo fuzzy; los REFLEJOS (tramoya) guardan y calculan. Tú NO tocas fs.

## Espinazo — 6 fases

```
LEER  → RECONCILIAR (paso 0) → MODELAR → GUARDAR → COSTEAR (de a una) → AVISAR/PREGUNTAR
```

## LEER — la forma decide el nivel

```
¿trae CANTIDADES (g·ml·hojas) sin precio de venta?  → COMPUESTO  (formulación)     ← lo tuyo
¿materia suelta con su precio de compra?            → INSUMO     (materia prima)    ← lo tuyo
¿precio de VENTA + categoría + opciones?            → PRODUCTO   (venta)            ← NO tuyo, ignóralo
```

## PASO 0 · RECONCILIAR insumos ANTES de crear (limpieza de biblioteca)

Lo PRIMERO: por cada componente extraído, reconócelo contra la biblioteca `/prisma/insumos/`.
Sin esto la biblioteca se llena de duplicados y el anti-cuello se rompe.

```
POR CADA componente:
  insumos.buscar(nombre)                              // el reflejo da candidatos
  match EXACTO                    → usa su id
  typo / mayúsculas / plural      "mozarella"≈"mozzarella" · "Olivas"→"oliva"   → propone el existente
  otro idioma / sinónimo          "tomate"/"tomato" · "aceituna"≈"oliva"        → match por concepto
  AMBIGUO (¿variante o el mismo?) "tomate" vs "tomate frito" vs "tomate seco"
                                  → NO fusiones a la ligera: PREGUNTA, el humano confirma (anti-wipe)
  genuinamente nuevo              → insumos.crear(nombre, …)  → id canónico

RESULTADO: cada componente resuelto a un id CANÓNICO. El compuesto guarda ESE id, no un duplicado.
```

## MODELAR — el compuesto es refs + cantidades (NUNCA embebe el insumo)

```json
// /prisma/compuestos/<id>.json
{ "id": "...", "nombre": "Pizza Samba",
  "componentes": [ { "ref": "<insumo|compuesto_id canónico>", "cantidad": 315, "unidad": "g" }, ... ],
  "clasificacion_ref": { "familia": "...", "subfamilia": "...", "grupo": "..." }   // eje FABRICACIÓN
}
// un componente puede ser OTRO compuesto (sub-mezcla: masa, salsa) → recursivo, sin límite
```

## GUARDAR — por los custodios (tú propones, ellos escriben)

```
insumos.crear / insumos.actualizar        ⇒ compuestos-manager?  NO → insumos-manager escribe /prisma/insumos/<id>.json
compuestos.crear / compuestos.actualizar  ⇒ compuestos-manager escribe /prisma/compuestos/<id>.json
// TÚ nunca tocas fs. El custodio es el único que escribe (fs.write atómico).
```

## COSTEAR — RECETA A RECETA (el camino sano)

```
INGESTA: de a una O en tanda (las dos valen).
PROCESO: la tanda se PARTE en unidades. Costeo = 1 compuesto : 1 cálculo : 1 evento. NUNCA en bloque.
  (la lección del POS: "todo de golpe" → timeout. Una a una: fallo aislado, progreso visible, reintentable.)

  PARA CADA compuesto de la cola:
    costeador.costear(compuesto_id)   // reflejo: Σ (precio_insumo × cantidad), recorre refs
    → emite compuesto.coste.calculado { compuesto_id, coste_unidad }

CASCADA: cambia el precio de un insumo → re-costea SOLO los compuestos que lo usan, también de a una.
  (aquí el anti-cuello se vuelve real: un precio, un sitio, propaga.)
```

## AVISAR / PREGUNTAR — dato ausente NUNCA se inventa

```
FALTA un dato OBJETIVO (unidad, cantidad, un insumo sin precio de referencia):
   → márcalo pregunta_abierta  Y  AVISA en claro qué falta ("Samba: albahaca sin cantidad")
FALTA un dato PRIVADO (tu coste real, tu tarifa):
   → queda ABIERTO; solo entra por la puerta MANUAL/chat. No lo estimes como si fuera real.
DATO AMBIGUO (reconciliación dudosa, variante):
   → PREGUNTA antes de decidir. El humano confirma.

REGLA: prefieres un compuesto con huecos NOMBRADOS a uno completo INVENTADO.
       las preguntas_abiertas SON el onboarding: dicen exactamente qué falta para cerrar el coste.
```

## Coste por FASES (no metas facturas en el arranque)

```
FASE 1 (ahora)   coste ESTIMADO: insumo con precio de REFERENCIA (web) o manual. Arranca ligero, sistema vivo.
FASE 2 (después) coste REAL post-venta: compras reales × producto vendido. Otra parcela, otro momento.
FACTURA          NO es requisito de fase 1, pero la puerta queda ABIERTA/oportunista: si un albarán de un
                 insumo cae, se reconcilia igual y su coste real gana sobre la referencia (regla de fuente).
```

## Anti-patrones

```
· crear un insumo sin reconciliar → biblioteca duplicada (mozzarella ×5) → anti-cuello roto. JAMÁS.
· costear la tanda en bloque       → timeout (el fallo del POS). Siempre de a una.
· inventar un dato ausente         → prohibido; márcalo abierto y AVISA.
· meter el insumo DENTRO del compuesto → NO; siempre por ref (compartido, cambia en un sitio).
· tocar producto/venta/opciones    → fuera de parcela. Emite el coste y para.
```

## LA TRAMOYA que esta skill conduce (reflejos — build-list, mirando adelante)

```
[POR CREAR]  insumos-manager      custodio /prisma/insumos/     · buscar·crear·actualizar·get·list   (+ .versions)
[POR CREAR]  compuestos-manager   custodio /prisma/compuestos/  · crear·actualizar·get·list·resolver  (+ .versions)
[POR CREAR]  costeador prisma     costear(compuesto_id) → Σ refs → emite compuesto.coste.calculado (receta a receta)
[EXISTE→adaptar] puente-compuesto (ex-recetario) → escucha compuesto.coste.calculado (prisma, ya NO escandallo)
[EXISTE]     adaptador           el actor: crudo → molde (esta skill lo guía)

LOOP de costeo: un code.orquestar (o el rail de estados) itera la cola → costear de a una → sin bloque.
```

## Filosofía (una frase)

El compuesto es una biblioteca de formulaciones que vive sola, se referencia por partes, se cuesta de
a una, y nunca inventa: lo que no sabe, lo pregunta. La skill piensa; el reflejo guarda y suma.
