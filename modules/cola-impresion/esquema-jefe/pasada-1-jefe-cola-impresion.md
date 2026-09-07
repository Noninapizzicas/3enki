# Pasada 1 — Esquematizador-Jefe-Operador (cola-impresion v2)

> SUJETO correcto: **las DOS caras trabajadas de cola-impresion** — la del JEFE (quien
> declara reglas/config y decide) y la del OPERADOR (quien opera la máquina/flujo a diario).
> La cara del CLIENTE (POS/PWA/consumo) se deja **AL MARGEN** — no es de este esquema.
>
> Cola-impresion es un CUSTODIO (reflejo JS) single-writer de la cola de impresión del
> taller (SPARKX i7, una pieza a la vez). La cola NO es FIFO simple: un motor de ordenación
> (`_ordenar`) puntúa cada pieza pendiente con variables — material · urgencia · tamaño ·
> tiempo — y las variables se AJUSTAN CON EL USO (al extraer una pieza, su material pasa a
> ser el "cargado" y gana prioridad para evitar cambios de filamento). La cola NUNCA decide
> qué imprimir (invariante 6): solo ordena lo aprobado.
>
> Método: `esquematizador-interfaz-jefe-operador` (prisma de 5 huecos + lente de roles +
> máquina de estados + señales pareadas + formas UI canónicas).

## Alimento (informer al prisma)

| Inyecto | De dónde sale | Hueco que llena |
|---|---|---|
| Eventos del módulo (publica/escucha) | module.json + index.js | CONTRATO |
| Handlers mapeados a necesidades de cada rol | index.js (onEntrar/onSiguiente/onReordenar/onLongitud) | IDENTIDAD |
| Máquina de estados real | index.js `ESTADOS` = [pendiente, imprimiendo, hecho, retirada] | RESTRICCIONES |
| Invariantes (single-writer, motor, no decide) | module.json `_doc` + index.js | RESTRICCIONES |

## Las 5 preguntas-jefe + operador

1. **IDENTIDAD** — ¿Qué DECIDE el JEFE aquí? El jefe NO imprime. El jefe DECIDE **qué
   entra en la cola** (`entrar`: mete una pieza aprobada, valida catálogo + no duplicado)
   y **en qué orden queda** (`reordenar`: sube/baja una pieza pendiente a una posición).
   ¿Qué OPERA el OPERADOR aquí? El operador **extrae la siguiente pieza** (`siguiente`:
   operación física del taller — saca la pieza que el motor ordena como primera y la pone
   en `imprimiendo`). El panel-jefe es un **GESTOR DE LA COLA**; la cara-operador es la
   **EXTRACCIÓN FÍSICA** al momento de imprimir.

2. **RESTRICCIONES** — el custodio es el MÓDULO (single-writer vía PosPersistencia por
   proyecto). La cola NUNCA decide qué imprimir (invariante 6): solo ordena lo aprobado.
   El motor de ordenación (`_ordenar`) es proyección interna con pesos ajustables con el
   uso (material cargado se actualiza en cada extracción). `entrar` valida catálogo por
   RPC (`catalogo.obtener.request`, best-effort) y rechaza duplicados (409 ALREADY_EXISTS).
   `reordenar` solo opera sobre piezas `pendiente` (409 CONFLICT_STATE si no). `siguiente`
   solo extrae de `pendiente`; si no hay, emite `cola.vacia`. El juez del orden es el
   MÓDULO, no la UI. El operador NO decide el orden: solo toma la primera del motor.

3. **CONTRATO** — VER: `cola.longitud` (pendientes + total) da el pulso de la cola.
   SEÑALES de confirmación (verificadas en index.js): `entrar` → `cola.entrada` (o
   `cola.entrar.failed`), `reordenar` → `cola.reordenada`, `siguiente` → `cola.extraccion`
   (o `cola.vacia`). El refresco parea [vista→señal]: la vista re-lee, NUNCA recarga.

4. **NO-OBJETIVOS** — la cara CLIENTE (POS/PWA/consumo) queda AL MARGEN: no es de este
   esquema. El sistema (longitud/estado) informa, no decide. El motor de ordenación es
   interno, no se configura desde la UI (los pesos se ajustan con el uso, no por captura
   del jefe). El operador no reordena ni encola: eso es del jefe.

5. **PREGUNTAS_ABIERTAS** — ver [ABIERTO] abajo; se nombran, no se cierran.

## Veredicto del ÁRBITRO (lente de roles) — 4/4 ops

Pregunta árbitro: ¿decide el FUTURO de la cola (declara qué entra y en qué orden) → JEFE ·
¿opera el flujo a diario (arranca, confirma físico, retira, reanuda) → OPERADOR · ¿solo
informa → NEUTRO? La cara CLIENTE (elegir/comprar) NO se clasifica aquí.

| Op | Veredicto | Por qué |
|---|---|---|
| `entrar` | **JEFE** | Declara qué pieza aprobada entra en la cola (valida catálogo + no duplicado). La decisión de ARRANCAR el contenido de la cola. |
| `reordenar` | **JEFE** | Edita el orden de las piezas pendientes (sube/baja a una posición). La decisión de PRIORIDAD del jefe. |
| `siguiente` | **OPERADOR** | El operador extrae la siguiente pieza según el motor AL IMPRIMIR. Operación física del taller: saca la pieza y la pone en `imprimiendo`. |
| `longitud` | **NEUTRO** | Estado de la cola (pendientes + total). Alimenta la cinta-estado, no decide. |

