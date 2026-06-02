# Arranque del horizonte: identidad-visual-y-pliegue-carta-design

**Estado:** abierto, sesión de cocina cerrada.
**Iniciado:** 2026-06-02 con `ana`, reapertura del propósito que el commit `2a6d3b3` había aparcado.
**Origen:** el plan `aplicar-subsistema-carta-a-carta-design.json` (2026-06-01) cocinó solo el backend de carta-design y aparcó la UI explícitamente, citando análisis previo: *"no aporta nada interesante al comerciante, solapamiento aparente con carta-impresion"*. La D5 de ese plan preveía: *"Si el usuario reabre el propósito de carta-design, se cocina entonces."* Esta sesión es esa reapertura.

## Lo que la sesión 2026-06-02 cocinó

La reapertura no resolvió "cocinar UI estándar para carta-design"; resolvió **qué es realmente el módulo y qué le aporta al comerciante**. Tras disección iterativa con ana, emergieron las siguientes decisiones:

### Naturaleza del recurso

- **carta-design tal como está hoy no aporta** lo que su nombre sugiere. La parte de generación de HTML (operaciones `load_carta`, `save`, `gallery`) solapa con carta-impresion. La pieza valiosa son los **profiles** (`profiles`, `save_profile`, `delete_profile` + 5 built-in).
- Los profiles no son "estética para carta impresa" — son **identidad visual transversal del local**: paleta, tipografía, vibra. Consumidos por N generadores presentes y futuros (carta-impresion, carta-digital cuando crezca, futuros cartel/redes).
- El profile es **fuente CSS canónica ejecutable**, no metadata reinterpretable. Eso garantiza coherencia visual del local entre todos los outputs por construcción — los agentes pasan de "diseñadores con guía estética vaga" a **maquetadores con stylesheet fijo**. Más simple, más predecible, sin drift estético.

### Modelo del recurso

- **Almacén plural desde el día uno** (biblioteca de N profiles, donde N empieza con los 5 built-in semilla).
- Estado de "activo" **arranca singular** (un `default_profile_id` del proyecto) con hueco previsto para crecer a plural por destino (`carta-impresion: X`, `carta-digital: Y`) cuando emerja la necesidad — sin migración.
- Los 5 built-in (`elegant-minimal`, `modern-bold`, `rock-bold`, `rustic-italian`, `seasonal-fresh`) se reescriben **en CSS canónico limpio** (no migración desde JSON, sistema virgen).

### Funciones del módulo

- **Almacén + editor + creador** como tres operaciones sobre el mismo recurso (no tres módulos).
- Pantalla canónica: **biblioteca a un lado + preview vivo del producto del comerciante al otro**. Cambiar de profile = cambiar el `<link>` CSS del HTML ya generado = instantáneo, barato, sin regenerar nada ni invocar agente.

### UX / mecánica del enganche

- **NO hay onboarding forzado** al crear proyecto. Proyecto arranca con CSS neutro y los generadores producen producto funcional desde el primer minuto.
- El disparador es **emergente del sistema**: cuando hay producto vivo sin estilo asignado, el sistema propone "ahora dale estilo" y el comerciante ve su propia carta cambiar. El **cómo concreto** queda en lluvia abierta (cambio de cajón vía `chat.cambiar_foco` / badge persistente / chat lo suelta tras N turnos / strip sigiloso / híbrido) — el módulo es el mismo en cualquier caso; se cocina cuando el módulo esté en pie y el primer disparador se vea operar en vivo.

### Consecuencias sobre el sistema actual

- **carta-design se despoja** de las operaciones HTML (`load_carta`, `save`, `gallery`). Plegadas.
- **El módulo se renombra** — "carta-design" ya no nombra nada de lo que es. Nombre concreto sin cocinar (decisión del Plan 2).
- **carta-impresion crece** para aceptar `profile_id` opcional como input y enlazar/inyectar el CSS canónico del profile.
- **carta-digital y futuros generadores** consumen el mismo profile (alineamiento progresivo, no parte del horizonte inicial).
- **Frontend:** `design-gallery` 🎨 desaparece (era para HTML designs); `design-profiles` 🎭 se reemplaza por la pantalla canónica del módulo nuevo.

### Sistema virgen

El sistema no tiene operadores comerciantes en producción a fecha de cocina. No hay HTML designs ya generados que migrar. No hay profiles custom guardados que preservar. No hay backwards compatibility que respetar. El horizonte es **borrar y reemplazar limpio**, no refactor con compat transitoria.

## Estructura del horizonte: 4 planes encadenados

```
Plan 1 (contrato) → Plan 2 (módulo nuevo) → Plan 3 (carta-impresion) → Plan 4 (limpieza)
```

### Plan 1 — Contrato transversal de identidad visual

**Disciplina transversal pura — sale solo, sin tocar módulos.**

