---
name: puerto-documento-digital
description: >-
  Skill FULL del módulo PUENTE `puerto-documento-digital` de la vertical contabilidad (Enki).
  Recepción DIGITAL declarable: adapta el strategy-pattern de `facturacion/fuentes`, encadena el
  documento y publica el hecho `contabilidad.documento_recibido`. **La fuente/canal es DATO
  declarable** (FUENTE_NO_DECLARADA si falta). SUBE por EVENTO a `normalizador-hecho` (A2) y
  `extraccion-dato` (A4.1). Sin store propio (PUENTE). La op `recibir` es ORDEN → system_panel.
when-to-use: >-
  - Cuando necesites recibir un documento digital por un canal declarado
    (RPC puerto-documento-digital.recibir.request).
  - Cuando depures `FUENTE_NO_DECLARADA` (400) o por qué se rechaza el documento.
  - Cuando quieras entender su contrato de eventos y su encadenado al pipeline de entrada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, entrada, recepcion, digital, canales]
---

# puerto-documento-digital — PUENTE de recepción digital

## Qué hace el módulo

`puerto-documento-digital` es un **PUENTE** (A5, hoja del plan) de la vertical **contabilidad**, eje
**entrada**. Es la **recepción digital declarable**: recibe un documento por un **canal digital
declarado** y **adapta el strategy-pattern de `facturacion/fuentes`**.

> **La fuente/canal es DATO declarable** (`fuente`): el **adaptador lo pone el sitio**, no se cablea.
> Si falta la fuente → `400 FUENTE_NO_DECLARADA` con la lista de fuentes declarables.

Al recibir, **anuncia el hecho** `contabilidad.documento_recibido` (R2: recibe → escribe) y **SUBE por
EVENTO** al pipeline de entrada: `normalizador-hecho.entrar.request` (A2) y `extraccion-dato.juzgar.request`
(A4.1). **No interpreta ni escribe el contenido** — eso es de otras piezas.

La op `recibir` es **ORDEN** → `ui_handler` `system_panel`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `puerto-documento-digital.recibir.request` | `onRecibirRequest` | RPC puente (ORDEN): `{project_id, documento, fuente?, formato?, origen?, metadatos?, fuentes_declarables?}` → `{fuente, recibido:true, documento, adapta:'facturacion/fuentes', contrato_traducido, encadenado_a:'normalizador-hecho', abierto}`. Delega en `_atender` → `_recibir`. Al recibir publica el hecho y encadena; si `status ≠ 200` publica `.failed`. Responde por `puerto-documento-digital.recibir.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.documento_recibido` | Fire-and-forget (A5): al recibir → `{project_id, documento, fuente, formato, origen, recibido_en, correlation_id}`. Lo lee `captura-documento` (A3). |
| `normalizador-hecho.entrar.request` | Sube al pipeline de entrada (A2, normaliza el hecho). |
| `extraccion-dato.juzgar.request` | Sube al pipeline de entrada (A4.1, lo vuelve dato). |
| `puerto-documento-digital.recibir.response` / `.recibir.failed` | Respuesta + par de fallo de `recibir`. |

> **SÍ publica un HECHO** (`contabilidad.documento_recibido`): recibir **es escribir** → R2 obliga a
> anunciarlo. Además encadena a A2 y A4.1 por EVENTO.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `recibir` | **ORDEN** (ui_handler: system_panel) | `{project_id, documento:{…, fuente?}, fuente?, formato?, origen?, metadatos?, fuentes_declarables?}` | `{project_id, tipo:'puerto-documento-digital', fuente, recibido:true, documento, formato, origen, metadatos, adapta:'facturacion/fuentes', contrato_traducido, recibido_en, encadenado_a:'normalizador-hecho', abierto}` | `400 INVALID_INPUT` (falta `project_id` o `documento`); `400 FUENTE_NO_DECLARADA` (sin fuente); `500`. |

## Reglas de negocio

1. **Documento obligatorio**: `documento` ausente o no-objeto → `400 INVALID_INPUT documento`.
2. **La fuente es DATO declarable**: `fuente` → o `documento.fuente`. Sin ninguna → `400 FUENTE_NO_DECLARADA`
   con `{fuentes_declarables}`. **El adaptador lo pone el sitio, no se cablea.**
3. **Contrato de origen traducido**: `adapta:'facturacion/fuentes'` y
   `contrato_traducido:{de:'factura.entrada', a:'contabilidad.documento_recibido'}` (strategy-pattern).
4. **No interpreta**: se declara `encadenado_a:'normalizador-hecho'`; el contenido va a A2/A4.1.
5. **Encadenado best-effort** (`_encadenar`): publica `normalizador-hecho.entrar.request` y
   `extraccion-dato.juzgar.request` con `origen:'puerto-documento-digital'`.
6. **Sin estado propio** (PUENTE): no persiste.
7. **HTTP exacto**: éxito `200`; sin documento/fuente → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Recibir un documento digital

```json
{
  "project_id": "e57a318a-...",
  "documento": { "id": "4455", "contenido": "…", "formato": "xml" },
  "fuente": "email-adjunto",
  "formato": "xml",
  "metadatos": { "remitente": "proveedor@acme.es" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "puerto-documento-digital",
  "fuente": "email-adjunto",
  "recibido": true,
  "documento": { "id": "4455", "contenido": "…", "formato": "xml" },
  "formato": "xml",
  "origen": "digital",
  "metadatos": { "remitente": "proveedor@acme.es" },
  "adapta": "facturacion/fuentes",
  "contrato_traducido": { "de": "factura.entrada", "a": "contabilidad.documento_recibido" },
  "recibido_en": "2026-09-30T...",
  "encadenado_a": "normalizador-hecho",
  "abierto": { "fuente": null, "documento": null }
}
```
Emite `contabilidad.documento_recibido` + sube a A2 y A4.1.

### Sin fuente — se rechaza

```json
{ "project_id": "...", "documento": { "id": "1" } }
```
→ `400 FUENTE_NO_DECLARADA` con `{fuentes_declarables}`.

### Fallo — falta documento

`{ "project_id": "..." }` → `400 INVALID_INPUT documento`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `FUENTE_NO_DECLARADA` | 400 | No se declaró la fuente/canal digital. |
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `documento`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Sube a**: `normalizador-hecho.entrar.request` (A2), `extraccion-dato.juzgar.request` (A4.1).
- **Publica el hecho** `contabilidad.documento_recibido` que lee `captura-documento` (A3).

## Verificación

1. Fichero: `modules/contabilidad-entrada/puerto-documento-digital/`.
2. Eventos reales: subscribes `puerto-documento-digital.recibir.request`; publishes
   `contabilidad.documento_recibido`, `puerto-documento-digital.recibir.response`, `.recibir.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/puerto-documento-digital/index.js
   # → contabilidad.documento_recibido / normalizador-hecho.entrar.request / extraccion-dato.juzgar.request / puerto-documento-digital.recibir.failed
   ```
4. Test unitario (si existe): recibe con fuente → hecho + encadena; sin fuente → `FUENTE_NO_DECLARADA`;
   sin documento → 400; sin `project_id` → 400.
