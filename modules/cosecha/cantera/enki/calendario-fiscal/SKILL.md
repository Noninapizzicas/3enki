---
name: calendario-fiscal
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `calendario-fiscal` de la vertical
  contabilidad (Enki, eje fiscal). Parcela de PLAZOS DECLARABLES. LA LEY ENTRA COMO
  DATO: los plazos/obligaciones (modelo · periodo · fecha límite · periodicidad ·
  importe · estado) se DECLARAN; NUNCA se cablean. Declarar (ORDEN, panel) ESCRIBE,
  anuncia contabilidad.plazo_declarado y dispara el aviso proactivo a motor-avisos.
  Un solo escritor; append-only. Sin fecha límite declarada no se inventa el plazo.
when-to-use: >-
  - Cuando necesites declarar un plazo fiscal o consultar los próximos (RPC
    calendario-fiscal.declarar.request / calendario-fiscal.proximos.request).
  - Cuando depures un 400 INVALID_INPUT fecha_limite o por qué no se emite
    contabilidad.plazo_declarado.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y el aviso
    proactivo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, fiscal, calendario, plazos, append-only]
---

# calendario-fiscal — CUSTODIO CON PERSISTENCIA de los plazos fiscales

## Qué hace el módulo

`calendario-fiscal` es un **CUSTODIO CON PERSISTENCIA** (D6, hoja del plan, eje
fiscal): la **parcela de PLAZOS DECLARABLES**. **LA LEY ENTRA COMO DATO**: los
plazos/obligaciones fiscales (`modelo · periodo · fecha limite · periodicidad ·
importe · estado`) se **DECLARAN**; **NUNCA se cablean** (ni una fecha, ni un
modelo, ni una periodicidad vive en el código).

Al declarar un plazo (**ORDEN, panel**) **ESCRIBE**, anuncia el **HECHO**
`contabilidad.plazo_declarado` y **dispara el AVISO PROACTIVO** subiendo best-effort
`motor-avisos.producir.request` (K2). `proximos` es **PREGUNTA** (por el bus, sin
panel): los plazos declarados en la ventana pedida.

**UN SOLO ESCRITOR; APPEND-ONLY** (re-declarar el mismo plazo apila su estado; nada
se borra). **Invariante**: sin fecha límite declarada **no se inventa el plazo**.
Persiste por proyecto vía **PosPersistencia** (`_shared/pos-persistencia`, storage
`/contabilidad/calendario-fiscal`), restaura en `project.activated` y vuelca en
`onUnload`. `declarar` = **ORDEN** (`ui_handler`, `system_panel`); `proximos` =
**PREGUNTA** (sin `ui_handler`).

