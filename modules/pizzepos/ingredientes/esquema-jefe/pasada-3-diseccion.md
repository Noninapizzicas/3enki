# Pasada 3 — DISECCIÓN: forma UI de cada hoja (formas de captura del jefe)

> Cada hoja-jefe de la pasada 2 recibe su FORMA de captura. Toda hoja de
> declaración lleva su `señal-refresh` pareada — si no la tiene, no está madura.

## Hojas de DECLARACIÓN (jefe)

### H1 · editar precio de UN ingrediente
- **Forma**: `inline-gesture` — la cifra € en la tarjeta es un toque→input numérico
  → Enter confirma. **Eco del anterior** visible ("antes 0,50 €") durante la edición.
- **RPC**: `ingredientes.update { id, precio_extra: <euros float> }`
- **señal-refresh**: `ingrediente.actualizado` (1 por ingrediente, con diff
  `precio_extra: {anterior, nuevo}`) → re-lee list; nunca escritura local optimista
  del valor final (R: el store solo escribe lo que devuelve una lectura).

### H2 · editar FICHA del ingrediente (nombre, familia, alérgenos)
- **Forma**: `editor-bloque` — un bloque/modal con los 4 campos juntos:
  nombre (texto), familia (texto con valor actual), es_alergeno (toggle),
  alergenos[] (chips; sugeridos desde la op `alergenos`).
- **RPC**: `ingredientes.update { id, nombre?, familia?, es_alergeno?, alergenos? }`
- **señal-refresh**: `ingrediente.actualizado` con diff por campo.

### H3 · editor de LOTE de precios (`update_precios`) — la operativa del jefe por excelencia
- **Forma**: `editor de LOTE` — vista/tabla editable: una fila por ingrediente
  (nombre · precio € en input · estado de fila). Columna de precio editable
  fila a fila con Enter; al confirmar, se envía EN UNA LLAMADA por alcance:
  - lote de GRUPO → `ingredientes.update_precios { grupo, precio_extra }`
  - catálogo completo → `ingredientes.update_precios { precio_extra }` (sin filtro)
  - NOTA DE CONTRATO: el handler NO acepta `[{id, precio}...]`; el lote es
    "una cifra para el alcance" (fija) o "un %" (porcentual), o el gesto
    inline H1 repetido precio a precio.
  - modo % → `ingredientes.update_precios { grupo?, porcentaje }`
- **Dictamen**: respuesta trae `actualizados[]{id, nombre, anterior, nuevo}` +
  llegan **N señales** `ingrediente.actualizado` (una por ingrediente — el
  módulo publica DENTRO del for). La vista debounca (60ms) y re-lee list UNA vez.
- **Guarda de contrato (R6 — céntimos↔euros)**: el motor persiste EUROS float
  redondeado a 2 decimales (L472). La UI edita y envía €. Sin conversión ×100.
- **Advertencia de forma**: con `porcentaje` el efecto es COMPUESTO sobre el
  valor vigente de cada ingrediente — la UI lo nombra ("+5% sobre cada precio
  vigente"); un % repetido es un alza doble.

### H4 · alcance del lote / selección de vista
- **Forma**: `ref-select` — select de GRUPO (derivado de la propia lista:
  unión de `grupos[]` de los ingredientes; si el health trae `por_grupo`, es
  corroboración) + búsqueda local por nombre + alcance "todo el catálogo".
- **señal-refresh**: no declara; filtrar re-pide `list {grupo}` o filtra cache.

## Hojas de INFORMACIÓN (neutras que alimentan)

### H5 · cinta-estado del catálogo
- **Forma**: `cinta-estado` — "n ingredientes · n grupos · n con precio extra
  declarado (>0) · n alérgenos". Fuente: `list` derivado + `health.catalogo`
  (por_tipo/por_grupo) como corroboración. Sin navegación.

### H6 · lista del catálogo / grupo
- **Forma**: lista de tarjetas-ficha (la ficha completa viene EN list: no get
  por tarjeta). Orden del servidor: tipo, luego nombre. Grupos derivados en UI.

### H7 · pulso de alérgenos
- **Forma**: `cinta-estado` secundaria o sección: `alergenos` → `por_tipo`
  (tipos de alérgeno → ingredientes que los llevan). Alimenta H2 (chips).

## Señales que sostienen la vista (todas)

| Señal | Emisor real | Efecto en la vista |
|---|---|---|
| `ingrediente.actualizado` (1× por update) | index.js update | re-lee list (debounce 60ms) |
| `ingrediente.actualizado` (N× por lote) | index.js update_precios (dentro del for) | re-lee list UNA vez (debounce absorbe el tándem) |
| `ingrediente.creado` | sync carta/producto | re-lee list (llega ingrediente nuevo) |
| `carta.actualizada` | externa (carta-manager) | re-puebla catálogo → re-lee list |

**Invariante de señal**: la vista NUNCA recarga; solo re-lee lecturas RPC al
recibir señal. El eco del dictamen del lote viene también en la respuesta RPC
(`actualizados[]`) — se muestra como informe, no como estado local asumido.

## Composición de la vista del jefe (3 capas)

```
1. SELECCIONAR  → ref-select de grupo + búsqueda + alcance (todo/grupo)
2. INFORMARSE   → cinta-estado (H5) + tarjetas con precio vigente y alérgenos (H6/H7)
3. DECLARAR     → H1 precio inline · H2 ficha en editor-bloque · H3 editor de LOTE
```

Frecuencia → jerarquía: inline en vista (precio), editor-bloque para lo raro,
lote como vista/tabla a la que se entra con botón nombrado ("Ajustar precios
en lote").