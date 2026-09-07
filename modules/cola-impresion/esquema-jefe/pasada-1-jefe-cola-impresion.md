# Pasada 1 — Esquematizador-Jefe (cola-impresion v2)

> SUJETO correcto: **la cara del ROL JEFE de cola-impresion** — NO el módulo entero.
> Cola-impresion es un CUSTODIO (reflejo JS) single-writer de la cola de impresión
> del taller (SPARKX i7, una pieza a la vez). La cola NO es FIFO simple: un motor de
> ordenación (`_ordenar`) puntúa cada pieza pendiente con variables — material ·
> urgencia · tamaño · tiempo — y las variables se AJUSTAN CON EL USO (al extraer una
> pieza, su material pasa a ser el "cargado" y gana prioridad para evitar cambios de
> filamento). La cola NUNCA decide qué imprimir (invariante 6): solo ordena lo aprobado.
>
> Método: `esquematizador-jefe` (prisma de 5 huecos + lente-roles + formas UI canónicas).

## Alimento (informer al prisma)

| Inyecto | De dónde sale | Hueco que llena |
|---|---|---|
| Eventos del módulo (publica/escucha) | module.json + index.js | CONTRATO |
| Handlers mapeados a necesidades del jefe | index.js (onEntrar/onSiguiente/onReordenar/onLongitud) | IDENTIDAD |
| Invariantes (single-writer, motor, no decide) | module.json `_doc` + index.js | RESTRICCIONES |

## Las 5 preguntas-jefe

1. **IDENTIDAD** — ¿Qué DECIDE el jefe aquí? El jefe NO imprime (eso lo decide el
   operador al extraer). El jefe DECIDE **qué entra en la cola** (`entrar`: mete una
   pieza aprobada, valida catálogo + no duplicado) y **en qué orden queda** (`reordenar`:
   sube/baja una pieza pendiente a una posición). El panel-jefe de cola-impresion es un
   **GESTOR DE LA COLA**: declara el contenido y el orden de lo aprobado.

2. **RESTRICCIONES** — el custodio es el MÓDULO (single-writer vía PosPersistencia por
   proyecto). La cola NUNCA decide qué imprimir (invariante 6): solo ordena lo aprobado.
   El motor de ordenación (`_ordenar`) es proyección interna con pesos ajustables con el
   uso (material cargado se actualiza en cada extracción). `entrar` valida catálogo por
   RPC (`catalogo.obtener.request`, best-effort) y rechaza duplicados (409 ALREADY_EXISTS).
   `reordenar` solo opera sobre piezas `pendiente` (409 CONFLICT_STATE si no). El juez del
   orden es el MÓDULO, no la UI.

3. **CONTRATO** — VER: `cola.longitud` (pendientes + total) da el pulso de la cola.
   SEÑALES de confirmación (verificadas en index.js): `entrar` → `cola.entrada` (o
   `cola.entrar.failed`), `reordenar` → `cola.reordenada`, `siguiente` → `cola.extraccion`
   (o `cola.vacia`). El refresco parea [vista→señal]: la vista re-lee, NUNCA recarga.

4. **NO-OBJETIVOS** — la UTILIZACIÓN (`siguiente`: el operador extrae la siguiente pieza
   según el motor al momento de imprimir) es la cara de consumo, fuera del panel-jefe.
   El sistema (longitud/estado) informa, no decide. El motor de ordenación es interno,
   no se configura desde la UI (los pesos se ajustan con el uso, no por captura del jefe).

5. **PREGUNTAS_ABIERTAS** — ver [ABIERTO] abajo; se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente-roles) — 4/4 ops

Pregunta árbitro: ¿decide el FUTURO de la cola (declara qué entra y en qué orden) → JEFE ·
¿sirve una decisión AHORA de impresión al elegir → UTILIZACIÓN · ¿solo informa → NEUTRO?