> **Nota R3**: el plan declara escucha de `contabilidad.perfil_administrativo_declarado`
> (`perfil-administrativo` D11), pero ese módulo **AÚN NO EXISTE** en el repo → **NO
> se declara** (cadena colgada).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `calendario-fiscal.declarar.request` | `onDeclararRequest` | RPC custodio (ORDEN, panel): `{project_id, modelo?, periodo?, periodicidad?, fecha_limite, importe?, clave?, estado?}` → `{project_id, plazo, declarado, total, append_only, abierto}`. Declara un plazo (la ley como dato); sin `fecha_limite` → `INVALID_INPUT`. Publica `contabilidad.plazo_declarado` y sube `motor-avisos.producir.request`. Responde por `calendario-fiscal.declarar.response`; payload inválido → `calendario-fiscal.declarar.failed`. |
| `calendario-fiscal.proximos.request` | `onProximosRequest` | RPC custodio (PREGUNTA, por el bus): `{project_id, desde?, hasta?, modelo?}` → `{project_id, ventana, plazos, total, total_calendario, abierto}`. Plazos declarados que caen en la ventana; no muta. Responde por `calendario-fiscal.proximos.response`; payload inválido → `calendario-fiscal.proximos.failed`. |
| `project.activated` | `onProjectActivated` | Restaura el calendario fiscal del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.plazo_declarado` | Fire-and-forget (D6): un plazo fiscal quedó declarado (la ley entró como dato) → `{project_id, clave, modelo, periodo, fecha_limite, periodicidad, estado}`. Lo ESCUCHA `motor-avisos` (K2) para el aviso proactivo. |
| `motor-avisos.producir.request` | Subida (REQUEST por EVENTO, best-effort) a K2: produce el aviso proactivo del plazo declarado. |
| `calendario-fiscal.declarar.response` | Respuesta RPC correlada de la op `declarar`. |
| `calendario-fiscal.declarar.failed` | Par de fallo determinista: falta `project_id` o `fecha_limite` → `{status, code, message}`. Cierra el círculo de `declarar.request`. |
| `calendario-fiscal.proximos.response` | Respuesta RPC correlada de la op `proximos` (PREGUNTA). |
| `calendario-fiscal.proximos.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `proximos.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `declarar` | **ORDEN** (panel) | `{project_id, modelo?, periodo?, periodicidad?, fecha_limite, importe?, clave?, estado?}` | `{project_id, plazo, declarado, total, append_only, abierto}` | `400 INVALID_INPUT` (`project_id`, `fecha_limite`) |
| `proximos` | **PREGUNTA** (bus) | `{project_id, desde?, hasta?, modelo?}` | `{project_id, ventana, plazos, total, total_calendario, abierto}` | `400 INVALID_INPUT project_id` |

Tools expuestas: `calendario-fiscal.declarar` (`toolDeclarar`) y
`calendario-fiscal.proximos` (`toolProximos`). Lectura de proceso: `plazosDe(...)`.

## Reglas de negocio

1. **La ley entra como dato**: `modelo`, `periodo`, `fecha_limite`, `periodicidad`,
   `importe`, `estado` se DECLARAN. **Nada se cablea.**
2. **Sin fecha límite no se inventa el plazo** → `400 INVALID_INPUT fecha_limite`.
3. **APPEND-ONLY**: re-declarar el mismo plazo **apila** su estado (`declarado`,
   `total`); **nada se borra**.
4. **UN SOLO ESCRITOR**: la parcela la encadena el custodio (`_obtenerOCrear`,
   `_clave`).
5. **R2 + aviso proactivo**: al declarar se publica `contabilidad.plazo_declarado` y se
   sube best-effort `motor-avisos.producir.request` (K2).
6. **`proximos` no muta**: filtra por ventana (`desde`/`hasta`) y `modelo`;
   `abierto.calendario` si no hay plazos declarados todavía.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `declarar` — declarar un plazo (la ley como dato)

```json
{
  "project_id": "e57a318a-...",
  "modelo": "303",
  "periodo": "3T",
  "periodicidad": "trimestral",
  "fecha_limite": "2026-10-20",
  "clave": "303-3T-2026",
  "estado": "PENDIENTE",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.plazo_declarado` + sube a K2):
```json
{ "project_id": "e57a318a-...", "plazo": { "clave": "303-3T-2026", "modelo": "303", "periodo": "3T", "fecha_limite": "2026-10-20", "periodicidad": "trimestral", "estado": "PENDIENTE" }, "declarado": true, "total": 1, "append_only": true, "abierto": { "importe": "no se declaro importe" } }
```

### `proximos` — plazos en la ventana

```json
{ "project_id": "e57a318a-...", "desde": "2026-10-01", "hasta": "2026-10-31" }
```
Respuesta `200`: `{ "ventana": { "desde": "2026-10-01", "hasta": "2026-10-31" }, "plazos": [ { "clave": "303-3T-2026", "fecha_limite": "2026-10-20" } ], "total": 1, "total_calendario": 1, "abierto": null }`.

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `fecha_limite` — falta el campo; sin fecha límite
  no se inventa el plazo.
- `200 {abierto.calendario}` — no hay plazos declarados todavía (la ley entra como
  dato).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `contabilidad.plazo_declarado` lo escucha
  `motor-avisos` (K2) para el aviso proactivo. Sube `motor-avisos.producir.request`
  (K2).
- **Hacia atrás (restaura)**: `project.activated`. *`perfil-administrativo` (D11)
  aún no existe (R3).*
- No importa a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-fiscal/calendario-fiscal/` (clase `CalendarioFiscal
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "plazo_declarado" module.json index.js` y confirmar
  `motor-avisos.producir.request` en `index.js`.
- **Test unitario**: `declarar` con fecha límite → `200` + `plazo_declarado`; sin
  fecha límite → `400 INVALID_INPUT`; re-declarar apila; `proximos` filtra por ventana;
  `project.activated` restaura.

## Notas de implementación

- **PosPersistencia** (`file: 'calendario-fiscal.json'`, `dir:
  '/contabilidad/calendario-fiscal'`); restaura en `onProjectActivated`, vuelca en
  `onUnload`.
- Helpers: `_declarar`, `_proximos`, `_fecha`, `_clave`, `_obtenerOCrear`, `plazosDe`,
  `toolDeclarar`, `toolProximos`.
