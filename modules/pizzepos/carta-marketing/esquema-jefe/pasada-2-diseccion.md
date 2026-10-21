# PASADA 2 — recursión JEFE: formas UI de cada hoja + señales pareadas

> Bajada hasta hoja DIBUJABLE. Umbral de atómico-UI: el agente de UI puede
> trazarse sin preguntar nada más. FORMAS de esta variante: ref-select,
> inline-gesture, editor-bloque, confirmador-nombrado, cinta-estado,
> señal-refresh. Fuente de shapes: index.js (L1-199) leído entero +
> marca.schema.json.

## Recursión: la declaración se abre en sus secciones reales

`update_perfil { campos }` (campos = parche parcial por sección, deep-merge)
se descompone en las 3 hojas de SECCIÓN que el esquema soporta (voz, visual,
publico) + la esencia (el mínimo para arrancar). Cada hoja es un editor-bloque
que envía SOLO su sección.

### Hoja J1 · editor-bloque VOZ — `update_perfil { voz: {...} }`

- Campos del shape real (marca.schema.json `voz`):
  - `tono` — array de strings (2-3 adjetivos: cercana, gamberra, elegante…).
  - `registro` — string (tú/usted, formal/desenfadada).
  - `referencias` — array de strings (inspiraciones: poetas, marcas).
  - `si` — array de strings (lo que SÍ hace la voz).
  - `no` — array de strings (lo que NUNCA hace).
- Señal pareada: **`marketing.perfil.actualizado`** (1×, con campos_modificados).

### Hoja J2 · editor-bloque VISUAL — `update_perfil { visual: {...} }`

- Campos del shape real (marca.schema.json `visual`):
  - `colores` — objeto rol → hex (principal, acento, fondo…).
  - `tipografias` — objeto rol → familia (titulo, texto…).
  - `estilo` — string (dirección visual en una frase).
  - `logo` — string (RUTA al fichero del logo; NUNCA base64 dentro de marca.json).
- Señal pareada: **`marketing.perfil.actualizado`** (1×).

### Hoja J3 · editor-bloque PÚBLICO — `update_perfil { publico: {...} }`

- Campos del shape real (marca.schema.json `publico`):
  - `quien` — string (familias, jóvenes, inconformistas…).
  - `actitud` — string (qué buscan, cómo viven).
- Señal pareada: **`marketing.perfil.actualizado`** (1×).

### Hoja J0 · editor-bloque ESENCIA (el mínimo) — `update_perfil { esencia: {...} }`

- Campos del shape real (marca.schema.json `esencia`, `required: [nombre]`):
  - `nombre` — string (REQUERIDO por el schema; el mínimo para arrancar).
  - `lema` — string.
  - `proposito` — string (para qué existe, en una frase).
  - `valores` — array de strings.
- Señal pareada: **`marketing.perfil.actualizado`** (1×).

### Hoja N1 (neutro, alimenta el panel) · INFORME — `get_perfil {}`

- → la identidad completa por secciones (esencia/voz/publico/visual/negocio).
- Es la lectura que SIEMPRE pobló la vista (estado inicial + tras cada
  declaración). **El informe abre las secciones vacías con gracia: campo vacío =
  "por declarar", nunca error.** Sin 404: get_perfil devuelve SIEMPRE la
  estructura completa (index.js L77).
- No hay señal propia: es lectura.

## Formas de las hojas de UTILIZACIÓN (veredicto: NADA)

- No hay op de utilización: la marca no se vende ni se consume en un panel — se
  bebe en otros paneles (carta-digital, carta-design, copy). El veredicto del
  árbitro es "utilización: nada".

## Reglas que gobiernan la composición

- **R1 frecuencia → jerarquía**: lo frecuente es la esencia (nombre/lema) y la
  voz; el visual se afina con carta-design; el público es set-once. Todos
  editor-bloque, la esencia PRIMERA (es el mínimo para arrancar).
- **R2 sin estado asumido**: toda mutación por RPC; el store solo escribe con
  datos de una lectura.
- **R3 la señal manda**: tras declarar, la vista re-lee get_perfil cuando llega
  `marketing.perfil.actualizado` (suscripción dot notation, debounce). El
  DICTAMEN inmediato lo da la propia respuesta de update_perfil (200 { marca
  fusionada }) — doble confirmación: respuesta ahora, señal que re-asienta.
  NUNCA recarga de página, nunca estado optimista.
- **R4 el informe distingue origen**: secciones vacías → "por declarar"; la
  marca con esencia.nombre → "identidad vigente". El estado "sin marca" se
  representa como secciones vacías, no como error.

## Dictamen del árbitro (lente de roles, previo al blueprint)

```
¿ESCRIBE en la identidad de marca (via update_perfil)?  → JEFE
¿SE EJECUTA en el momento de la venta/atencion?        → UTILIZACION
¿SOLO LEE estado o calcula?                            → NEUTRO
```

| Op | Llamada | Veredicto | Por qué |
|---|---|---|---|
| update_perfil | carta-marketing.update_perfil.request | **JEFE** | LA DECLARACIÓN: escribe la identidad (único escritor) |
| get_perfil | carta-marketing.get_perfil.request | **NEUTRO** | solo informe: alimenta la vista y la decisión |

2/2 juzgadas. Utilización: NADA (la marca se consume en otros paneles, no se
vende). Composición del panel-jefe: hojas J0+J1+J2+J3 (declarar) + N1
(informarse).
