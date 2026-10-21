# Pasada 4 — Consolidación con el método esquematizador-jefe (variantes v2)

> Ronda de CIERRE: el material de las pasadas 1-3 se revisa contra el método
> `esquematizador-jefe` (5 preguntas-jefe + lente-roles + formas UI canónicas +
> composición en 3 capas). No reescribe lo bueno: NOMBRA lo que faltaba y lo
> apunta a una forma. Suelo confirmado. Alimento principal: `logica-para-ui.txt`.

## Auditoría contra el método (qué ya estaba y qué faltaba)

| Pieza del método | Estado en pasadas 1-3 | Acción en esta pasada |
|---|---|---|
| SUJETO correcto (la cara del jefe, no el módulo) | ⚠️ pasada 1 prisaba el módulo entero (4 órganos) | **expuesta como composición 3 capas** |
| RESTRICCIONES con custodios | ✅ pasada 3 (la carta es el custodio; el módulo solo la LEE) | confirmada |
| CONTRATO con señal pareada | ⚠️ `carta.editada` aparece suelta, sin parear hoja a hoja | **pareada aquí abajo** |
| Formas UI canónicas | ⚠️ nombres libres ("mini-form", "vista de estado") | **mapeadas a los nombres canónicos** |
| Composición seleccionar→informarse→declarar | ❌ implícita (editor + vista) | **expuesta como composición** |
| Veredicto del árbitro por op (7) | ❌ doble cara descrita en prosa, sin veredicto por op | **tabla completa 7/7** |
| Huecos [ABIERTO] | ⚠️ huesos H1-H3 en logica-para-ui.txt sin marcar en el árbol | **señalados abajo, sin cerrar** |

## Las 5 preguntas-jefe, verdicto final

1. **IDENTIDAD** — el jefe DECIDE el futuro de las reglas de variación de un producto:
   qué se puede QUITAR, qué extras se ofrecen AÑADIR (y a qué precio), y el LÍMITE
   máximo. Son las 4 palancas: `permite_quitar[]`, `permite_anadir`,
   `max_ingredientes_extra`, `extras_sugeridos[{ingrediente_id, precio_extra?}]`.
2. **RESTRICCIONES** — el custodio (la CARTA) es la ÚNICA fuente: `configurar`
   delega en `carta.update_product`. El módulo no persiste nada propio (su estado
   es en-memory, repoblado en `project.activated` y en cada `carta.editada`).
3. **CONTRATO** — VER: `get` (reglas vigentes de un producto: quitables, extras,
   límite, opciones derivadas o de carta) + ref de producto `productos.carta_completa`
   (label nombre, value id). SEÑAL de confirmación de su declaración: `carta.editada`
   (gruesa, del custodio) — **no hay evento granular de reglas [ABIERTO H2]**.
   Nunca recarga: la señal reconfigura el módulo y la vista re-lee `get`.
4. **NO-OBJETIVOS** — la UTILIZACIÓN (POS: hoja de elección, OpcionesSheet, añadir/
   quitar al elegir) está COMPLETA y NO se toca. El motor es el juez: la UI estima,
   jamás fija precio (R4). El sistema (health/metrics) informa, no decide.
5. **PREGUNTAS_ABIERTAS** — ver [ABIERTO] abajo: lote (H1), señal granular (H2),
   permiso de edición. Se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente-roles) — 7/7 ops

Pregunta árbitro: ¿decide el FUTURO de las reglas (escribe en el custodio) → JEFE ·
¿sirve una decisión AHORA de venta → UTILIZACIÓN (POS, fuera) · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `configurar` | **JEFE** | LA PALANCA: declara las 4 reglas → delega en carta.update_product (custodio) → carta.editada reconfigura el módulo solo. Decide el futuro. |
| `evaluar` | **utilización** | el POS lo usa al elegir producto (valida+precia la selección del cliente) — FUERA del panel del jefe |
| `get` | neutro | reglas vigentes: alimenta la vista de estado |
| `validar` | neutro | dictamen de una variación concreta (alimenta el simulador) |
| `calcular_precio` | neutro | precio con extras (alimenta el simulador) |
| `health` | neutro (sistema) | estado del módulo — fuera del flujo |
| `metrics` | neutro (sistema) | contadores — fuera del flujo |