Producto:
- `arquitectura/decisiones/_contratos/identidad-visual.contract.json` (o sub-contrato derivado si emerge esa opción al cocinarlo).
- Schemas AJV `additionalProperties:false` para el shape canónico del recurso.
- Validator en `arquitectura/decisiones/_validators/identidad-visual.validate.js`.
- Entry en `scripts/validate-all.js` y `package.json`.
- Entry en CLAUDE.md.
- Regeneración de `drift-baseline.json` para absorber warnings nuevos.

Decisiones que el plan cocinará con ana:
- ¿Contrato transversal propio o sub-contrato derivado del `subsistema-carta`? (Tesis al cocinarlo: transversal propio, porque los consumidores son N más allá de carta-*.)
- Nombre exacto del contrato.
- Shape canónico del recurso `profile` (CSS + metadata) y del estado `default_profile_id`.
- Eventos canónicos del recurso (creado / actualizado / eliminado / activado).
- Granularidad del CSS por profile (uno único vs componentizado — probablemente uno por simplicidad, si emerge necesidad de remix se cocina después).
- Garantías observables y prohibiciones canónicas.
- Cómo se relaciona con el catálogo `paradigma-no-cabe`: este recurso **NO es cache materializado** — es la fuente canónica, persistida en disco, leída via `fs.read` por los consumidores. Cumple event-core sin trampa.

### Plan 2 — Módulo identidad-visual nuevo

Sustituye carta-design. Backend (blueprint) + frontend (pantalla canónica con preview vivo). Backend y frontend pueden ir en un solo plan grande o dividirse en dos planes encadenados — se decide al cocinarlo.

Producto backend:
- `modules/pizzepos/<nuevo-nombre>/module.json` (blueprint_driven, target_page_id).
- `modules/pizzepos/<nuevo-nombre>/<nuevo-nombre>.blueprint.json` con 6-7 operaciones (listar, obtener, crear, actualizar, eliminar, activar default).
- 5 built-in CSS canónicos en `modules/pizzepos/<nuevo-nombre>/<carpeta-semillas>/`.
- Persistence en `data/projects/{slug}/storage/pizzepos/<nuevo>/<id>.css` + `.meta.json`.
- Eventos canónicos publicados.

Producto frontend:
- `frontend/src/lib/modules/<nuevo-nombre>/` con manifest + index.ts + Panel router + Browser + Editor + Creator + PreviewLive.
- `frontend/src/routes/[project_id]/<nuevo-nombre>/+page.svelte` con shell minimal.
- Reuso del `chatInputDraft` store ya existente (no se recocina).

Decisiones que el plan cocinará con ana:
- Nombre concreto del módulo (renombrar carta-design → ?). Candidatos sin atar: `identidad-visual`, `estilos-local`, `vibras`, `marca-visual`.
- Cómo se materializa el editor (textarea con highlight CSS / paleta visual estructurada / conversacional con LLM / híbrido).
- Cómo se materializa el creador (clonar built-in y editar / conversacional con LLM que genera CSS desde descripción de vibra / ambos).
- El **cómo del disparador del enganche** (lluvia tirada en sesión 2026-06-02: cambio de cajón / badge / chat propone / strip sigiloso / híbrido). Si frontend va en plan propio separado, esta decisión se cocina ahí.
- Postura del módulo: B con matiz — solo lectura para mutaciones del agregado (via chat), pero con **preview vivo** que es interacción reactiva sin tocar persistencia (cambiar `<link>` CSS).
- Mapeo de los 5 built-in CSS canónicos (qué CSS exacto define cada vibra semilla).

### Plan 3 — carta-impresion bumpeado a consumir profile_id

Producto:
- Bump del blueprint `modules/pizzepos/carta-impresion/carta-impresion.blueprint.json` v1.x → v1.y.
- Operación `generar` acepta `profile_id` opcional, lee CSS canónico via `fs.read.request`, inyecta en HTML.
- Ajuste del prompt del agente impresor en `modules/pizzepos/carta-impresion/prompt.json` (o equivalente).
- Bump `module.json` versión.

Decisiones que el plan cocinará con ana:
- Mecánica de inyección del CSS (link a URL servida vs `<style>` inline vs ambos según destino).
- Shape exacto del input `generar` ampliado.
- Cambios concretos del prompt del agente impresor (de "diseñador con guía" a "maquetador con stylesheet fijo").
- Comportamiento cuando `profile_id` no se pasa (CSS neutro del sistema vs default del proyecto si existe).

### Plan 4 — Limpieza de carta-design

Producto:
- Borrar `modules/pizzepos/carta-design/` (módulo backend completo).
- Borrar `frontend/src/lib/modules/design-gallery/`.
- Borrar `frontend/src/lib/modules/design-profiles/`.
- Borrar o redirigir `frontend/src/routes/[project_id]/carta-design/+page.svelte`.
- Actualizar referencias en CLAUDE.md, otras propuestas pendientes, y cualquier validator que enumere módulos.
- Regenerar `drift-baseline.json` si procede.

