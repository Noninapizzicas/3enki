# ESQUEMA — cara del JEFE del módulo `mise-en-place` (raíz, planificación-previa-al-servicio)

> Árbol maestro consolidado (pasadas 1-2). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente.
> El análisis es de la CARA DEL JEFE — la utilización (venta/atención en el POS)
> queda fuera del panel del jefe.

## 1. Quién es el jefe y qué decide

Dueño de la **planificación de la producción previa al servicio**: escalar las
recetas al volumen del día, publicar el plan de producción (qué receta en qué
franja con cuántas porciones) y consolidar la lista de compra. Store
json-per-project (`/mise-en-place.json` del proyecto: `planes[]`, `escalados[]`,
`compras[]`), persistido por fs vía el bus. El resto de la producción bebe el
plan publicado.

Decide — la tríada de declaración:
- **D1 — ESCALAR** (`escalado.calcular`): la receta a `porciones_destino`;
  `factor = destino/origen`; multiplica cada cantidad. Derivación transitoria
  para saber cuánto de cada ingrediente hará falta. NO toca la receta canónica.
- **D2 — el PLAN** (`plan.publicar`): LA DECLARACIÓN que la producción lee —
  líneas (receta × porciones × franja), horizonte desde/hasta. Nace `propuesto`.
- **D3 — la COMPRA** (`compra.calcular`): consolida la lista agregando los
  ingredientes ya escalados a lo largo de un horizonte por (ingrediente, unidad),
  con `merma_pct` opcional.

