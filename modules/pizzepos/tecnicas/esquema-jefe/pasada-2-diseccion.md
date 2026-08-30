# PASADA 2 — recursión JEFE: formas UI de cada hoja + señales pareadas

> Bajada hasta hoja DIBUJABLE. Umbral de atómico-UI: el agente de UI puede
> trazarse sin preguntar nada más. FORMAS de esta variante: ref-select,
> inline-gesture, editor-bloque, confirmador-nombrado, cinta-estado,
> señal-refresh. Fuente de shapes: tecnicas.blueprint.json v1.2.0 leído entero
> (pseudocódigo de las 5 ops con sus L reales).

## Recursión: la declaración se abre en sus 2 hojas de escritura

### Hoja J1 · editor-bloque ALTA (codificar) — `tecnicas.codificar`

- Campos del shape real (input + pseudocódigo L72-142):
  - `nombre` — string, required. ÚNICO por nombre normalizado (lowercase+trim,
    L86): el duplicado NO pasa (ALREADY_EXISTS con existing_id en la respuesta).
  - `descripcion` — string libre.
  - `categoria` — string libre (hoy; [ABIERTO] enum canónico).
  - `parametros` — object libre (temperaturas, tiempos, ratios) — viaja
    VERBATIM (INV6: datos exactos, no rangos inventados).
  - `materiales` — array de strings (útiles necesarios).
  - `instrucciones` — array de strings (pasos ordenados).
  - `etiquetas` — array de strings.
- Nace con `version: 1`, `history: []` (L104-105) — el jefe no los toca.
- Señal pareada: **`tecnica.creada`** (1×).
- ERROR nombrado esperable: ALREADY_EXISTS (duplicado) — el dictamen muestra
  "ya existe" y la vista destaca la técnica existente (veredicto, no error
  mudo). INVALID_INPUT si falta nombre.

### Hoja J2 · editor-bloque EVOLUCIÓN — `tecnicas.actualizar`

- Campos del shape real (campos_permitidos L239): exactamente los 6 mismos
  campos de J1 MENOS nombre — { descripcion, categoria, parametros,
  materiales, instrucciones, etiquetas }. Al menos UNO.
- El contrato pone el dictamen MÁS RICO aquí: 200 { tecnica, diff:
  { campo: { antes, despues } } } (L275) — el panel puede mostrar QUÉ cambió,
  campo a campo, con valores de antes/después (transparencia de origen).
- history + version se bumpan solos (INV3) — la UI no los edita; tras
  guardar, el history es legible con obtener.
- Señal pareada: **`tecnica.actualizada`** (1×).

### Hoja N1 · INFORME (neutro) — `tecnicas.listar {}` (+ filtros opcionales)

- → lista alfabetica ligera { id, nombre, categoria, descripcion, etiquetas,
  version } (L200-204). **Salida ligera por diseño: sin history ni
  instrucciones** (no inflar). Filtros opcionales: categoria | etiqueta.
- Es la lectura que SIEMPRE puebla la vista (estado inicial + tras cada
  señal via refresh_on). Catálogos de técnicas: docenas — sin paginación.
- No hay captura: alimenta la vista y abre la decision (elige técnica).

### Hoja N2 · DETALLE (neutro, bajo demanda) — `tecnicas.obtener { tecnica_id | nombre }`

- → técnica COMPLETA con history[] y instrucciones (match exacto > parcial
  por nombre, L168-171). Es la vista de detalle: el pulso completo de la
  técnica antes de decidir su evolución. 404 = estado nombrado
  (RESOURCE_NOT_FOUND), no crash.

## Formas de las hojas del catálogo (todas neutro-lectura)

- `parametros { tecnica_id }` — consulta ligera {id, nombre, categoria,
  parametros} (L300-304): la cara "recetas/LLM consultan ligero". En el panel
  del jefe el informe detallado ya vive con obtener; esta op queda anotada al
  módulo-base (consumidores del dato, no captura).

## Reglas que gobiernan la composición

- **R1 frecuencia → jerarquía**: el catálogo (listar) es la vista permanente;
  codificar 1×/semana; actualizar (ajustar un parámetro tras probar) es el
  gesto jefe frecuente → editor-bloque con los 6 campos + dictamen diff.
- **R2 sin estado asumido**: toda mutación por RPC; los borradores se rellenan
  desde la LECTURA (obtener); solo las respuestas RPC escriben el store.
- **R3 la señal manda**: tras declarar, la vista re-lee listar cuando llega
  tecnica.creada / tecnica.actualizada (suscripción dot notation, debounce).
  El DICTAMEN inmediato lo da la respuesta (201 tecnica | 200 tecnica+diff) —
  doble confirmación: dictamen ahora, señal que re-asienta. NUNCA recarga.
- **R4 el informe distingue origen**: el dictamen de actualizar muestra el
  diff {antes→despues} de la RESPUESTA (lo que el jefe declaró) contra el
  catálogo re-leído (lo que el sistema tiene) — transparencia total.

## Dictamen del árbitro (lente de roles, previo al blueprint)

```
¿ESCRIBE el catálogo (alta/evolución)?                    → JEFE
¿SE EJECUTA en el momento de la venta/atencion?            → UTILIZACION
¿SOLO LEE estado o calcula?                                → NEUTRO
```
*(La lente clásica pregunta "escribe via custodio" — aquí el custodio ES el
runtime del blueprint; la pregunta operativa es: ¿declara el FUTURO del
catálogo?)*

| Op | Llamada | Veredicto | Por qué |
|---|---|---|---|
| codificar | tecnicas.codificar.request | **JEFE** | LA ALTA: nueva técnica al catálogo (persiste vía fs) |
| actualizar | tecnicas.actualizar.request | **JEFE** | LA EVOLUCIÓN: muta campos permitidos + version/history |
| listar | tecnicas.listar.request | **NEUTRO** | informe catálogo alfabético (salida ligera) |
| obtener | tecnicas.obtener.request | **NEUTRO** | técnica completa con history (informe + borrador del editor) |
| parametros | tecnicas.parametros.request | **NEUTRO** | subset ligero para consultores (recetas/LLM): fuera del panel-jefe como captura |

5/5 juzgadas. Composición del panel-jefe: J1+J2 (declarar) + N1/N2
(informarse/utilizar como borrador). Utilización: VACÍA — única lente del
ciclo sin cara POS.