**El dualismo del módulo**: la cara UTILIZACIÓN ya existe y funciona de punta a punta
(OpcionesSheet → evaluar → motor → dictamen). Este análisis solo construye la del JEFE.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  — la entidad sobre la que decide: ref-select a productos.carta_completa
                  (label nombre, value id): ¿a qué producto le pongo o cambio reglas?
2. INFORMARSE   — variaciones.get: las 4 palancas vigentes de ese producto, con
                  transparencia de ORIGEN (declarado por el jefe vs derivado por el
                  sistema) [REQUISITO H3] · validar/calcular_precio alimentan el
                  simulador opcional (dictamen del motor, no cálculo de la UI)
3. DECLARAR     — variaciones.configurar: editor de las 4 palancas SIEMPRE vía
                  custodio · la señal (carta.editada) confirma, la vista nunca recarga
```

+ los principios transversales: frecuencia → jerarquía · la señal manda ·
el informe distingue lo declarado de lo derivado.

### Frecuencia → jerarquía

- El gesto diario del jefe es CONSULTAR qué rige hoy (selección → informe, en vista).
- La declaración de reglas es menos frecuente y multi-campo → `editor-bloque` (1 modal).
- El simulador es opcional: secundario al informe, no navegación principal.

## Formas UI canónicas (mapeo de la disección pasada-3)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Elegir producto (capa 1) | `ref-select` | ref `productos.carta_completa` (nombre→id) |
| Vista de reglas vigentes (Órgano 2) | `cinta-estado`/informe | `get` por producto; **transparencia declarado vs derivado [H3]** |
| Editor de reglas (Órgano 1) | `editor-bloque` | 1 modal con las 4 palancas: quitables (checkboxes sobre ingredientes del producto), permite_anadir (toggle), max (cifra), extras (lista con precio €). Sin fases |
| Simulador de reglas (validar/calcular_precio) | `cinta-estado` + dictamen | muestra el DICTAMEN del motor (R4: la UI estima, el motor es el juez) |
| TODAS las de declaración | `señal-refresh` | **pareada**: `carta.editada` (custodio, gruesa) + `catalogo.actualizado` si aplica |

Señales pareadas por hoja de declaración (regla: sin señal, hoja inmadura):

```
configurar (reglas de 1 producto) → carta.editada ✅ pero GRUESA: no dice QUÉ
                                    producto ni QUÉ palanca cambió [ABIERTO H2]
```

## Huecos (los de captura + los del sistema, sin cerrar)

1. **Editor de reglas** — `editor-bloque` con las 4 palancas + transparencia (H3)
2. **Vista de reglas vigentes** — informe de `get` con chips de origen

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (H1) **LOTE** — `configurar` es 1 producto por llamada: un jefe con 20 pizzas
  repite 20 veces. La UI NO lo implementa (un botón deshabilitado "lote: pendiente"
  basta); cerrarlo es decisión de dueño + operativa de lote en la carta.
- (H2) **Señal granular de reglas** — solo existe `carta.editada` gruesa; no hay
  `variacion.reglas_cambiadas {producto_id, delta}`. La vista funciona pareando
  `carta.editada` → re-lectura de `get`, pero no puede distinguir "cambiaron MIS
  reglas" de "cambió cualquier cosa de la carta".
- (H3) **Transparencia declarado vs derivado** — `get` mezcla ambas fuentes sin
  distinguirlas. No es un hueco opcional: es REQUISITO del informe del panel
  (el jefe debe ver qué escribió él y qué derivó el sistema).

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro arriba (7 claves, configurar=jefe, evaluar=utilizacion, resto neutro)
- `ui.flujo` jefe-PRIMERO: [jefe: configurar] → [consulta: get, validar, calcular_precio]
  (evaluar NO entra: es POS/UTILIZACIÓN · health/metrics fuera: sistema)
- ref de selects de producto: `productos.carta_completa` (ref_label nombre, ref_value id)
- nota de configurar: `editor-bloque` (las 4 palancas, 1 modal) + `señal-refresh` = carta.editada
- transparencia H3 como propiedad del informe: distinguir reglas del jefe vs derivadas