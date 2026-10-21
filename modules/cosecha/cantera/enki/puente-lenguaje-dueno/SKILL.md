---
name: puente-lenguaje-dueno
description: >-
  Skill FULL del módulo MICRO-AGENTE (mitad refleja) `puente-lenguaje-dueno` de la vertical
  contabilidad (Enki). Traductor BIDIRECCIONAL entre el lenguaje del DUEÑO y la contabilidad:
  `a_consulta` (su pregunta en lenguaje natural → consulta contable estructurada) y `a_cifra`
  (un cálculo/cifra contable → la cifra en SU idioma). El juicio lingüístico es la mitad FUZZY
  (blueprint); esta mitad refleja es la DETERMINISTA y HONESTA: traduce con el VOCABULARIO y las
  PLANTILLAS DECLARADOS, sin adivinar significado ni inventar frases. Lo no reconocido y las
  cifras sin plantilla se declaran (`no_reconocido`/`abierto`). Dos RPC, ambas CLASE PREGUNTA.
when-to-use: >-
  - Cuando necesites traducir una pregunta del dueño a consulta contable, o una cifra a su
    idioma (RPC puente-lenguaje-dueno.a_consulta.request / .a_cifra.request).
  - Cuando depures por qué hay términos en `no_reconocido` (falta vocabulario declarado) o por
    qué `traducido:false` (falta la plantilla de la cifra).
  - Cuando quieras entender su contrato de eventos: es traductor puro, no publica hecho.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, micro-agente, stateless, contabilidad, analitica, lenguaje, traduccion, dueno]
---

# puente-lenguaje-dueno — MICRO-AGENTE traductor bidireccional

## Qué hace el módulo

`puente-lenguaje-dueno` es un **MICRO-AGENTE** (Q2, hoja del plan), en su **mitad REFLEJA**
(stateless). Es un traductor **BIDIRECCIONAL** entre el lenguaje del DUEÑO y el de la
contabilidad:

- **`a_consulta`** — su pregunta en lenguaje natural → una **consulta contable estructurada**.
- **`a_cifra`** — un cálculo/cifra contable → esa cifra en **SU idioma** (frase legible).

El **juicio lingüístico** (interpretar frases libres) es la mitad **FUZZY** del híbrido y vive
en el blueprint del módulo. Esta mitad refleja es la parte **DETERMINISTA y HONESTA**: traduce
con el **VOCABULARIO** y las **PLANTILLAS DECLARADOS** por el sitio. **NO adivina** el
significado de una palabra ni **inventa** una frase: sin vocabulario/plantilla declarados, lo
no reconocido se **DECLARA** (no se estima).

**Dato ausente = desconocido**: términos no reconocidos y frases sin plantilla quedan en
`no_reconocido`/`abierto`; jamás se rellenan con una suposición. Ambas RPC son **CLASE
PREGUNTA** → sin panel; su cara es el bus.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `puente-lenguaje-dueno.a_consulta.request` | `onAConsultaRequest` | RPC (**PREGUNTA**, por el bus): `{project_id, pregunta, vocabulario?}` → `{project_id, pregunta, consulta, terminos_reconocidos, no_reconocido, abierto}`. Traduce solo los términos del vocabulario declarado; el resto es juicio (mitad fuzzy) y se declara. Responde por `.a_consulta.response`. |
| `puente-lenguaje-dueno.a_cifra.request` | `onACifraRequest` | RPC (**PREGUNTA**, por el bus): `{project_id, cifra, clave?, plantillas?}` → `{project_id, clave, cifra, frase, plantilla_usada, traducido, abierto}`. Viste la cifra con la plantilla declarada; sin plantilla → `traducido:false` (no se inventa la frase). Responde por `.a_cifra.response`. |

> **Nota de deriva (R3):** el plan declara escucha de `contabilidad.asiento_asentado`, pero el
> `module.json` real **solo** declara los dos RPC. Ningún módulo del repo emite aún ese hecho
> (`escritor-diario` B2 es de un grupo posterior); declararlo daría cadena colgada.

### Publishes

| Evento | Cuándo |
|---|---|
| `puente-lenguaje-dueno.a_consulta.response` | Respuesta RPC correlada de la op `a_consulta`. |
| `puente-lenguaje-dueno.a_consulta.failed` | Fallo determinista: falta `project_id` o `pregunta`. |
| `puente-lenguaje-dueno.a_cifra.response` | Respuesta RPC correlada de la op `a_cifra`. |
| `puente-lenguaje-dueno.a_cifra.failed` | Fallo determinista: falta `project_id` o `cifra`. |

