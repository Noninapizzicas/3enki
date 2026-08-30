# PASADA 2 — recursión JEFE: formas UI de cada hoja + señales pareadas

> Bajada hasta hoja DIBUJABLE. Umbral de atómico-UI: el agente de UI puede
> trazarse sin preguntar nada más. FORMAS de esta variante: ref-select,
> inline-gesture, editor-bloque, confirmador-nombrado, cinta-estado,
> señal-refresh. Fuente de shapes: index.js (L1-131) leído entero.

## Recursión: la declaración se abre en sus palancas reales

`reglas.actualizar { cambios }` (cambios = objeto parcial, solo lo que toca)
se descompone en las 2 hojas de BLOQUE que el contrato soporta:

### Hoja J1 · editor-bloque REPARTO — `reglas.actualizar { reparto: {...} }`

- Campos del shape real (validador index.js L32-42):
  - `activo` — boolean. La palanca maestra: si false, no hay reparto propio.
  - `radio_km` — número >= 0 o null (null = por declarar).
  - `coste` — número >= 0 o null. **Moneda: EUR** (el contrato no nombra
    céntimos; los hermanos pizzepos persisten euros float 2dec — ver esquema.md).
  - `minutos_por_km` — número >= 0 o null (si falta, el estimador de tiempo
    da reparto = 0: la política incompleta degrada con gracia, no rompe).
- Señal pareada: **`entrega.reglas.actualizadas`** (1×).

### Hoja J2 · editor-bloque ESTIMACIÓN — `reglas.actualizar { estimacion: {...} }`

- Campos del shape real (validador index.js L43-50):
  - `minutos_preparacion_base` — número >= 0 o null (la base del cálculo).
  - `minutos_por_item` — número >= 0 o null (el incremento por ítem).
  - Ambos null = `tiempo.estimar` responde con `metodo: 'pendiente'` y
    nota "estimación sin declarar" (index.js L67-68) — el contrato ya habla
    de sí mismo cuando falta política.
- Señal pareada: **`entrega.reglas.actualizadas`** (1×).

### Hoja N1 (neutro, alimenta el panel) · INFORME — `reglas.leer {}`

- → `{ reglas: { reparto, estimacion }, fuente: 'persistida' | 'default' }`.
- Es la lectura que SIEMPRE pobló la vista (estado inicial + tras cada
  declaración). **El informe abre los nulls con gracia: null = "por declarar",
  nunca error.** fuente='default' es el estado "sin política — los defaults".
- No hay señal propia: es lectura.

## Formas de las hojas de UTILIZACIÓN (veredicto: fuera del panel-jefe)

- Hoja U1 `tiempo.estimar { num_items, km? }` → preparacion + reparto +
  total, con `metodo: 'declarado' | 'pendiente'` — la cara POS/PWA al elegir
  delivery. Formas de captura: la pinta el flujo de pedido, no este panel.
- Hoja U2 `reparto.obtener {}` → politica de reparto (radio/coste/min-por-km):
  la cara del cliente; en el panel-jefe NO abre captura (el informe ya la
  muestra; en el blueprint se anota CCT-esa fuera).

## Reglas que gobiernan la composición

- **R1 frecuencia → jerarquía**: lo frecuente es el bloque activo/valores del
  reparto; la estimación es set-once (se toca mensual). Ambos editor-bloque,
  el reparto PRIMERO (es el que decide si el resto del sistema ve delivery).
- **R2 sin estado asumido**: toda mutación por RPC; el store solo escribe
  con datos de una lectura.
- **R3 la señal manda**: tras declarar, la vista re-lee reglas.leer cuando
  llega `entrega.reglas.actualizadas` (suscripción dot notation, debounce).
  El DICTAMEN inmediato lo da la propia respuesta de reglas.actualizar
  ({ reglas: nuevas }) — doble confirmación: respuesta ahora, señal que
  re-asienta. NUNCA recarga de página, nunca estado optimista.
- **R4 el informe distingue origen**: fuente 'default' → la vista alerta
  "política por declarar (valores por defecto)"; fuente 'persistida' →
  "política vigente".

## Dictamen del árbitro (lente de roles, previo al blueprint)

```
¿ESCRIBE en reglas/config del dominio (via custodio)?  → JEFE
¿SE EJECUTA en el momento de la venta/atencion?        → UTILIZACION
¿SOLO LEE estado o calcula?                            → NEUTRO
```

| Op | Llamada | Veredicto | Por qué |
|---|---|---|---|
| reglas.actualizar | entrega.reglas.actualizar.request | **JEFE** | LA DECLARACIÓN: escribe política vía custodio (único escritor) |
| tiempo.estimar | entrega.tiempo.estimar.request | **UTILIZACIÓN** | cálculo al pedir (POS/PWA, decisión AHORA) — fuera del panel |
| reparto.obtener | entrega.reparto.obtener.request | **UTILIZACIÓN** | consulta del cliente — cara tienda; fuera del panel |
| reglas.leer | entrega.reglas.leer.request | **NEUTRO** | solo informe: alimenta la vista y la decisión |

4/4 juzgadas. Composición del panel-jefe: hojas J1+J2 (declarar) + N1
(informarse). Utilización separada — existe, pero vive en POS/PWA.