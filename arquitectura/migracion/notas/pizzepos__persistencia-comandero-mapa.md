# pizzepos/persistencia-comandero — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar codigo.

## Identidad

- **Path**: `modules/pizzepos/persistencia-comandero/`
- **Version actual**: 3.0.0 → bump a **4.0.0** post-rewrite.
- **LOC index.js**: 1541.
- **Drifts en baseline**: 50 (13 tipos, scaffold detecta 46 ahora).
- **Categoria**: dominio pizzepos.
- **Idioma**: `es`.
- **Description oficial**: Persistencia event-sourcing para pizzepos — captura todos los eventos de dominio y orquesta jornada (caja/dia). Sustrato de persistencia para TODOS los demas modulos pizzepos.

## Decision sobre descomposicion (>1500 LOC threshold)

**NO descomponer** — rewrite-entero. Justificacion:

Las 5 responsabilidades del modulo (event sourcing, snapshots de cuentas, jornada/caja, cierre, backup) comparten:

1. **Mismo write queue serializado** (`_writeQueue` de Promise para evitar race conditions).
2. **Mismas 3 caches en memoria** (`eventosCache`, `ventasCache`, `cuentasActivasCache`).
3. **Mismo schema de paths** y helper `getProjectDirs(projectId)`.
4. **Cierre de caja LEE de los 3 caches simultaneamente** + del filesystem multi-proyecto. Separar requeriria pasar datos via bus (latencia + acoplamiento implicito).
5. **Es CRITICO** (sustrato de pizzepos completo) y tiene **0 tests previos** — descomponer aqui es alto riesgo.

**Descomposicion futura documentada**: ver `notas/pizzepos__persistencia-comandero-descomposicion.md` para plan multi-sesion. Mientras tanto, rewrite-entero cierra los 50 drifts con helpers POC2 sin perder cohesion.

## Inventario

### Publishes (3) — preservados invariantes

- `caja.cerrada` — emitido en `handleCierreCaja` tras cerrar dia. Payload: `{ fecha, project_id, arqueo, totales, diferencia, cierre, informe }`.
- `cuenta.cerrada_forzada` — emitido por `handleCierreCaja` para cada cuenta abierta al cerrar caja.
- `dia.iniciado` — emitido en `handleIniciarDia`.

### Subscribes (26) — preservados invariantes

- **19 genericos** (event sourcing puro) → `onEvento`: boton.pulsado, ui.accion, cobro.{iniciado,procesado,reembolsado}, pedido.{enviado_cocina,completado}, mesa.{abierta,cerrada}, telefono.pedido_creado, llevar.ticket_creado, comandero.{item_agregado,item_eliminado,enviar_cocina}, catalogo.actualizado, cocina.{item_preparando,item_preparado,item_avanzado,pedido_listo}.
- **5 cuenta lifecycle** → handlers especificos: cuenta.{creada,cerrada,eliminada,estado_cambiado,actualizada}.
- **1 pedido** → `onPedidoCreado`.
- **1 mesa** → `onMesaRenombrada`.

### UI handlers (12) — antes en `apis` HTTP-shape, AHORA en `ui_handlers` canonicos

- `cuentas_activas`, `eventos`, `eventos_fecha`, `ventas`, `ventas_fecha`, `cuadre`, `cuadre_fecha`, `cierre`, `iniciar_dia`, `backup`, `health`, `metrics`.

## Drifts conocidos en baseline (50 — desglose)

