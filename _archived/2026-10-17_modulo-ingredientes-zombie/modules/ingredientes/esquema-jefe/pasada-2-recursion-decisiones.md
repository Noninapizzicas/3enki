# Pasada 2 — recursión: prisar D1, D2, D3 y las lecturas hasta hojas atómicas

> Bajo cada decisión del prisma (pasada 1) hasta hojas que el agente de UI puede
> DIBUJAR directamente. Ley {atómico, abierto, repetido} + umbral de atómico-UI.
> Lo que aún describe "una experiencia" vuelve a prisarse en la pasada 3.

## D1 — corregir FICHA de un ingrediente (`update`)

```
D1 ═══ "corregir ingrediente" (aún es una experiencia)
 ├─ elegir CUÁL ingrediente tocar
 │   └─ hoja: seleccionar de la lista del catálogo (list ya trae la ficha completa)
 ├─ corregir NOMBRE
 │   └─ hoja: campo de texto en la ficha — no hay regla de negocio, solo escritura
 ├─ corregir/correr FAMILIA
 │   └─ hoja: campo de texto con valor actual visible (familia canónica v2;
 │             sin catálogo cerrado de familias en código → texto libre)
 ├─ declarar ALÉRGENOS
 │   ├─ hoja: conmutar es_alergeno (bool)
 │   └─ hoja: editar lista alergenos[] (etiquetas; `alergenos` op muestra los
 │            tipos ya usados por el catálogo → chips sugeridos)
 └─ (precio suelto también cabe en update, PERO su gesto natural es el inline
     de D2 — ver regla de frecuencia abajo)
```

## D2 — precios en LOTE (`update_precios`) y el gesto suelto

```
D2 ═══ "retar precios cuando suben costes" (aún es una experiencia)
 ├─ hoja: decidir el ALCANCE del lote (toda la vista · un grupo · filtrado por
 │        búsqueda) — el filtro del handler soporta id|tipo|grupo; el alcance
 │        por selección de BÚSQUEDA se resuelve en UI iterando la llamada
 │        por ingrediente visible... NO: una llamada por fila viola "el lote
 │        natural del jefe". Hoja corregida abajo → editor de lote solo
 │        grupo/católogo completo (native), y por-fila el update individual.
 ├─ hoja: fijar NUEVO PRECIO fijo del lote (€, una cifra para todos) —
 │        caso "igualar a coste de proveedor"
 ├─ hoja: aplicar PORCENTAJE (+/- %) — caso "subida general del 5%" —
 │        ADVERTENCIA visible: compuesto sobre el valor vigente de cada uno
 └─ hoja: dictamen del lote — la respuesta trae actualizados[]{id,nombre,anterior,nuevo}
          y llegan N señales ingrediente.actualizado (uno por ingrediente)
```

## D3 — alérgenos (va dentro de D1, ya prisma)

D3 es hoja en D1 (conmutar es_alergeno + lista alergenos[]). Sin recursión extra.

## Lecturas (neutras) que Alimentan — prisadas

```
INFORMARSE ═══
 ├─ hoja: cinta de estado del catálogo (health.catalogo: total, alergenos,
 │        por_tipo, por_grupo) — agregados que abren la decisión
 ├─ hoja: lista del grupo con precio vigente visible (list por grupo)
 ├─ hoja: buscar ingrediente por nombre (search / o filtro local sobre list)
 └─ hoja: pulso de alérgenos del catálogo (alergenos.por_tipo)
```

## Regla de FRECUENCIA → JERARQUÍA (de la pasada 1 a la UI)

- El gesto 10×/día del jefe aquí es **cambiar un precio** → inline-gesture
  (toque sobre la cifra → editar → Enter), con eco del anterior.
- La corrección de ficha (nombre/familia/alérgenos) es rara → editor-bloque
  (un modal/panel multi-campo, no fases).
- La subida de costes es episódica pero GRUESA → editor de LOTE (vista tabla).

## Hojas que SALEN del árbol del jefe (marcadas y extraídas)

- El consumo de ingredientes al elegir/configurar producto (motor-opciones).
- La siembra del catálogo (carta-manager, menu-generator).
- Ningún flujo de venta entra en el panel del jefe.