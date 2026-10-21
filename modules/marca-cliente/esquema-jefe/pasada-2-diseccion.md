# PASADA 2 — DISECCIÓN del módulo `marca-cliente` (reflejo-0.1.0)

> Verificación estricta en código: cada claim contra la línea real del index.js
> y del module.json. Confirmar o corregir los `ui.roles` que venían de la saga
> d91f077c y dejar la composición del panel del jefe sólida.

## Lente de ROLES — veredicto del árbitro sobre las 6 ops

| Op (ui_handlers) | Línea index.js | ¿Qué hace? | Rol del árbitro |
|---|---|---|---|
| `reglas.actualizar` | L142 `_custodio.actualizar` | ÚNICA escritura (config-custodio, valida+merge+persiste) | **JEFE** |
| `reglas.leer` | L159-162 | Devuelve { reglas, fuente } (siempre, sin 404) | neutro |
| `voz.obtener` | L137 → `_calcular('voz')` FORMULAS.voz | { voz } | neutro |
| `presencia.obtener` | L138 → `_calcular('presencia')` FORMULAS.presencia | { canales } | neutro |
| `cliente.obtener` | L139 → `_calcular('cliente')` FORMULAS.cliente | por `contacto` requerido → cliente | **utilizacion** |
| `fidelizacion.obtener` | L140 → `_calcular('fidelizacion')` FORMULAS.fidelizacion | por `contacto` requerido → puntos/recompensas | **utilizacion** |

**Veredicto**: 3/6 juzgadas como cara del JEFE → `reglas.actualizar`.
Utilización (2): `cliente.obtener` y `fidelizacion.obtener` (se ejecutan en el
momento de la atención al cliente en el POS). Neutro (3): las lecturas.

## Confirmación de los roles existentes

El blueprint previo (saga d91f077c) traía:

```
ui.roles { reglas.leer: neutro, reglas.actualizar: jefe, voz.obtener: neutro,
presencia.obtener: neutro, cliente.obtener: utilizacion,
fidelizacion.obtener: utilizacion }
```

**Se CONFIRMAN correctos** contra el código. No hay que corregirlos; sí falta
el resto del andamiaje v2 (`_lente_roles`, `formas_jefe`, `_verificado_en_codigo`)
y la estructura completa de `ui`.

## Detalle de las FORMULAS (shapes de lectura — para el store del panel)

- `voz_obtener` (FORMULAS.voz, L78-84): 200 `{ voz: reglas.voz ?? null }`.
- `presencia_obtener` (FORMULAS.presencia, L86-91): 200 `{ canales: reglas.presencia?.canales ?? [] }`.
- `cliente_obtener` (FORMULAS.cliente, L93-103): input `{ contacto }` (schema
  requerido) → 200 `{ contacto, cliente|null, metodo:'encontrado'|'no_encontrado' }`.
- `fidelizacion_obtener` (FORMULAS.fidelizacion, L105-117): input `{ contacto }`
  requerido → 200 `{ contacto, activa, nota? , puntos?, puntos_por_euro?,
  recompensas? }`. Si `!fidel.activa`: `{ activa:false, nota:'fidelización
  desactivada' }`. Si activa: `{ activa:true, puntos, puntos_por_euro, recompensas }`.

## Señales (verificadas)

- **Salida (1)**: `marca.reglas.actualizadas` — ConfigCustodio.actualizar al
  persistir (index.js L132 → eventBus.publish con `{ project_id, reglas: nuevas }`).
  El module.json.publishes la declara. La usa el panel para re-leer (R3).
- Las ops de lectura/utilización NO emiten señal (neutras / consultas puntuales).

## Formas del panel del jefe (3 capas)

1. **INFORMARSE** — `reglas.leer` → informe por bloques (voz/presencia/clientes/
   fidelizacion), nulls y [] como "por declarar" (INV3/INV5). Muestra `fuente`
   ('persistida'|'default') para transparencia.
2. **DECLARAR** — editor-bloque por bloque:
   - VOZ → `reglas.actualizar { cambios: { voz: { tono, valores[], tradicion } } }`
   - PRESENCIA → `{ cambios: { presencia: { canales[] } } }`
   - FIDELIZACIÓN → `{ cambios: { fidelizacion: { activa, puntos_por_euro, recompensas[] } } }`
   Cada uno 1 llamada reglas.actualizar con SOLO su bloque (validación por campo,
   INV2 — no pisar los demás).
3. **CONFIRMAR** — dictamen de la respuesta (200 `{ reglas }`) + señal
   `marca.reglas.actualizadas` re-lee el informe (debounce 60ms). Nunca recarga.

Los borradores del editor se rellenan SIEMPRE desde la lectura vigente (R2),
nunca se asume el store. La señal filtra por project_id.

## Multi-tenant (INV6)

TODO RPC lleva `project_id` (leído de `get(activeProjectId)` y pasado en cada
llamada — lección bug escandallo). Guard si no hay proyecto activo.