| Op | Veredicto | Por qué |
|---|---|---|
| `entrar` | **JEFE** | Declara qué pieza aprobada entra en la cola (valida catálogo + no duplicado). La decisión de ARRANCAR el contenido de la cola. |
| `reordenar` | **JEFE** | Edita el orden de las piezas pendientes (sube/baja a una posición). La decisión de PRIORIDAD del jefe. |
| `siguiente` | utilizacion | El operador extrae la siguiente pieza según el motor AL IMPRIMIR. Consumo al elegir — fuera del panel-jefe. |
| `longitud` | neutro | Estado de la cola (pendientes + total). Alimenta la cinta-estado, no decide. |

**La dualidad, en una línea**: el jefe DECLARA qué entra y en qué orden (entrar/reordenar);
el operador CONSUME al imprimir (siguiente); la longitud informa (neutro).

## Composición de la vista del jefe (3 capas) — GESTOR DE LA COLA

```
1. SELECCIONAR  — la pieza sobre la que decide: ref a la cola (longitud + lista de
                  pendientes). La cinta ES el selector natural: tocar la tarjeta de la pieza.
2. INFORMARSE   — longitud (pendientes + total) + el material cargado actual (para saber
                  qué prioriza el motor). cinta-estado "n pendientes · material cargado X".
3. DECLARAR     — las ÚNICAS escrituras del jefe: entrar (nueva pieza aprobada) y
                  reordenar (sube/baja una pendiente) · la señal pareada re-lee, nunca recarga
```

### Frecuencia → jerarquía

- El gesto rey es `entrar` (encolar una pieza aprobada) — frecuente, gesto en vista.
- `reordenar` es la decisión de prioridad del jefe — `inline-gesture` (subir/bajar) o
  `editor-bloque` si se reordena en lote.
- `siguiente` NO se toca aquí (invariante: es la cara de utilización del operador).

## Formas UI canónicas (mapeo de la disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Ref de la cola (capa 1) | `ref-select`/cinta | longitud + pendientes — tarjetas por pieza |
| Cinta de estado (Órgano "barra de estado") | `cinta-estado` | "n pendientes · material cargado X" (longitud) |
| Encolar pieza | `editor-bloque` | entrar: modelo_id (ref catálogo), nombre, material, urgencia (1..5), tamaño |
| Reordenar | `inline-gesture` | subir/bajar una pendiente a una posición (1-based) |
| TODAS las de declaración | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja de declaración (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
entrar      → cola.entrada        ✅ (onEntrarRequest → _entrar → _publicarEvento)
              cola.entrar.failed  ✅ (par canónico de fallo)
reordenar   → cola.reordenada     ✅ (onReordenarRequest → _reordenar)
siguiente   → cola.extraccion     ✅ (utilización, fuera del panel)
              cola.vacia          ✅ (idem)
```

## Huecos (los de captura + los del sistema, sin cerrar)

1. **Gestor de la cola** — panel-jefe: cinta de estado + tarjetas de pendientes con
   gestos de encolar/reordenar (forma del F7)
2. **Editor de encolado** — `editor-bloque` (modelo_id ref catálogo + material + urgencia)
3. **Cinta de pulso** — `cinta-estado` vía longitud + material cargado

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Configuración de pesos del motor** — los pesos (material/urgencia/tamaño/tiempo)
  se ajustan con el uso, no por captura del jefe. Exponerlos como configuración es decisión
  de dueño (hoy son internos del reflejo).
- (b) **Catálogo como ref** — `entrar` valida el modelo por RPC best-effort; el ref-select
  de modelo_id depende de que `catalogo-modelos` exponga su listado. Si no, degrada a texto.

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro arriba (4 claves: 2 jefe, 1 utilizacion, 1 neutro)
- `ui.flujo` jefe-PRIMERO: [jefe: entrar, reordenar] → [utilizacion: siguiente] →
  [consulta: longitud]
- NOTA de contrato de args (crítica para la UI): `entrar` recibe `modelo_id` (ref catálogo),
  `nombre`, `material`, `urgencia` (1..5), `tamano`; `reordenar` recibe `item_id` + `pos`
  (1-based); `siguiente`/`longitud` solo `project_id`.
- señales de refresco del panel: cola.{entrada,reordenada,extraccion,vacia,entrar.failed}