> **No publica hecho de dominio**: traductor puro (no escribe estado) → no hay `contabilidad.*`
> que anunciar (R2). Cada handler publica su `*.failed` solo si `status !== 200`.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `a_consulta` | **PREGUNTA** (bus) | `{project_id, pregunta, vocabulario?\|diccionario?}` | `{project_id, tipo, direccion:'pregunta_a_consulta', pregunta, consulta, terminos_reconocidos, no_reconocido, vocabulario_declarado, abierto}` | 400 `INVALID_INPUT` (`project_id`/`pregunta`) |
| `a_cifra` | **PREGUNTA** (bus) | `{project_id, cifra\|calculo, clave?\|tipo_cifra?, plantillas?\|frases?}` | `{project_id, tipo, direccion:'calculo_a_cifra', clave, cifra, frase, plantilla_usada, traducido, abierto}` | 400 `INVALID_INPUT` (`project_id`/`cifra`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Validación**: sin `project_id` → `_invalid('project_id')`; en `a_consulta` sin `pregunta` →
   `_invalid('pregunta')`; en `a_cifra` sin `cifra` (ni `calculo`) → `_invalid('cifra')`.
2. **Vocabulario declarable** (`_vocabulario`): `input.vocabulario`/`diccionario` como objeto
   `{termino del dueño → campo/cuenta}`. **Ninguno cableado.** Sin él → `vocabulario_declarado:false`
   y `abierto.vocabulario` declarado; la `consulta` sale vacía.
3. **Reconocimiento determinista**: se recorre el vocabulario declarado y, si el término aparece
   en la pregunta (`_contiene`, case-insensitive), se añade a `terminos_reconocidos` y su destino
   (`Object.assign` si es objeto, o `consulta[termino]=destino`).
4. **`no_reconocido`**: se tokeniza la pregunta (`_palabras`) y las palabras que no corresponden a
   ningún término reconocido se listan, **filtrando las palabras vacías** (`_ESTOP`: de, la, el,
   cuanto, como, mes, año…). Si hay no reconocidos → `abierto.juicio` declara que su
   interpretación es la mitad fuzzy.
5. **Plantillas declarables** (`_plantillas`): `input.plantillas`/`frases` como objeto
   `{clave → frase con marcadores}`. La clave sale de `input.clave` o `input.tipo_cifra`.
6. **`a_cifra`**: si existe plantilla para la clave → la usa; si no y hay `plantillas.canonica`
   → usa la canónica (traducción por defecto, sin inventar lengua). Si no hay ninguna → `frase:null`,
   `traducido:false` y `abierto.plantilla` declarado.
7. **Render** (`_render`): sustituye `{campo}` por el valor de la cifra (o de `input`); los
   marcadores sin valor → cadena vacía; colapsa espacios y recorta.
8. **Determinista y stateless**: no guarda nada, no persiste.

## Cómo se usa (RPCs)

### 1. a_consulta — pregunta del dueño → consulta contable

```json
{
  "project_id": "e57a318a-...",
  "pregunta": "¿cuánto me deben los clientes este mes?",
  "vocabulario": { "me deben": { "cuenta": "430", "tipo": "saldo_deudor" }, "clientes": { "grupo": "430" } }
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "tipo": "puente-lenguaje-dueno", "direccion": "pregunta_a_consulta", "pregunta": "¿cuánto me deben los clientes este mes?", "consulta": { "cuenta": "430", "tipo": "saldo_deudor", "grupo": "430" }, "terminos_reconocidos": ["me deben","clientes"], "no_reconocido": [], "vocabulario_declarado": true, "abierto": { "vocabulario": null, "juicio": null } }
```

### 2. a_cifra — cifra → idioma del dueño

```json
{
  "project_id": "e57a318a-...",
  "clave": "saldo_clientes",
  "cifra": { "importe": 12345.67 },
  "plantillas": { "saldo_clientes": "Me deben {importe} euros" }
}
```
Respuesta `200`: `{frase:'Me deben 12345.67 euros', plantilla_usada:'Me deben {importe} euros', traducido:true}`.

### Fallo — sin plantilla

```json
{ "project_id": "e57a318a-...", "clave": "desconocida", "cifra": { "importe": 1 } }
```
Respuesta `200`: `frase:null, traducido:false`, `abierto.plantilla` declarado (no es error; es
honestidad).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`pregunta` / `cifra`) | falta el cuerpo a traducir. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** ninguna escucha real declarada (ver nota R3).
- **Quién la usa:** la capa conversacional del dueño; su mitad fuzzy (blueprint) interpreta lo
  no reconocido. El juicio de vocabulario/plantillas lo declara el sitio.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-analitica/puente-lenguaje-dueno/module.json` + `index.js`.
2. Smoke `a_consulta`: con vocabulario → `consulta` poblada y `terminos_reconocidos`.
3. Sin vocabulario → `vocabulario_declarado:false`, `consulta:{}`, `abierto.vocabulario` declarado.
4. Smoke `a_cifra`: con plantilla → `traducido:true`; sin plantilla → `traducido:false`.
5. `grep -E '"event"' module.json` (solo los dos `.request`).

## Notas de implementación

- Clase `PuenteLenguajeDueno extends ModuloHibridoReflejo`; `name = 'puente-lenguaje-dueno'`,
  `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- Handlers `onAConsultaRequest`/`onACifraRequest` delegan en `_atender` y publican su
  `*.failed` si `status !== 200`.
- Proyecciones `_a_consulta`/`_a_cifra`; helpers `_vocabulario`, `_plantillas`, `_render`,
  `_contiene`, `_palabras`, y el set `_ESTOP` (palabras vacías). Tools `toolAConsulta`/`toolACifra`.
