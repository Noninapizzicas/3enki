# ESQUEMA — cara del JEFE del módulo `menu-generator` (pizzepos v11.2.0, el IMPORTADOR)

> Árbol maestro consolidado (pasadas 1-2 + anatomía). Alimenta al agente de UI
> que escribe el panel del importador. Ley de agnosticismo: cero tecnología de
> sistema ambiente. El análisis es de la CARA DEL JEFE — la utilización (POS,
> PWA, cocina) quedó fuera, anotada.
>
> Fuente: `modules/pizzepos/menu-generator/index.js` (reflejo-1.1.0, UNA op)
> + `module.json` + blueprint agéntico v12.2.0 (aparcado — ver huecos) +
> `modules/filesystem/index.js` (puente fs.write L306-309) + carta-manager
> L294/L15 (la señal INDIRECTA).

## 1. Quién es el jefe y qué decide

El IMPORTADOR masivo de catálogos: la puerta por la que entra una carta
COMPLETA (JSON ya formado de otro sistema, de la PWA anterior, del proveedor).
Su única decisión, y es grande:

- **D1 — IMPORTAR el catálogo** (1 llamada `menu.import`): el jefe trae el
  JSON, le pone nombre, lo revisa y ejecuta el import → la carta nace
  BORRADOR en carta-manager (custodio) con el contenido VERBATIM del JSON
  (FIDELIDAD: el reflejo no inventa nada; precio ausente nace 0).

Frecuencia: baja (alta de negocio, mudanzas de sistema) pero GORDA — cada
gesto incorpora decenas de productos de golpe. Por eso la forma no es un
form de campos sueltos: es **editor-json** (leer antes de incorporar) +
**transición** con espera larga y dictamen numérico.

Lo que NO decide: el contenido de la carta después (carta-manager), cuándo
se activa (custodio), ni cómo se consume (POS/PWA — utilización).

## 2. Invariantes (verificadas en código, restricciones honestas)

- INV1 — **reflejo de UNA op** (`reflejo-1.1.0`): `menu.import` por
  `_atender` (L56) → `menu.import.response` top-level `{request_id, status,
  data|error}`. No hay más operaciones — todo lo demás del blueprint viejo
  (v12.2.0 agéntico: `generar`, freño validar×3, texto libre) NO tiene op
  real detrás hoy.
- INV2 — **el JSON no viaja inline**: el reflejo exige rutas —
  `material_path | material_ref | attachments[]` (L108-120). El JSON del
  editor viaja PRIMERO a fichero (puente fs.write →
  `/pizzepos/imports/<slug>.json`) y entra por `material_ref`. Editor →
  fichero → import: la VÍA DEL PUENTE.
- INV3 — **señal INDIRECTA del custodio**: el módulo NO publica señal propia
  (manifest sin publishes). La confirmación es `carta.actualizada`
  (carta-manager L294; nueva carta = version 1, 'borrador'), opcional
  `carta.editada` (_mutar L15). Correlación por `project_id`.
- INV3b — **doble confirmación, nunca optimismo**: dictamen en la respuesta
  RPC (la única verdad inmediata) + señal del custodio que re-confirma con
  debounce 60ms. Nunca recarga, nunca cantar el import antes de la respuesta.
- INV4 — **espera larga REAL**: el reflejo anida 1 `carta.save.request`
  interno con timeout 15s → el panel no canta timeout antes de **20s**.
- INV5 — **1 JSON = 1 carta por llamada**: `attachments[]` acepta N rutas
  pero lee hasta la PRIMERA fuente válida — la primera gana, el resto se
  ignora (la UI no compone nada: no suma, no mezcla).
- INV6 — **multi-tenant**: todo RPC lleva `project_id` (proyecto activo). Las
  señales del custodio se correelan por `project_id`; las de otro negocio no
  tocan la vista.

## 3. Composición de la vista del jefe (3 capas — gestos del importador)

```
1. INFORMARSE   el JSON de la fuente, legible ANTES de disparar (editor-json
                con validación mínima: parse + categorias[]/productos[] +
                errores nombrados 400/404/422 en el editor) + el nombre.
2. DECLARAR     — (no hay declaración multi-campo: la única "declaración" es
                el gesto IMPORTAR de la capa 3; las fuentes entran
                pegadas/arrastradas en la capa 1)
3. TRANSICIÓN   IMPORTAR (1 llamada menu.import, botón muerto en vuelo,
                espera ≥20s) → DICTAMEN en la respuesta {carta_id, nombre,
                categorias, productos} + carta.actualizada re-confirmando.
```

Frecuencia → jerarquía: el gesto frecuente es PEGAR/ARRASTRAR (cinta arriba);
el IMPORTAR es transición (bloque de acción con frenos); el dictamen, banner
de resultado.

## 4. Formas UI (la disección reparte formas, la vista las compone)

| Hoja | Forma | RPC / señal |
|---|---|---|
| Cinta del importador | cinta-estado | estado del canal (sin lectura RPC propia — módulo sin lecturas) |
| Editor JSON + drag | editor-json | puente fs.write → material_ref (INV2) |
| Nombre de la carta | inline-gesture | dato del request (obligatorio del reflejo) |
| Validación mínima | informes-captura | frena gestos obvios (JSON roto / sin contenido) — el dictamen REAL es el del reflejo |
| IMPORTAR | transicion-un-llamado | `menu.import.request` → `menu.import.response` · señal `carta.actualizada` (INDIRECTA) |
| Dictamen | cinta-dictamen | 200 `{carta_id, nombre, categorias, productos}` + nota «revísala y actívala en carta-manager» |

## 5. Señales (hoja a hoja — cada declaración con su refresh)

- IMPORTAR → dictamen en la respuesta + **carta.actualizada** (custodio,
  L294) con debounce 60ms. Opcional: **carta.editada** (_mutar L15) por si el
  jefe edita la carta recién importada desde otro panel.
- NO existe señal de menu-generator (INV3) — suscribir algo del propio módulo
  sería inventar.

## 6. Huecos [ABIERTO] — decisiones del dueño pendientes

- **drag&drop nativo con FilePicker del core** — `attachments[].path` al
  storage del proyecto es vía válida por contrato (L112-119); requiere
  FilePicker del core. Hoy FileReader+fs.write cubre el gesto. ABIERTO.
- **OCR / PDF** — menu-ocr / menu-pdf2img / menu-prepare (módulos hermanos de
  la página /menu-generator) podrían alimentar el importador (salida → JSON →
  import). ABIERTO.
- **multi-fichero / lote** — INV5: hoy 1 JSON = 1 carta. ¿Lote? ABIERTO.
- **cara agéntica aparcada** — `generar`/TEXTO_LIBRE del blueprint v12.2.0 no
  tiene op real detrás (el módulo es reflejo de UNA op). Si vuelve, nuevo
  análisis con su propia cara. ABIERTO.