Verificación previa antes de ejecutar este plan:
- Módulo identidad-visual nuevo en pie con tests verdes.
- carta-impresion ajustado funcionando con `profile_id` opcional.
- `npm run validate:ci` verde.
- Ningún consumer roto.

## Disciplina de ejecución del horizonte

- **Orden estricto**: Plan 1 → Plan 2 → Plan 3 → Plan 4. No paralelizar — cada plan tiene dependencia técnica del anterior.
- **Cada plan**: cocinado con `ana` en sesión propia → JSON ejecutable en `arquitectura/decisiones/propuestas/<nombre-plan>.json` → OK explícito del humano → ejecutado por `fede` con OK explícito entre fases → commit → push → merge a main.
- **Disciplina transversal antes que horizontal**: el Plan 1 (contrato + schemas + validator) se cierra y mergea ANTES de tocar ningún módulo. Saltarse esa fase es el anti-patrón que CLAUDE.md prohíbe explícitamente.
- **Verificación al cierre de cada plan**: `npm run validate:ci` PASS, baseline regenerado si procede, frontend build OK (Planes 2+), git status limpio del scope declarado.

## Decisiones del horizonte global (cocinadas en sesión 2026-06-02)

Las decisiones cocinadas en esta sesión son **canon del horizonte**. Cualquier plan individual las hereda sin reabrirlas:

- Profile = identidad visual transversal del local (no estética para carta impresa).
- Profile = fuente CSS canónica ejecutable (no metadata reinterpretable).
- Almacén plural desde el día uno, default singular evolucionable a plural por destino.
- 5 built-in reescritos en CSS limpio (sistema virgen, sin migración).
- Almacén + editor + creador como tres operaciones de un módulo único.
- Pantalla canónica: biblioteca + preview vivo del producto del comerciante.
- Sin onboarding forzado; disparador emergente del sistema.
- Generadores enlazan/inyectan CSS, no reinterpretan.
- Despojar carta-design de operaciones HTML; renombrar el módulo; borrar y reemplazar (no compat transitoria).

## Lo que NO está cocinado y se cierra en cada plan individual

- Nombre del nuevo contrato (Plan 1).
- Nombre del nuevo módulo (Plan 2).
- Cómo concreto del disparador del enganche (Plan 2 frontend).
- Granularidad del CSS por profile (Plan 1 o Plan 2).
- Mecánica de servir el CSS — link vs inline (Plan 3).
- Mecánica concreta del editor y creador (Plan 2 frontend).
- Cambios exactos del prompt del agente impresor (Plan 3).
- Migración de carta-digital y futuros generadores: fuera del horizonte inicial, anotados como derivación.

## Próxima sesión: por dónde retomar

Invocar `/ana` y decir: *"cocinemos Plan 1 del horizonte identidad-visual"*. Ana arranca leyendo este documento + los contratos transversales hermanos (`subsistema-carta`, `frontend`, `ui-frontend-blueprint`, `paradigma-no-cabe`, `events`, `persistence`, `errors`) para situarse, declara las tres listas del ritual de arranque, y empieza a cocinar el contrato transversal de identidad visual con el shape canónico de los hermanos como referencia.

Producto esperado de esa sesión: `arquitectura/decisiones/_contratos/identidad-visual.contract.json` v1.0.0 + schemas + validator + entry CLAUDE.md + baseline regenerado, mergeado a main vía commit propio.

## Trabajo pendiente del horizonte (anotado, fuera del flow inmediato)

- **Migración de carta-digital** y futuros generadores al consumo de profiles: cocinar cuando carta-digital crezca lo suficiente para justificar el ajuste (probablemente como bump menor del subsistema).
- **Mecánica de servir el CSS como URL pública del proyecto** (algo tipo `/<slug>/identidad.css`) si emerge necesidad de cachear o enlazar desde clientes externos. Hoy basta con inline.
- **Editor conversacional con LLM** del profile (creador via diálogo: "quiero rock, tipografía gótica, paleta noche" → agente genera CSS canónico). Si se cocina, va como ampliación del Plan 2.
- **Foco dinámico de cajones** (la lluvia "carta terminada → cambio a cajón estilos") depende de que los cajones operen en producción real y se vea uso. Cocinar después del Plan 2 cuando haya material observable.

---

**Cierre del ritual de cocina sesión 2026-06-02.**
**Lo importante está en disco:** este arranque + estructura completa del horizonte + decisiones canónicas heredables por cada plan.
**Próxima sesión:** puede arrancar limpia leyendo CLAUDE.md, este arranque, y el contrato `dinamica-de-trabajo-companero` para retomar disciplina.
