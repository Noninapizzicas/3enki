# ESQUEMA — cara del JEFE del módulo `calendario` (RAÍZ, v0.1.0)

> Árbol maestro consolidado (pasadas 1-2). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente. El análisis
> es de la CARA DEL JEFE — la utilización (POS/portal de llamada/cobro anticipado
> que consumen `validar`/`margen.leer` en la venta) quedó fuera.

## 1. Quién es el jefe y qué decide

Dueño del **calendario de producción/distribución de los productos**: decide
CUÁNDO sale cada producto y con cuánta antelación debe encargarse. Decide:
- **D1** agendar la producción de un producto: días de salida (`dias_salida`,
  ISO 1..7) + margen de antelación mínima en horas (`margen_antelacion_h ≥ 0`)
  — `producto.actualizar`.

Lo que NO decide: si existe el producto (lo siembra/proyecta la carta), ni si un
encargo concreto vale HOY (eso lo deriva `validar` en el momento del encargo).

## 2. Invariantes (restricciones honestas)

- INV1 — **escritura single-writer**: `producto.actualizar` es la ÚNICA escritura
  del módulo; valida los campos presentes contra el esquema `calendario-v1` y
  persiste por merge. El resto del sistema (motor de validación H2, encargos,
  cobro anticipado) BEBE los valores por RPC.
- INV2 — **días ISO 1..7** (1=Lun..7=Dom), validador real del index.js
  (`VALID_DIAS = [1,2,3,4,5,6,7]`). La UI respeta 1=Lun, NO 0-based.
- INV3 — **el catálogo de productos NO es suyo**: el jefe selecciona de la carta
  (`productos.carta_completa` — proyector de otro módulo); el calendario se
  cuelga de productos que ya existen.
- INV4 — **no hay delete**: si un producto deja de salir, se actualizan sus días.
- INV5 — **cero agendados ≠ catálogo vacío**: `productos.leer` devuelve
  `{calendarios:{}}` si nada se ha agendado.
- INV6 — **margen sin calendario = null** (política por declarar): `margen.leer`
  devuelve `margen_antelacion_h: null` y `dias_salida: []` si no hay calendario
  para el producto. La UI lo muestra como "sin agendar", no lo inventa.

## 3. Señales pareadas (verificadas en `modules/_shared/config-custodio.js`)

| Declaración | Señal de confirmación | Granularidad |
|---|---|---|
| `producto.actualizar` | `calendario.producto.actualizado` (ConfigCustodio L119, `{project_id, calendario}`) | 1 evento por producto actualizado |
| lecturas (`producto.leer` / `productos.leer` / `validar` / `margen.leer`) | ninguna propia (alimentadoras) | — |

> module.json declara el publish `calendario.producto.actualizado` (el modulo lo
> declara y el ConfigCustodio lo emite al persistir — consistente).

## 4. Composición de la vista del jefe

```
1. SELECCIONAR  H1 ref-select producto (productos.carta_completa → producto_id)
2. INFORMARSE   H2 cinta-estado agenda del día (productos.leer → agregado por día)
                H4 dictamen (validar, bajo demanda) · H5 pulso antelación (margen.leer, selección)
3. DECLARAR     H3 editor-bloque (producto.actualizar — LA ÚNICA escritura)
                señal-refresh: calendario.producto.actualizado
```

+ principios que trascienden: la señal manda (la cinta late por
`calendario.producto.actualizado`); frecuencia→jerarquía (agendar es lo frecuente:
en la vista, editor en bloque); el informe distingue origen (la agenda la declara
el jefe; `validar` es el sistema derivando sobre esa declaración).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| H1 selección de producto | ref-select | `productos.carta_completa {project_id}` → `{productos:[{id,nombre}]}` | — (lectura) |
| H2 agenda del día | cinta-estado | `productos.leer` → `{calendarios}` | calendario.producto.actualizado |
| H3 AGENDAR (LA DECISIÓN) | editor-bloque | `producto.actualizar {producto_id, cambios:{dias_salida,margen_antelacion_h}}` | calendario.producto.actualizado |
| H4 dictamen de fecha | dictamen | `validar {producto_id, fecha_deseada}` → `{valido, motivo, propuesta}` | refetch tras actualizado (sin señal propia) |
| H5 pulso antelación | cinta-estado secundaria | `margen.leer {producto_id}` → `{margen_antelacion_h, dias_salida}` | — (lectura) |
| H6 ficha de un producto | detalle (opt) | `producto.leer {producto_id}` → `{producto_id, calendario}` | — (lectura) |

## 6. Huecos [ABIERTO] (decisiones del dueño — nombradas, no suplidas)

- [ABIERTO] qué productos entran al calendario (los de la carta; el alta es
  decisión del jefe, no por defecto).
- [ABIERTO] criterio de días por familia/producto (ej. pan M/X/V).
- [ABIERTO] margen por defecto para un producto nuevo sin calendario (hoy null).
- [ABIERTO] franja horaria de salida — el módulo agenda por DÍA, sin hora.
  Ampliación/decisión del dueño.

## 7. Fuera del árbol del jefe

Utilización → POS/portal de llamada/cobro anticipado consumen `validar` y
`margen.leer` en el momento del ENCARGO/venta (se ejecutan AHORA, no deciden el
futuro del calendario). Siembra de productos (carta-manager/productos). El jefe
no ejecuta la venta: esas lecturas son del POS.

## 8. Nota para el panel — la agenda como fuente de verdad del tiempo

El módulo es la BASE COMPARTIDA del TIEMPO de la panadería (órgano agenda de
Prisma): lo que el jefe declara aquí (días de salida + margen) es lo que el resto
del sistema (H2 motor de validación, encargos, cobro anticipado) consume por RPC.
Editar aquí = re-agendar toda la producción/distribución. El panel del jefe
muestra la agenda declarada (cinta) y el dictamen que el sistema deriva de ella
(`validar`), distinguiendo el origen.
