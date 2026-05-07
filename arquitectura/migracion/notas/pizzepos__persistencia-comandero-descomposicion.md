# pizzepos/persistencia-comandero — Plan de descomposicion (futuro)

**Estado**: documentacion forward-looking. La descomposicion NO se ejecuta en la sesion actual. Ver `pizzepos__persistencia-comandero-mapa.md` para el rewrite v4.0.0 que mantiene el modulo entero al canon POC2.

## Por que ahora (rewrite v4.0.0) y no descomposicion

Decision tomada en la migracion al canon POC2 (sesion 2026-05-07). Aunque el modulo supera 1500 LOC (umbral del contrato `module-rewrite.descomponer_si_5_responsabilidades`), descomponer aqui requeriria 2-3 sesiones para mismo resultado de drift count. La sesion actual prioriza cerrar drifts mecanicos via helpers POC2 (5/2/12 helpers + atomic write + error shape).

Razones para posponer la descomposicion:

1. **Tres caches compartidas**: `eventosCache`, `ventasCache`, `cuentasActivasCache` se leen desde `handleCierreCaja` simultaneamente. Splitting requiere que las sub-modulos coordinen via bus para preguntar "dame las ventas del dia" — latencia + acoplamiento implicito.
2. **Write queue compartido**: `_writeQueue` evita race conditions entre escrituras concurrentes a `current/*.json`. Tres modulos compitiendo por el mismo filesystem requieren un coordinador (otro modulo con file lock o un proceso de write-through).
3. **CRITICO en runtime**: pizzepos depende del sustrato — un bug en la descomposicion afecta a `cuentas`, `pedidos`, `cobros`, `comandero`, `cocina`. 0 tests previos = riesgo de regresion grande.
4. **Cierre de caja transacional**: 300+ LOC de `handleCierreCaja` operan sobre los 3 caches + filesystem multi-proyecto + bus en una sola operacion. Atomicidad cross-modulo requeriria un saga pattern con compensacion — sobreingenieria si se mantiene la cohesion fisica.

Cuando los demas pizzepos esten migrados al canon (carta-design, cuentas, comandero, cobros, cocina, etc.) y tengan tests propios, la descomposicion sera mas segura.

## Descomposicion propuesta (cuando se haga)

Cuatro modulos derivados del actual `persistencia-comandero`:

### 1. `event-store` (event sourcing puro)

- **Subscribes**: los 19 genericos que actualmente usan `onEvento` + 7 mas que solo guardan en JSONL.
- **Publishes**: ninguno (passthrough).
- **Responsabilidad**: append events a `data/projects/<id>/persistencia/eventos/<fecha>.jsonl` + cache en memoria del dia actual.
- **API publica**: `getEventos(filter)`, `getEventosFecha(fecha)`.
- **LOC estimado**: 200.

### 2. `cuentas-snapshot` (estado vivo de cuentas)

- **Subscribes**: cuenta.{creada,cerrada,eliminada,estado_cambiado,actualizada}, mesa.renombrada, pedido.creado.
- **Publishes**: ninguno.
- **Responsabilidad**: mantener `cuentasActivasCache: Map` + persistir snapshot en `data/projects/<id>/persistencia/current/cuentas_activas.json`.
- **API publica**: `getCuentasActivas(filter)`, `getCuenta(cuenta_id)`.
- **LOC estimado**: 300.

### 3. `ventas-store` (registro de ventas)

- **Subscribes**: cuenta.cerrada (crea venta tras buscar cobro asociado).
- **Publishes**: ninguno (lee de event-store).
- **Responsabilidad**: ventasCache + persist + agregaciones (`calcularResumenDia`, `calcularDesgloseProductos`).
- **API publica**: `getVentas(filter)`, `getVentasFecha(fecha)`, `cuadreCaja()`.
- **Dependencia cross-modulo**: invoca `event-store.getEventos(cobro.procesado, cuenta_id)` via bus para crear venta.
- **LOC estimado**: 400.

### 4. `caja-jornada` (cierre + apertura + backup)

- **Subscribes**: ninguno.
- **Publishes**: `caja.cerrada`, `cuenta.cerrada_forzada`, `dia.iniciado`.
- **UI handlers**: `cierre`, `iniciar_dia`, `cuadre`, `cuadre_fecha`, `backup`, `health`, `metrics`.
- **Responsabilidad**: orquesta cierre dia (cierra cuentas via bus, agrega ventas via bus, escribe cierre + informe + archiva). Apertura de dia (limpia caches via bus). Backup snapshot.
- **Dependencias cross-modulo**: invoca a los otros 3 modulos via bus.
- **LOC estimado**: 600 (incluye `generarInformeCierre` con formato fiscal HORECA).

## Riesgos de la descomposicion

1. **Saga de cierre**: `caja-jornada.cierre` invoca a 3 modulos. Si uno falla a mitad, el estado queda inconsistente. Requiere implementar saga con compensacion o aceptar que el cierre es best-effort.
2. **Latencia**: leer ventas via bus es ~10ms vs ~0ms actual. Cierre de caja de 1000 ventas → 10s extra acumulado.
3. **Backwards compat**: durante la migracion, los demas pizzepos aun consumen los publishes de `persistencia-comandero`. La descomposicion debe preservar literal los 3 publishes (mismos nombres, mismo shape) — el nuevo `caja-jornada` los emite.
4. **Rebuild de fechaJornada**: hoy vive en una variable; en descomposicion debe vivir en `caja-jornada` y los otros 3 deben leerla via query (`caja-jornada.getFechaJornada`) o via subscribe a `dia.iniciado`.

## Cuando ejecutar

Trigger: cuando los 4 modulos pizzepos que mas dependen de persistencia (`cuentas`, `pedidos`, `cobros`, `comandero`) esten migrados al canon Y tengan tests propios. Estimacion: 3-4 migraciones futuras antes de poder iniciar la descomposicion sin riesgo.

Plan multi-sesion:

- **Sesion 1**: extraer `event-store` (modulo nuevo, persistencia-comandero queda como passthrough para los handlers que ya migran).
- **Sesion 2**: extraer `cuentas-snapshot`.
- **Sesion 3**: extraer `ventas-store`.
- **Sesion 4**: lo que queda en persistencia-comandero es `caja-jornada` — rename + cleanup. Eliminar el modulo viejo.
