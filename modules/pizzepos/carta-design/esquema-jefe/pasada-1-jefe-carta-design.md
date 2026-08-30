# PASADA 1 — prisma de 5 huecos con lente JEFE · módulo `carta-design`

> Sujeto: **la cara del ROL JEFE del ESTUDIO DE DISEÑO de cartas impresas**
> (no el módulo entero). Ley de agnosticismo: cero tecnología de sistema
> ambiente. El reflejo se llama `design.<op>` — el jefe COMPONE el look impreso
> de la carta (el PDF): elige la carta, bebe la identidad de la MARCA y dispara
> la composición del diseño.
>
> Fuente (leída, no presumida): `modules/pizzepos/carta-design/index.js`
> (reflejo-2.1.0 — _atender L38-42 · _contextoDiseno L78-99 · _loadCarta L102-108 ·
> _checkDiseno L117-142 · _checkRender L151-159 · _validar L161-169 · _save L172-210 ·
> _gallery L213-227 · señal L205) + module.json (v3.3.0, HÍBRIDO, 5 ops RPC por
> evento, SIN ui_handlers) + blueprint v2.5.0.

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe es el **compositor del diseño impreso de la carta**: decide el LOOK del
PDF que se imprime/publica. La composición del HTML la hace el LLM de PÁGINA
(fuzzy, sin agente) bebiendo la identidad de la MARCA; el reflejo HIDRATA y
PERSISTE. Las decisiones del jefe:

- **D1 — DISPARAR la composición** (`design.contexto_diseno`): el jefe elige la
  carta (ref-select) → el reflejo HIDRATA en UNA RPC `{carta, marca,
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

## Hueco 2 — RESTRICCIONES: ¿de qué NO depende él?

- **La identidad del diseño sale de la MARCA** (`carta-marketing.get_perfil.request`,
  L85-87) — colores, tipografías, logo, voz. NO hay biblioteca de profiles/plantillas
  (retirada en v3.0.0). El diseño BEBE la identidad que el onboarding capturó.
- **La carta a diseñar la sirve carta-manager** (`carta.get.request`, L80-81) —
  la FUENTE. El reflejo entra por la puerta del custodio, no por fs directo.
- **El canal es RPC por evento** (`design.<op>.request` → `.response`), NO
  ui/request (sin ui_handlers en module.json — HÍBRIDO fuzzy como
  menu-generator/viabilidad). El reflejo responde top-level `{request_id, status,
  data|error}`.
- **La composición del HTML la hace el LLM de PÁGINA** (fuzzy, sin agente) — el
  reflejo NO compone; hidrata y persiste. El panel del jefe no puede componer
  HTML: dispara la composición (contexto_diseno) y valida/guarda el resultado.
- **Multi-tenant**: todo RPC lleva `project_id` (proyecto activo). Las señales
  se correelan por `project_id`.

## Hueco 3 — CONTRATO: qué necesita VER y qué SEÑAL confirma su decisión

**VER ANTES de decidir** (todo neutro, alimenta la decisión):

- La carta a diseñar: `carta.list.request` (ref-select — id + nombre) o
  `design.load_carta.request` (solo la carta).
- El DICTAMEN VISUAL del impreso: `design.contexto_diseno.request` → `{carta,
  marca, alergenos_catalogo}` (L94-98) — la carta con productos/categorías +
  la identidad de marca (visual:{colores,tipografias,estilo,logo}) + los 14
  alérgenos del Anexo II.
- La galería de diseños guardados: `design.gallery.request` → lista de metas
  (cinta-estado).

**SEÑAL pareada** — el módulo SÍ publica señal propia (verificado en código,
aunque module.json no declare publishes — lección carta-digital):

- `carta.html.generada` (L205) — confirma que un diseño se guardó. Refresca la
  galería.
- **Doble confirmación** (como entrega/masa/viabilidad): dictamen en la
  respuesta RPC + señal que re-confirma con debounce 60ms — nunca recarga,
  nunca estado optimista.

## Hueco 4 — NO-OBJETIVOS (caras que NO son del jefe)

- **La venta / consumo del producto** — utilización: el diseño impreso se
  imprime/publica, no se vende en POS/PWA. El compositor es previo.
- **La identidad de la marca** — carta-marketing (custodio). El diseño NO
  entrevista la identidad: la BEBE. Si la marca está incompleta, deriva al
  onboarding de carta-marketing (no improvisa).
- **El contenido de la carta** — carta-manager (custodio). El diseño NO edita
  la carta: la diseña.
- **La composición del HTML** — la hace el LLM de PÁGINA (fuzzy, sin agente).
  El panel del jefe no la hace: dispara, valida y guarda.

## Hueco 5 — PREGUNTAS_ABIERTAS — decisiones del dueño pendientes

Ninguna decisión de UI se presupone. Los huecos se NOMBRAN y se dejan:

- ver pasada-2-diseccion.md — huecos: composición del HTML en el panel (hoy la
  hace el LLM de página en el chat), edición de la marca desde el panel,
  re-composición automática cuando cambia la carta.