**La dualidad, en una línea**: el jefe DECLARA qué entra y en qué orden (entrar/reordenar);
el operador OPERA la extracción física al imprimir (siguiente); la longitud informa (neutro).

## Composición de la vista (3 capas) — GESTOR DE LA COLA + EXTRACCIÓN

```
1. SELECCIONAR  — la pieza sobre la que se actúa: ref a la cola (longitud + lista de
                  pendientes). La cinta ES el selector natural: tocar la tarjeta de la pieza.
2. INFORMARSE   — longitud (pendientes + total) + el material cargado actual (para saber
                  qué prioriza el motor). cinta-estado "n pendientes · material cargado X".
3. DECLARAR/OPERAR — las escrituras por rol:
                  JEFE: entrar (nueva pieza aprobada) y reordenar (sube/baja una pendiente)
                  OPERADOR: siguiente (extraer la pieza que el motor ordena primera)
                  · la señal pareada re-lee, nunca recarga
```

### Frecuencia → jerarquía

- El gesto rey del JEFE es `entrar` (encolar una pieza aprobada) — frecuente, gesto en vista.
- `reordenar` es la decisión de prioridad del jefe — `inline-gesture` (subir/bajar) o
  `editor-bloque` si se reordena en lote.
- El gesto rey del OPERADOR es `siguiente` — un toque en la cinta que extrae la pieza
  primera del motor y la pone en `imprimiendo`. Es la operación física del taller.

## Formas UI canónicas (mapeo de la disección)

| Hoja (órgano) | Forma canónica | Nota |
|---|---|---|
| Ref de la cola (capa 1) | `ref-select`/cinta | longitud + pendientes — tarjetas por pieza |
| Cinta de estado (Órgano "barra de estado") | `cinta-estado` | "n pendientes · material cargado X" (longitud) |
| Encolar pieza (JEFE) | `editor-bloque` | entrar: modelo_id (ref catálogo), nombre, material, urgencia (1..5), tamaño |
| Reordenar (JEFE) | `inline-gesture` | subir/bajar una pendiente a una posición (1-based) |
| Extraer siguiente (OPERADOR) | `inline-gesture` | siguiente: 1 toque → extrae la primera del motor, pasa a `imprimiendo` |
| TODAS las de declaración/operación | `señal-refresh` | **pareadas** (tabla abajo) |

## Señales pareadas por hoja (verificadas en index.js)

Regla: sin señal, hoja inmadura. Nombres REALES de los publishers del módulo:

```
entrar      → cola.entrada        ✅ (onEntrarRequest → _entrar → _publicarEvento)
              cola.entrar.failed  ✅ (par canónico de fallo)
reordenar   → cola.reordenada     ✅ (onReordenarRequest → _reordenar)
siguiente   → cola.extraccion     ✅ (onSiguienteRequest → _siguiente → _publicarEvento)
              cola.vacia          ✅ (idem, si no hay pendientes)
```

## Huecos (los de captura + los del sistema, sin cerrar)

1. **Gestor de la cola** — panel-jefe: cinta de estado + tarjetas de pendientes con
   gestos de encolar/reordenar (forma del F7)
2. **Editor de encolado** — `editor-bloque` (modelo_id ref catálogo + material + urgencia)
3. **Cinta de pulso** — `cinta-estado` vía longitud + material cargado
4. **Extracción del operador** — `inline-gesture` "siguiente" que saca la pieza primera
   del motor y la pone en `imprimiendo` (operación física del taller)

`[ABIERTO]` (decisiones del dueño, nombradas NO cerradas):
- (a) **Configuración de pesos del motor** — los pesos (material/urgencia/tamaño/tiempo)
  se ajustan con el uso, no por captura del jefe. Exponerlos como configuración es decisión
  de dueño (hoy son internos del reflejo).
- (b) **Catálogo como ref** — `entrar` valida el modelo por RPC best-effort; el ref-select
  de modelo_id depende de que `catalogo-modelos` exponga su listado. Si no, degrada a texto.
- (c) **Confirmador de extracción** — `siguiente` es operación física (saca la pieza de la
  máquina); decidir si requiere `confirmador-nombrado` (destructiva) o basta el toque directo.

## Cables hacia el blueprint (agente crear-blueprint-jefe)

- `ui.roles` = veredicto del árbitro arriba (4 claves: 2 jefe, 1 operador, 1 neutro)
- `ui.flujo` jefe-PRIMERO: [jefe: entrar, reordenar] → [operador: siguiente] →
  [consulta: longitud]
- NOTA de contrato de args (crítica para la UI): `entrar` recibe `modelo_id` (ref catálogo),
  `nombre`, `material`, `urgencia` (1..5), `tamano`; `reordenar` recibe `item_id` + `pos`
  (1-based); `siguiente`/`longitud` solo `project_id`.
- señales de refresco del panel: cola.{entrada,reordenada,extraccion,vacia,entrar.failed}
