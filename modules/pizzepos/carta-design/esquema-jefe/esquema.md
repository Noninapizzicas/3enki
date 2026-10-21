# ESQUEMA — cara del JEFE del módulo `carta-design` (pizzepos v3.3.0, el COMPOSITOR del diseño impreso)

> Árbol maestro consolidado (pasadas 1-2). Alimenta al agente de UI que
> escribe el panel del jefe. Ley de agnosticismo: cero tecnología de sistema
> ambiente. El análisis es de la CARA DEL JEFE — la utilización (POS, PWA,
> cocina) quedó fuera, anotada.
>
> Fuente: `modules/pizzepos/carta-design/index.js` (reflejo-2.1.0, 5 ops) +
> `module.json` (v3.3.0, HÍBRIDO, SIN ui_handlers — RPC por evento) +
> `carta-manager/index.js` (ref-select L190-201) + blueprint v2.5.0.

## 1. Quién es el jefe y qué decide

El **COMPOSITOR del diseño impreso de la carta**: decide el LOOK del PDF que
se imprime/publica. La composición del HTML la hace el LLM de PÁGINA (fuzzy,
sin agente) bebiendo la identidad de la MARCA; el reflejo HIDRATA y PERSISTE.
Tres decisiones:

- **D1 — COMPONER el look** (`design.contexto_diseno`): el jefe elige la carta
  (ref-select) → el reflejo HIDRATA en UNA RPC `{carta, marca,
  alergenos_catalogo}` — la carta a diseñar (carta-manager) + la identidad de
  marca (carta-marketing: colores, tipografías, logo, voz) + el catálogo de
  alérgenos (Reg. UE 1169/2011). Es el DICTAMEN VISUAL del impreso: lo que el
  diseño va a encarnar.
- **D2 — VALIDAR el diseño** (`design.validar`): el FRENO (skill
  blueprint-agentico). Un diseño de carta no se valida con JSON Schema (es HTML
  freeform): su contrato es REPRESENTAR la carta. `_checkDiseno` compara el HTML
  contra la carta REAL (carta.get) y exige HTML no trivial + COMPLETITUD (cada
  producto aparece) + ALÉRGENOS declarados (1169/2011). Devuelve `{valid,
  errors[{code,message,faltan}], productos_total, productos_faltan}`.
- **D3 — GUARDAR el diseño** (`design.save`): persiste el HTML compuesto + meta
  companion en `/pizzepos/carta-design/designs/<carta_id>__<timestamp>.html`.
  RE-VALIDA como gate inquebrantable (si no representa la carta → 422, NO
  persiste) + 2º freno de render real (best-effort). Emite `carta.html.generada`.

Frecuencia: media (cada rediseño de la carta impresa). El gesto frecuente es
COMPONER (ref-select carta → contexto_diseno → dictamen visual).

Lo que NO decide: la identidad de la marca (carta-marketing — el diseño la BEBE,
no la re-pregunta), el contenido de la carta (carta-manager), ni cómo se vende
(POS/PWA — utilización).

## 2. Invariantes (verificadas en código, restricciones honestas)

- INV1 — **reflejo de 5 ops** (`reflejo-2.1.0`): `contexto_diseno` (L38),
  `load_carta` (L39), `save` (L40), `gallery` (L41), `validar` (L42) — todas por
  `_atender` → `design.<op>.response` top-level `{request_id, status, data|error}`.
- INV2 — **canal RPC por evento** (`design.<op>.request` → `.response`), NO
  ui/request (sin ui_handlers en module.json — HÍBRIDO fuzzy como
  menu-generator/viabilidad). El EventBus del core SOLO re-emite a módulos
  locales los topics con `*` (asterisco literal).
- INV3 — **la identidad del diseño sale de la MARCA** (`carta-marketing.get_perfil`,
  L85-87) — colores, tipografías, logo, voz. NO hay biblioteca de
  profiles/plantillas (retirada en v3.0.0). El diseño BEBE la identidad que el
  onboarding capturó.
- INV4 — **la carta a diseñar la sirve carta-manager** (`carta.get.request`,
  L80-81) — la FUENTE. El reflejo entra por la puerta del custodio, no por fs
  directo.
- INV5 — **el módulo SÍ publica señal propia** (verificado en código, aunque
  module.json no declare publishes — lección carta-digital): `carta.html.generada`
  (L205).
- INV5b — **doble confirmación, nunca optimismo**: dictamen en la respuesta RPC
  (la única verdad inmediata) + señal que re-confirma con debounce 60ms.
- INV6 — **multi-tenant**: todo RPC lleva `project_id` (proyecto activo). Las
  señales se correelan por `project_id`; las de otro negocio no tocan la vista.

## 3. Composición de la vista del jefe (3 capas — gestos del compositor)

```
1. SELECCIONAR  la carta a diseñar (ref-select desde carta.list).
2. COMPONER     (LA DECISIÓN) 1 llamada design.contexto_diseno {carta_id}
                → dictamen visual {carta, marca, alergenos_catalogo}.
3. VALIDAR      (FRENO) design.validar {carta_id, html} → {valid, errors}.
   GUARDAR      design.save {carta_id, html} → 201 meta + señal generada.
   VER          la galería (cinta-estado design.gallery).
```

Frecuencia → jerarquía: el gesto frecuente es COMPONER (ref-select carta +
botón, cinta arriba); el dictamen visual es banner de resultado; validar/save
son gestos del jefe sobre el HTML; la galería es cinta-estado.

## 4. Formas UI (la disección reparte formas, la vista las compone)

| Hoja | Forma | RPC / señal |
|---|---|---|
| Elegir la carta | ref-select | `carta.list.request` → `[{id, nombre, estado, version, productos_count, categorias_count}]` (neutro) |
| COMPONER | transicion-un-llamado | `design.contexto_diseno.request` → `.response` · señal `carta.html.generada` |
| Dictamen visual | dictamen-visual | 200 `{carta, marca, alergenos_catalogo}` |
| VALIDAR (freno) | transicion-un-llamado | `design.validar.request` → `{valid, errors, productos_total, productos_faltan}` |
| GUARDAR | transicion-un-llamado | `design.save.request` → 201 meta · señal `carta.html.generada` |
| Galería | cinta-estado | `design.gallery.request` → metas (orden fecha desc) |

## 5. Señales (hoja a hoja — cada declaración con su refresh)

- COMPONER → dictamen en la respuesta + **carta.html.generada** (L205) con
  debounce 60ms (re-confirma tras guardar).
- GUARDAR → **carta.html.generada** (L205) con debounce 60ms — refresca la
  galería.
- La galería se re-lee con la señal generada.

## 6. Huecos [ABIERTO] — decisiones del dueño pendientes

- **composición del HTML en el panel** — hoy la hace el LLM de PÁGINA en el chat
  (fuzzy, sin agente). El panel del jefe dispara (contexto_diseno), valida y
  guarda — no compone. ¿Editor de HTML aquí? Decisión del dueño. ABIERTO.
- **edición de la marca desde el panel** — la identidad vive en carta-marketing
  (custodio). El diseño la BEBE, no la edita. ¿Editor aquí? Decisión del dueño.
  ABIERTO.
- **re-composición automática cuando cambia la carta** — un diseño es snapshot
  del momento. Si la carta cambia, ¿re-componer? Decisión del dueño. ABIERTO.