| Tipo | Count | Naturaleza | Como cierra el rewrite |
|---|---|---|---|
| `drift_non_atomic_write` | 11 | Real — `fs.writeFile` directo en 11 sites. | Helper auxiliar `_atomicWriteFile` (`.tmp + rename`). |
| `drift_silent_io_failure` | 7 | Real — `try {} catch (error) { /* No critico */ }`. | log + metric explicito. |
| `drift_error_sin_metric` | 7 | Real — returns sin `metrics.increment`. | Helper `_handleHandlerError`. |
| `drift_error_como_string_suelto` | 7 | Real — `error: 'Se requiere arqueo...'`. | `_errorResponse(400, 'INVALID_INPUT', ...)`. |
| `drift_metrica_sin_prefix_modulo` | 4 | **Falso positivo parcial** — `persistencia.*` es prefix del DOMINIO, conocido por consumers. | Conservar prefix dominio + añadir `persistencia-comandero.errors`. |
| `drift_error_sin_log` | 4 | Real — returns sin logger en proximidad. | Mismo helper. |
| `drift_publish_dominio_sin_project_id` | 3 | Real — los 3 publishes ya llevan project_id. Validator detecta el shape minimo. | Helper `_publicarEvento` reafirma shape. |
| `drift_log_spam_en_bucle` | 2 | Real — bucles que loguean por proyecto. | Reducir granularidad: 1 log inicio + 1 fin con count. |
| `module_http_audit_completeness` | 1 | Real — `apis` HTTP-shape pero codigo usa uiHandler.register. | Migrar a `ui_handlers` canonicos. |
| `drift_undeclared_persistence_pattern` | 1 | Real — config sin `persistence` correcto. | Declarar shape canonico. |
| `drift_mensaje_sin_estructura` | 1 | Real — return data con `message: 'Cierre completado'`. | Cambiar a `data.user_hint`. |
| `drift_correlation_id_no_propagado` | 1 | Real — `tracing.propaga_correlation_id: false`. | `tracing: true` + `_publicarEvento`. |
| `drift_auth_undeclared` | 1 | **Falso positivo**: persistencia es modulo de proyecto sin auth de usuario. | Documentar. |

## Cosas criticas a preservar

1. **3 publishes + 26 subscribes** invariantes (sustrato de event-sourcing pizzepos).
2. **3 caches en memoria** (`eventosCache: array`, `ventasCache: array`, `cuentasActivasCache: Map`).
3. **Write queue serializado** `_writeQueue: Promise`.
4. **Persistencia multi-proyecto**: global + por proyecto + contabilidad/cierres.
5. **Cierre de caja completo**: cierra cuentas abiertas, calcula resumen, calcula desglose productos por familia, genera informe markdown, archiva dia, emite `caja.cerrada`.
6. **`generarInformeCierre`** — informe markdown con emojis, formato fiscal HORECA. Preservado byte a byte.
7. **`calcularDesgloseProductos`** — agregacion por familia + por producto.
8. **`calcularResumenDia`** — totales por_metodo_pago + por_tipo_cuenta + por_camarero.
9. **`getFechaCalendario`** — YYYY-MM-DD (jornada NO cambia en medianoche).
10. **`onCuentaCerrada`** — busca cobro en eventosCache y crea registro de venta. Maneja `llevadoo` con `externo_llevadoo`.
11. **`getProjectDirs` + lazy mkdir + `resolveProjectId` + `getActiveProjectIds`** preservados.

## Plan del rewrite

1. Archivar monolito (1541 LOC) en `_legacy/`. _(automatico)_
2. Reescribir `index.js` v4.0.0:
   - 5 helpers POC2 + auxiliar `_atomicWriteFile` + `_readJsonSafe`.
   - 12 ui_handlers normalizados con shape canonico.
   - 26 subscribes auto-wired (eliminar `registerUIHandlers`).
   - **Todos los `fs.writeFile` directos → `_atomicWriteFile`** (11 sites).
   - **Reemplazar `catch (e) { /* ok */ }` con log + metric** (7 sites).
   - Telemetria `persistencia.*` (dominio) + `persistencia-comandero.errors`.
   - `_publicarEvento` con correlation_id+project_id+timestamp.
   - onUnload limpia caches + await write queue.
3. `module.json` v4.0.0: tracing true, ui_handlers canonicos, config.persistence canonico.
4. Tests por capas: 7 grupos cubriendo lifecycle, validacion, event sourcing, cuenta lifecycle, cierre, helpers, POC2.
5. Wire CI _(automatico)_.
6. Verificar drift count → ≤16 (~70%).
7. Commit con metricas.
