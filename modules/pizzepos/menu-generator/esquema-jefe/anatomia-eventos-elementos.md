# ANATOMÍA — eventos y elementos de `menu-generator` (visto desde el JEFE)

> Mapeo de eventos reales (index.js leído, no el manifest) + elementos que la
> cara del jefe consume. Fuente: `modules/pizzepos/menu-generator/index.js`
> (reflejo-1.1.0) + `module.json` + `menu-generator.blueprint.json` v12.2.0
> + el filesystem (puente fs.write, `modules/filesystem/index.js` L306-309).

## 1. Eventos del módulo (lo real, con líneas)

| Evento | Línea | Qué es |
|---|---|---|
| `onImportRequest` | L56 | ÚNICO handler del módulo: 1 línea → `_atender(e, 'import', 'menu.import.response', d => this._import(d))` — la base híbrida hace el resto. |
| `menu.import.response` | L56 | Respuesta top-level `{request_id, status, data\|error}` — nunca anidada bajo `result`. |
| `_import` | L58-105 | Operación determinista: valida → lee fuente → proyecta → 1 `carta.save.request` (15s) → dictamen. |
| `carta.save.request` | L89 | RPC INTERNO al custodio (timeout 15s) — la persistencia es de carta-manager. |
| `_rutasFuente` | L108-120 | `material_path` + `material_ref` + `attachments[]` (no-imágenes). El reflejo NO acepta JSON inline — SOLO rutas. |
| dictamen 200 | L98-105 | `{carta_id, nombre, categorias: int, productos: int}` — la única data que responde. |
| errores | L62-104 | 400 INVALID_INPUT (falta project_id/nombre/fuente) · 404 RESOURCE_NOT_FOUND (JSON ilegible) · 422 UPSTREAM_INVALID_RESPONSE (sin productos/categorías) · 503 UPSTREAM_UNREACHABLE · 502 (status del custodio). |

## 2. Señales — la invariante DISTINTA del módulo

- menu-generator **NO publica señal propia** (manifest sin publishes). Nada
  que suscribir del módulo mismo.
- La confirmación del import llega por la **SEÑAL INDIRECTA del custodio**:
  - `carta.actualizada` — carta-manager L294 (save/restore/clonar/activar);
    nueva carta = version 1, estado 'borrador'.
  - `carta.editada` — opcional, _mutar L15 (por si el jefe edita la carta
    justo tras importarla desde otro panel).
- Correlación: por `project_id` (multi-tenant — señales de otro negocio se
  ignoran). Suscripción con debounce 60ms (molde carta-jefe.ts).

## 3. El canal RPC (verificado, NO es ui/request ni dot-notation)

- topic de entrada: `core/*/events/menu/import/request` — **asterisco
  LITERAL** (el EventBus del core solo re-emite a módulos locales los topics
  con `*`; dot-notation NO cubre este caso).
- respuesta: suscripción dot-notation `menu.import.response` filtrando
  `request_id` propio (molde carta-jefe.ts L100-172: request_id propio +
  timeout + respuesta.data).
- envelope amigable: `request_id` + `project_id` en el cuerpo; el envelope lo
  envuelve `publish()` de `$lib/ui-core/mqtt`.
- Timeout del panel: **20s** (mínimo — carta.save interno ya consume 15s).

## 4. El PUENTE para el paste-JSON (vía fs.write del filesystem)

El reflejo exige RUTAS, no JSON inline — el panel tiende el puente:
- filesystem `onWriteRequest` (L306-309): acepta `{path, content, encoding?,
  expected_hash?}` → responde `fs.write.response` (paths relativos a la raíz
  del proyecto).

```
editor (paste o drag-file → FileReader.readAsText)
  → fs.write.request { project_id, path:'/pizzepos/imports/<slug>.json', content: <json TAL CUAL> }
  → 201 { path, hash }
  → menu.import.request { project_id, nombre, material_ref: <path> }
  → menu.import.response { request_id, status:200, data:{carta_id, nombre, categorias, productos} }
```

- filesystem `onWriteRequest` (L306-309): acepta `{path, content, encoding?,
  expected_hash?}` → responde `fs.write.response` (shape canónico, paths
  relativos a la raíz del proyecto).
- El JSON viaja VERBATIM (FIDELIDAD): la UI no compone, no re-ordena, no
  "mejora" nada — solo lo transporta.

## 5. Elementos del panel del jefe (los que dibuja el agente de UI)

| Elemento | Forma | Fuente de datos |
|---|---|---|
| Cinta del importador | cinta-estado | estado local del canal + proyecto activo |
| Editor JSON grande | editor-json | paste / drag-file (H1a/H1b) |
| Input nombre | inline-gesture | obligatorio del reflejo |
| Validación mínima | informes-captura | JSON.parse + categorias/productos + errores nombrados 400/404/422 |
| Botón IMPORTAR | transicion-un-llamado | 1 llamada, deshabilitado en vuelo, espera 20s |
| Banner dictamen | cinta-dictamen | `{carta_id, nombre, categorias, productos}` + nota borrador |
| Suscripción custodio | señal-refresh | `carta.actualizada` (+ `carta.editada`) filtrando project_id, debounce 60ms |

## 6. Huecos del módulo (nombrados, no cerrados)

- drag&drop con FilePicker nativo del core (attachments[].path al storage) —
  ABIERTO.
- OCR/PDF vía menu-ocr/menu-pdf2img/menu-prepare (módulos hermanos de la
  página) — ABIERTO, decisión del dueño.
- multi-fichero/lote (1 JSON = 1 carta por llamada; la primera fuente válida
  gana) — ABIERTO.
- cara agéntica (`generar`/TEXTO_LIBRE del blueprint v12.2.0) — SIN op real
  detrás en el reflejo actual; aparcada — ABIERTO.