El jefe decide el FUTURO de la producción ("cuánto se cocina y se compra para
servir el volumen"); la venta/atención (POS) es cara de UTILIZACIÓN, fuera.

## 2. Invariantes (restricciones honestas, verificadas en código)

- INV1 — **el caller pasa los datos**: `escalado.calcular`/`compra.calcular`
  reciben `ingredientes`; el módulo NO lee cross-modulo. La UI trae las líneas
  de la receta por `recetas.*` (neutro) para escalarlas.
- INV2 — **escalar NO edita la receta**: solo persiste el resultado en
  `escalados[]` (histórico), nunca la receta canónica.
- INV3 — **el plan nace `propuesto`** y avanza por máquina cerrada
  (propuesto → aprobado → en_ejecucion → cerrado); transiciones ilegales →
  CONFLICT_STATE.
- INV4 — **el DICTAMEN viene en la respuesta** del escalado/compra/plan
  (201 con los datos calculados) y la señal pareada re-asienta la vista.
- INV5 — **compra.calcular no compra**: persiste el dictamen consolidado
  (`compras[]`), no una orden de compra.
- INV6 — **multi-tenant**: todo RPC lleva `project_id` (lo inyecta la capa de
  request de la UI — lección bug escandallo); el store vive por proyecto.
- INV7 — **señal-refresh**: tras declarar, la SEÑAL (nunca recarga) re-lee
  `planes.listar`/recetario.

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal de confirmación | Payload |
|---|---|---|
| `escalado.calcular` | `produccion.escalado.calculado` | { project_id, receta_id, porciones_origen, porciones_destino, factor, ingredientes_escalados } |
| `plan.publicar` | `produccion.plan.publicado` | { project_id, plan_id, horizonte_desde, horizonte_hasta, lineas } |
| `compra.calcular` | `produccion.compra.calculada` | { project_id, horizonte, recetas_consideradas, items } |
| plan.aprobar/ejecutar/cerrar | `produccion.plan.estado.avanzado` | { project_id, plan_id, desde, hacia, ... } |

Cadena: reflejo `_publicarEvento` (L587-611) → eventBus core → MQTT → frontend
dot-notation. Las lecturas (`plan.obtener`, `planes.listar`, `recetas.*`) NO
emiten señal — neutras.

## 4. Veredicto del árbitro (3/3) y composición de la vista

```
¿ESCRIBE en el plan de producción / lista de compra (via la tríada)? → JEFE
¿SE EJECUTA en el momento de la venta/atención?                      → UTILIZACION (fuera)
¿SOLO LEE estado o calcula?                                          → NEUTRO
```

- **jefe (3)**: `escalado.calcular`, `plan.publicar`, `compra.calcular` — la
  tríada de DECLARACIÓN.
- **neutro (lecturas)**: `planes.listar`, `plan.obtener`, `recetas.*` — informan
  (ref-select de receta y de plan).
- **motor/transiciones**: `retroplanning.calcular`, `agrupar_tandas`,
  `plan.aprobar/ejecutar/cerrar` — calculan/avanzan; no son la hoja primaria de
  este ciclo.

Composición del panel del jefe (3 capas):

```
1. SELECCIONAR  ref-select de receta (recetas.listar) + servicio/día (franja) —
                siempre desde el list, nunca libre
2. CALCULAR     editor-escalado: receta + porciones_origen/destino →
                escalado.calcular (ingredientes traídos de recetas.obtener).
                Tabla de escalado: cada ingrediente × factor para el volumen.
3. DECLARAR     plan.publicar: confirmador-nombrado — el plan que la producción
                lee (recetas, franjas, horizonte). compra.calcular: dictamen de
                lista de la compra agregando los escalados.
SEÑAL          produccion.*.calculado/publicado/calculada re-lee planes.listar
                (R3). NUNCA recarga.
```

(R1 frecuencia: escalar y publicar plan son lo que el jefe hace cada servicio;
el dictamen de compra es el cierre. R2 sin estado asumido — borradores desde la
lectura. R3 la señal manda + dictamen RPC. R4 transparencia de origen: la
receta viene de `recetas.*`, lo declarado por el panel.)

**Nota de rol**: los `ui.roles` existentes (escalado.calcular/plan.publicar/
compra.calcular=jefe; plan.obtener/planes.listar=neutro) se CONFIRMAN correctos.

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| Recetario (ref-select) | ref-select de receta (recetas.listar); trae lineas por recetas.obtener | recetas.listar/obtener | re-leída por la señal |
| Editor-escalado | inline-editor: receta + porciones_origen/destino | escalado.calcular { receta_id, porciones_origen, porciones_destino, ingredientes } | produccion.escalado.calculado |
| Tabla de escalado | tabla: cada ingrediente × factor para el volumen objetivo | (derivada del dictamen) | — |
| Plan de producción | confirmador-nombrado: recetas, franjas, horizonte | plan.publicar { plan_id?, horizonte_desde, horizonte_hasta, lineas } | produccion.plan.publicado |
| Dictamen de compra | dictamen de lista de la compra (items por ingrediente+unidad, cantidad_neta, merma) | compra.calcular { horizonte, recetas: [{ receta_id, porciones, ingredientes }] } | produccion.compra.calculada |
| Informe de planes | cinta-estado + lista de planes (planes.listar) | planes.listar | produccion.plan.publicado / plan.estado.avanzado |

## 6. Huecos [ABIERTO] — decisiones del dueño, se NOMBRAN (pasada-1 §5)

1. **Promover un escalado al plan**: hoy `plan.publicar` recibe las `lineas`
   explicitadas; no hay una op "escalar → plan" en el contrato — el panel arma
   las líneas del plan desde el escalado calculado.
2. **Retroplanning / agrupación-tanda UI**: `retroplanning.calcular` y
   `agrupar_tandas` existen en contrato (rol jefe/motor) pero no son la decisión
   primaria de este ciclo; se anotan para una pasada posterior.
3. **Merma en el escalado**: el escalado no aplica merma; solo `compra.calcular`
   la acepta por ingrediente — el panel usa 0 por defecto y deja el control para
   una versión posterior.

Huecos de CONTRATO (faltan campos/señales), no de CAPTURA: la UI no pide nada
que el módulo no soporte.
