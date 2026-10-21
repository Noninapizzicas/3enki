# ESQUEMA — cara del JEFE del módulo `marca-cliente` (raíz, reflejo-0.1.0)

> Árbol maestro consolidado (pasadas 1-2). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente.
> El análisis es de la CARA DEL JEFE — la utilización (atender al cliente en
> el POS) queda anotada pero fuera del panel del jefe.

## 1. Quién es el jefe y qué decide

Dueño y CUSTODIO SINGLE-WRITER de la **relación con el cliente** del proyecto:
las reglas de marca (voz, presencia digital), los clientes (datos de contacto)
y la fidelización (puntos/recompensas). Base compartida `/pizzepos/marca.json`
(contrato `marca-v1`), servida por RPC. El resto del sistema bebe sus valores
por lectura; los nulls del contrato son política POR DECLARAR (los puebla el
dueño vía `reglas.actualizar`).

Decide — las 4 secciones de la relación con el cliente (`DEFAULT_REGLAS`):
- **D1 — la VOZ** (`voz`): `tono`, `valores[]`, `tradicion_referencia` — cómo
  suena la marca.
- **D2 — la PRESENCIA** (`presencia`): `canales[]` — dónde está la marca.
- **D3 — los CLIENTES** (`clientes`): `lista[]` de clientes por contacto
  (teléfono/email), con sus `puntos`.
- **D4 — la FIDELIZACIÓN** (`fidelizacion`): `activa` (bool), `puntos_por_euro`,
  `recompensas[]` — el programa de puntos.

El **jefe** decide la POLÍTICA de la relación con el cliente. La ATENCIÓN al
cliente (consultar un cliente por contacto, sus puntos/recompensas) es
UTILIZACIÓN — sucede en el POS al atender.

## 2. Invariantes (restricciones honestas, verificadas en código)

- INV1 — **single-writer**: el reflejo escribe `/pizzepos/marca.json`
  (ConfigCustodio, fs) y `reglas.actualizar` es la ÚNICA escritura.
- INV2 — **validación por campo del cambio**: el custodio valida SOLO lo que
  viene (validadores por bloque: voz/presencia/clientes/fidelizacion). Un campo
  ausente no se toca. `fidelizacion.puntos_por_euro` debe ser número > 0 o null.
- INV3 — **sin 404 de lectura**: `reglas.leer` devuelve SIEMPRE la estructura
  completa (`config` persistida o el DEFAULT si no existe), con `fuente` =
  'persistida' | 'default'. La falta de reglas es estado NOMBRADO, no error.
- INV4 — **el dictamen viene en la respuesta** de `reglas.actualizar`
  (200 `{ reglas: nuevas }`) y la señal `marca.reglas.actualizadas` re-asienta
  la vista.
- INV5 — **estado 'null / vacío' = "por declarar"**: la vista lo nombra en
  claro (nunca lo pinta como fallo).
- INV6 — **multi-tenant**: todo RPC lleva `project_id` (lo inyecta la capa de
  request de la UI); el store JSON vive por proyecto bajo `/pizzepos/marca.json`.
- INV7 — **utilización separada**: `cliente.obtener`/`fidelizacion.obtener`
  necesitan `contacto` (string requerido) — son consultas puntuales de atención,
  no parte de la DECLARACIÓN del jefe.

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal de confirmación | Payload |
|---|---|---|
| `reglas.actualizar` | `marca.reglas.actualizadas` | { project_id, reglas: nuevas } |

UNA sola señal; la publica ConfigCustodio al persistir (`camposDatos: 'reglas'`).
Las lecturas (`reglas.leer`, `voz.obtener`, `presencia.obtener`,
`cliente.obtener`, `fidelizacion.obtener`) NO emiten señal — son neutras/
utilización. Cadena verificada: reflejo (index.js:132 `_custodio.actualizar`) →
eventBus core → MQTT → frontend dot-notation.

## 4. Veredicto del árbitro (3/3) y composición de la vista

```
¿ESCRIBE en la relación con el cliente (via reglas.actualizar)? → JEFE
¿SE EJECUTA en el momento de la atención al cliente (POS)?      → UTILIZACION
¿SOLO LEE estado o calcula?                                      → NEUTRO
```

- **jefe (1)**: `reglas.actualizar` — LA DECLARACIÓN de la relación (único escritor).
- **utilizacion (2)**: `cliente.obtener` + `fidelizacion.obtener` — al atender en
  el POS se consulta un cliente por contacto y sus puntos/recompensas.
- **neutro (3)**: `reglas.leer` + `voz.obtener` + `presencia.obtener` — informan
  la decisión.

Composición del panel del jefe (3 capas):

```
1. INFORMARSE   reglas.leer: la relación vigente en claro, por bloques (voz /
                presencia / clientes / fidelizacion), distinguiendo lo declarado
                de lo "por declarar" (nulls o [])
2. DECLARAR     editor-bloque REGLAS: LA DECLARACIÓN — voz (tono/valores/
                tradicion), presencia (canales), fidelizacion (activa/
                puntos_por_euro/recompensas). Cada bloque 1 llamada
                reglas.actualizar { cambios: { bloque } } (validación por campo,
                INV2). [ABIERTO] la lista de clientes (cliente.obtener es
                consulta puntual; el alta masiva de clientes no tiene escritura
                UI dedicada en este ciclo)
3. CONFIRMAR    dictamen de la respuesta + señal marca.reglas.actualizadas
                re-lee el informe (debounce). Nunca recarga.
```

(R1 frecuencia: voz y fidelización frecuentes, presencia set-and-refine.
R2 sin estado asumido — el panel lee siempre para llenar borradores.
R3 la señal manda + dictamen RPC. R4 transparencia de origen con `fuente`.)

**Nota de rol**: los `ui.roles` que ya traía el blueprint viejo (de la saga
d91f077c) se CONFIRMAN correctos: `reglas.actualizar`=jefe, lecturas=neutro,
`cliente/fidelizacion.obtener`=utilizacion. La UI de este ciclo construye la
cara del JEFE (`reglas.actualizar`); la utilización se anota pero no se
implementa aquí (vive en el POS).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| Informe de la relación | cinta-estado + informe por bloques (voz/presencia/clientes/fidelizacion), nulls y [] como "por declarar" | reglas.leer | re-leída por la señal |
| Voz | editor-bloque (tono/valores/tradicion_referencia) | reglas.actualizar { cambios: { voz } } | marca.reglas.actualizadas |
| Presencia | editor-bloque (canales, csv) | reglas.actualizar { cambios: { presencia } } | marca.reglas.actualizadas |
| Fidelización | editor-bloque (activa bool + puntos_por_euro + recompensas csv) | reglas.actualizar { cambios: { fidelizacion } } | marca.reglas.actualizadas |

## 6. Huecos [ABIERTO] — decisiones del dueño, se NOMBRAN (pasada-1 §5)

1. Alta/edición de clientes individuales (la `lista[]` de clientes no tiene
   escritura UI dedicada en este ciclo — `cliente.obtener` es consulta puntual
   de utilización). El jefe puebla clientes por contrato vía cambios, pero la
   UI actual se centra en voz/presencia/fidelización.
2. Eventos granulares por bloque (marca.voz.actualizada, etc.) — la señal es
   de módulo (`marca.reglas.actualizadas`) con la reglas completas.
3. Recompensas como tipos validados (café gratis vs % descuento) — hoy son
   strings libres en `recompensas[]`.

Huecos de CONTRATO (faltan campos/señales), no de CAPTURA: la UI no pide nada
que el módulo no soporte.
