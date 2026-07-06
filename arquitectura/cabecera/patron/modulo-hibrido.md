---
id: patron/modulo-hibrido
dominio: patron
resumen: Reflejo (JS determinista) + Blueprint (LLM): criterio de reparto, base compartida, gate anti-colisión, receta de 5 pasos, bases compartidas y marca.json.
fuentes:
  - modules/_shared/modulo-hibrido-reflejo.js
  - scripts/validate-hibridos.js
verificado: 2026-07-06
---

# Patrón Módulo Híbrido — Reflejo (JS) + Blueprint (LLM)

> Cada módulo = mitad REFLEJO (index.js, JS determinista: lecturas/CRUD/aritmética,
> sirve RPCs del bus) + mitad FUZZY (blueprint, cajones que el LLM ejecuta). El
> loader carga ambos cuando blueprint_driven:true + existe index.js.

## Modelo

```
// Un módulo híbrido vive en una carpeta con DOS piezas:
//   <mod>.blueprint.json   ← mitad FUZZY: pseudocódigo que el LLM ejecuta (cajones)
//   index.js               ← mitad REFLEJO: JS determinista, sirve RPCs del bus
// El loader carga ambos (blueprint_driven:true + index.js existe = híbrido) y
// CONSERVA blueprint_driven:true → ai-gateway sigue dando el blueprint al LLM.
// Retrocompatible: un blueprint sin index.js sigue el camino puro de siempre.

ABSTRACT CLASE ModuloHibrido HEREDA BaseModule {     // ── la mitad REFLEJO (JS)
  ATRIBUTOS { name, eventBus, logger, metrics }
  METODOS {
    onLoad(context): los handlers se cablean via manifest.subscribes

    // Un handler por cada op DETERMINISTA expuesta como RPC del bus.
    // Patrón fijo: recibe request → proyecta → publica la response correlada.
    async on<Op>Request(event):
      { request_id, ...input } ← event.data
      result ← _<op>(input)                  // { status, data }
      publish('<mod>.<op>.response', { request_id, ...result })   // publishAndWait resuelve

    // La proyección determinista — réplica FIEL del contrato del blueprint.
    // Una sola respuesta correcta: lectura/CRUD/aritmética sobre el store.
    _<op>(input): { status, data }

    _leerStore(project_id): lee su fichero vía el reflejo fs (JS↔JS, milisegundos)
  }
}

// ── la mitad FUZZY (NO es JS): <mod>.blueprint.json
//   - cajones para lo que necesita inteligencia (crear desde intención,
//     investigar, editar, navegar Mercadona).
//   - NO declara responde:true para las ops que ya sirve el reflejo
//     (evita doble responder y el turno LLM sintético caro).
//   - sí mantiene eventos_que_escucho fire-and-forget (ej. aplicar un evento).
```

## Criterio de reparto (qué mitad)

```json
{
  "va_al_reflejo_JS": "determinista, UNA respuesta correcta computable: lecturas, CRUD, validación, aritmética, persistencia, y TODO lo que otros módulos le piden por RPC de bus (no debe costar un turno LLM).",
  "va_al_blueprint_LLM": "fuzzy: interpretar la intención del usuario, generar (recetas/menús desde foto o texto), navegar servicios externos con ambigüedad (matching ingrediente↔Mercadona), decidir.",
  "regla": "si la op tiene UNA respuesta correcta computable → reflejo. Si necesita elegir/interpretar → blueprint.",
  "consciencia": "el reflejo emite sus eventos de dominio; la propiocepción los capta → el LLM queda CONSCIENTE de lo que el reflejo hizo sin haberlo controlado (ver Capa de Propiocepción)."
}
```

## Estandarización (base + gate)

```
modules/_shared/modulo-hibrido-reflejo.js  →  ABSTRACT CLASE ModuloHibridoReflejo
  da: onLoad/onUnload, _rpc(evento, payload) [publishAndWait genérico al bus],
      _atender(event, op, responseEvent, fn) [guard + proyección + response],
      _leerJson / _editarJson(project_id, path) [store vía fs reflejo],
      _invalid(field), _round(x,n).
  → cada nuevo reflejo: extiende la base, escribe SOLO sus proyecciones (~40 líneas).

scripts/validate-hibridos.js  →  GATE (para validate:ci). Invariantes:
  1. ANTI-COLISIÓN: un evento NO está a la vez en module.json.subscribes (reflejo)
     y en blueprint.eventos_que_escucho (turno LLM) → si no, responden los dos.
  2. los subscribes[].handler existen como método de la clase del reflejo.
```

## Receta para volver híbrido otro módulo

```
0. Extiende ModuloHibridoReflejo (la base te da toda la fontanería del bus).
1. Identifica sus ops DETERMINISTAS (lecturas/CRUD) y las que otros le piden por RPC.
2. index.js: un on<Op>Request de UNA línea por op (delega a _atender) + las proyecciones _<op>.
3. module.json: subscribes mapeando <mod>.<op>.request → on<Op>Request (+ sube version).
4. blueprint: quita responde:true de esas ops (el reflejo las sirve); deja los cajones
   para el LLM en su página + los subscribers fire-and-forget que de verdad necesite.
5. El loader (híbrido) carga ambos sin tocar nada más.
6. node scripts/validate-hibridos.js → PASS (sin colisión, handlers existen).
```

## Instancias

```
recetas (PRIMER caso · module 2.0.0 · blueprint 2.6.0) {
  REFLEJO index.js : listar · ingredientes · obtener (lecturas) + onCosteCalculado (persist write)
  BLUEPRINT        : crear · editar · investigar_receta · ...   (cajones, fuzzy)
  resultado        : lectura por RPC de ~20-30s/300K-tokens → milisegundos/determinista
}
escandallo (SEGUNDO caso · module 2.0.0 · blueprint 3.8.0) {
  REFLEJO index.js : recalcular_siguiente · costear   (_costear aritmética pura)
  BLUEPRINT        : calcular (Mercadona / _precio_de_mercadona)   ;  cajón recalcular delega al reflejo
  medido           : turno de chat 300K/20-30s → 42K/7.9s ; cadena de costeo ~120ms JS
}
carta-marketing (TERCER caso · module 2.4.0 · blueprint 1.10.0 · SIN agente) {
  REFLEJO index.js : get_perfil · update_perfil (deep-merge /pizzepos/marca.json) · guardar_copy (/pizzepos/carta-marketing/copy.json) + eventos
  BLUEPRINT        : completar_onboarding (entrevista 5 fases, LLM de página) · generar_copy (LLM de página redacta) ; cajones delegan al reflejo
  capa_agentes     : APARCADA (enabled:false). El LLM de página hace lo fuzzy; el reflejo persiste. NO hay agent.execute.
}
carta-manager (CUARTO caso · AGGREGATE ROOT · module 2.3.0 · blueprint 1.11.0 · reflejo 1.6.0) {
  REFLEJO index.js : las 15 ops DETERMINISTAS — save · get · list · delete · add_product · remove_product ·
                     update_product · add_category · update_prices · clonar · search · stats · versions ·
                     restore + onCartaCreada (entrada event-driven de menu-generator). Custodio único de
                     /pizzepos/cartas/<id>.json (+ .versions/). Helper _mutar (read→snapshot→fs.edit→version++→carta.editada).
  BLUEPRINT        : cajones = DELEGADORES finos (el LLM de página traduce lenguaje natural → publishAndWait('carta.<op>.request')).
  IDENTIDAD        : add_product → id determinista slug(categoria_id)+'_'+slug(nombre) (409 si existe) + persiste ingredientes
                     {id,nombre,emoji?,familia}. add_category → id=slug(nombre). onCartaCreada REUSA la carta general existente
                     (una carta por proyecto, no spawnea ficheros).
  CONTRATO_FS      : lee el shape REAL de filesystem (éxito={...data} sin status / error={error}); normaliza en _read/_write/_edit/_listFiles.
  resultado        : lectura/escritura de carta por RPC en ms; el comandero (vía productos proyector) ve siempre la carta actual.
}
SUBSISTEMA-CARTA — flujo recetas → carta (3 módulos, cada uno lo suyo) {
  recetas         : FUENTE   — da la receta por su puerta (recetas.obtener.request, reflejo). No cambia.
  menu-generator  : PREPARA + ORQUESTA — op preparar (blueprint 9.4.0): UNA vuelta LLM que LEE carta.get + recetas.obtener
                    (reflejos), da su TOQUE (prepara el producto pizzepos-ready SIGUIENDO la carta base: TODOS los ingredientes,
                    sin clasificar base/topping; consistencia de ids/familias/categorías), y GUARDA via carta.add_product (reflejo).
                    'generar CON base'. Todas las llamadas blueprint→REFLEJO → NUNCA blueprint→blueprint.
  carta-manager   : CUSTODIO — sirve carta.get (la base) + carta.add_product (persiste). No orquesta, no clasifica.
  regla           : el que PIENSA (menu-generator) orquesta y solo habla con reflejos; cero fronteras LLM↔LLM.
}
PENDIENTE (mismo patrón) {
  categorias · ingredientes · tarifas · viabilidad : sus lecturas/CRUD → reflejo
}
```

## Política del grupo pizzepos (aplicación del patrón a todos los blueprints)

```
POLITICA {
  determinista → REFLEJO (JS, index.js)
  fuzzy        → BLUEPRINT (lo ejecuta el LLM de PAGINA, NO un agente)
  capa_agentes : APARCADA (enabled:false) — ver estandar blueprint-coherente
  blueprint_op : espinazo CONTRATO → LEER(reflejo) → PENSAR(LLM pagina) → GUARDAR(reflejo) → EMITIR
}
```

```
DIRECTORIO POR PROYECTO  (data/projects/{slug}/storage/)
  pizzepos/
    recetas.json               recetas        (BASE: recetas + ingredientes_catalogo)
    marca.json                  carta-marketing (BASE: identidad de marca · sin binarios)
    carta-marketing/
      copy.json                 carta-marketing (copy: descripciones/preambulo/promos)
      assets/logo.<ext>         carta-marketing (FICHERO del logo · visual.logo guarda la RUTA, no base64)
    cartas/<carta_id>.json      carta-manager
    carta-design/...            carta-design   (diseños HTML + perfiles de estilo)
    carta-digital/config.json   carta-digital
    carta-scheduler/reglas.json carta-scheduler
    tecnicas/...                tecnicas
    viabilidad/...              viabilidad
```

### Bases compartidas (de las que beben todos)

> Algunos stores no son privados de su módulo — son FUENTES que cualquier otro
> lee. Viven planos bajo /pizzepos/ (no en subdir), los sirve el reflejo de su
> dueño, y el resto bebe via su RPC (no fs.read directo: cada uno entra por la
> puerta del dueño). El "cómo bebe" cada uno es suyo; el "de dónde" es fijo.

```
BASE              dueño            store                 puerta (RPC) para beber
recetas+catálogo  recetas       /pizzepos/recetas.json  recetas.{listar,obtener,ingredientes}.request
perfil de marca   carta-marketing /pizzepos/marca.json   carta-marketing.get_perfil.request
contenido AV      contenido     /pizzepos/contenido.json contenido.{get,add_imagen,quitar_imagen,set}.request
   (enriquecimiento audiovisual por producto: imagenes·descripcion·audio·video·interaccion.
    HOY imagenes; resto reservado. La beben los canales de PRESENTACIÓN (carta-digital, carta-design);
    el POS NO la toca → pizzepos sigue lean, sin imágenes en su carta. Imágenes = ficheros; el json apunta.)

  ejemplos de quién bebe:
    escandallo, viabilidad  ← recetas+catálogo  (costear, evaluar)
    menu-generator (preparar) ← recetas+catálogo  (trae la receta para preparar el producto e inyectarlo en la carta)
    carta-design (colores), menu-generator (tono), carta-digital  ← perfil de marca
  el onboarding RELLENA la base de marca (update_perfil); luego diseño/carta se basan en ella.
  carta-design BEBE marca via su reflejo (design.contexto_diseno HIDRATA {carta, marca} en 1 RPC):
    la MARCA es la ÚNICA identidad del diseño (visual {colores,tipografias,logo} + esencia/voz) —
    NO hay biblioteca de profiles/plantillas (retirada en v3.0.0). El LLM de página no re-pregunta lo
    que el onboarding capturó; lo que falte (dir/tel/horario) lo pregunta y persiste en marca.negocio.local.

FLUJO recetas → carta (NO es fs.read; cada uno entra por la puerta del dueño):
  menu-generator.preparar : LEE recetas.obtener (FUENTE) + carta.get (BASE) → PREPARA (toque, 1 vuelta LLM)
                            → carta.add_product (carta-manager CUSTODIO persiste). Todo blueprint→REFLEJO.
  carta-manager NO lee recetas.json; productos NO lee cartas/ por fs — todos por RPC del dueño.
```

### Identidad de marca — estructura canónica (marca.json)

> NO es campo libre. Jerarquía por secciones, cada una con DUEÑO, todos leen.
> Se rellena de a poco (mínimo esencia.nombre) y crece sin romper lectores.
> Esquema validable: arquitectura/decisiones/_schemas/marca/marca.schema.json.

```
CLASE Identidad {                         // /pizzepos/marca.json — base, dueño carta-marketing
  _version · _updated_at · onboarding_completado
  esencia : { nombre(req) · lema · proposito · valores[] }        // ADN     — dueño onboarding
  voz     : { tono[] · registro · referencias[] · si[] · no[] }   // habla   — dueño onboarding
  publico : { quien · actitud }                                   // a quién — dueño onboarding
  visual  : { colores{} · tipografias{} · estilo · logo }         // se ve   — dueño COMPARTIDO: onboarding (inicial) + carta-design (refina)
  negocio : { tipo_cocina · local{} · redes{} }                   // contexto— dueño onboarding
}

GOBIERNO {
  escribe : la sección la rellena su dueño via carta-marketing.update_perfil({ <seccion>: {...} })
            update_perfil hace DEEP-MERGE por sección → un parche parcial no pisa el resto
  lee     : TODOS via carta-marketing.get_perfil.request (devuelve la estructura completa)
}

CRECIMIENTO {
  corto : esencia + voz + visual            (lo que onboarding + carta-design ya sacan)
  medio : negocio (redes/canales) · publico afinado
  largo : secciones nuevas (campañas · calendario · métricas) SIN tocar las existentes
          — _version permite evolucionar; cada lector lee solo su sección
}
```


```
REPARTO POR MÓDULO  (✓ = ya híbrido)
  módulo            REFLEJO (determinista → index.js)               BLUEPRINT (fuzzy)
  recetas        ✓  crear/listar/obtener/buscar/CRUD + persist      investigar_receta, crear-desde-intención
  escandallo     ✓  recalcular_siguiente/costear (_costear)         calcular (Mercadona/_precio_de_mercadona)
  carta-marketing✓  get_perfil/update_perfil/guardar_copy           completar_onboarding + generar_copy (LLM pagina, SIN agente)
  carta-manager  ✓  las 15 ops (save/get/list/delete/add_product/...)  cajones = delegadores finos al reflejo (AGGREGATE ROOT)
  productos      ✓  PROYECTOR sin estado (proyecta carta activa)    —   (sin store; lee carta-manager por RPC)
  carta-digital  ✓  PROYECTOR canal digital: get_carta_publica (proyecta al vuelo bebiendo tarifas+carta-manager+marca+contenido) · get/update_config (solo canal)   —   (JS clasico, gemelo de productos)
  carta-scheduler   crear/listar/eliminar_regla · detectar_conflictos —
  viabilidad     ✓  evaluar (delega escandallo.costear+normaliza·reglas food cost·caminos por regla) · obtener/listar/descartar  —  (paralelo a escandallo)
  carta-impresion   RETIRADO (2026-06-15, archivado) — carta-design absorbió la maquetación de impresión
  carta-design   ✓  contexto_diseno (HIDRATA carta+marca)·load_carta·save·gallery (sin profiles)  diseño HTML (LLM página SIEMBRA desde marca) + MAQUETACIÓN (A5/A4/A3·orient·plegado·2-4col) + galería gestión (ver/descargar/imprimir/borrar/marcar-oficial)
  tecnicas          codificar/obtener/listar/actualizar/parametros  —
  menu-generator    —   (sin store propio · solo blueprint)         generar (carta desde texto/foto; valida contra carta.validar antes de carta.save — ver FRENO)
```

```
ORDEN DE MIGRACIÓN  (cada uno: receta de 5 pasos del patrón + gate)
  HECHO: carta-manager ✓ (aggregate root) · productos ✓ (PROYECTOR, no store — lee la carta por RPC)
  1. CRUD puros (trivial, máximo retorno): viabilidad ✓ · carta-digital · carta-scheduler
  2. mixtos (reflejo CRUD + chispa fuzzy): carta-design ✓ (absorbió maquetación) · tecnicas   [carta-impresion RETIRADO]
  3. menu-generator: se queda blueprint (generación fuzzy) — orquesta contra reflejos; no necesita reflejo propio. Custodio = carta-manager (sirve carta.validar, el FRENO)
```

## Estándar blueprint-coherente — capa de agentes APARCADA

```
ESTADO_CAPA_AGENTES {
  todos los agentes (modules/conversacion/ai-agent-framework/agents/*) : enabled=false (29, aparcados)
  motivo : tool-use roto bajo deepseek (tool-calls como texto, no ejecutan) → 25/29 nunca hicieron trabajo real
  framework : sigue cargado (recuperable). Reactivar = otra decision ("lo otro").
}

ESPINAZO de toda operacion de blueprint (5 fases SIEMPRE) {
  CONTRATO : input tipado + precondiciones (guards)
  LEER     : publishAndWait('<mod>.<lectura>.request')         // REFLEJO (JS determinista)
  PENSAR   : el LLM de PAGINA redacta/decide/interpreta         // fuzzy — NO un agente
  GUARDAR  : publishAndWait('<mod>.<persist>.request')          // REFLEJO (JS determinista)
  EMITIR   : publish('<dominio>.<algo>') + RETORNA salida tipada
  invariantes : el LLM NUNCA toca fs; entra por el reflejo. PROHIBIDO inventar (solo lo que LEER trajo).
}

RECONVERSION aplicada (blueprints que invocaban agent.execute) {
  carta-marketing : onboarding (completar_onboarding, entrevista LLM pagina) + copy (generar_copy → guardar_copy reflejo)
  carta-impresion : RETIRADO — su maquetacion vive ahora en carta-design
  resto del flujo : recetas/escandallo/viabilidad/menu-generator/tarifas/carta-scheduler/carta-digital → ya eran sin-agente
}
// skill: .claude/skills/blueprint-coherente/SKILL.md
```

## Estándar blueprint-agentico — el FRENO (VALIDAR) para ops que dan forma

> Un blueprint NO es un documento que el LLM lee: es el PROGRAMA de un agente. ai-gateway es el
> runtime universal — da MARCO (system prompt) + TOOLS (bus.*) + LOOP (maxIterations) gratis al
> cablear el manifest. Tú escribes la POLÍTICA. blueprint-coherente (5 fases) basta para ops sin
> riesgo de salida rota; cuando una op DA FORMA (genera/compone) y puede romper, se le añade el
> FRENO: una VALIDACIÓN contra el contrato antes de persistir. Sin freno, el agente da forma rota
> y la canta como éxito (caso carta1: 10 productos sin ingredientes, "✅ creada"). Con él: la salida
> pasa por la ley del contrato; si no pasa, reintenta con el error de campo, y si agota, FALLA HONESTO.

```
ESPINAZO de 6 fases (= blueprint-coherente + VALIDAR) {
  CONTRATO : input tipado + precondiciones (guards)
  LEER     : publishAndWait('<mod>.<lectura>.request')              // REFLEJO (hidrata)
  PENSAR   : el LLM de PAGINA da forma / decide / interpreta         // fuzzy
  VALIDAR  : el FRENO — repeat { v = publishAndWait('<mod>.validar.request', {obra})
             ; if v.valid break ; re-PENSAR corrigiendo SOLO v.errors[].path } until 3
             ; if !valid → UPSTREAM_INVALID_RESPONSE { hint: errors }  // jamás basura
  GUARDAR  : publishAndWait('<mod>.<persist>.request')              // REFLEJO (verificado)
  EMITIR   : publish('<dominio>.<algo>') + RETORNA salida tipada
}

REPARTO   PENSAR = LLM (elegir/interpretar/dar forma) · LEER/VALIDAR/GUARDAR = REFLEJO (una respuesta correcta).
CONTRATO  un solo artefacto sirve a dos caras: description INSTRUYE al PENSAR · type/enum/if-then es la LEY que ejecuta VALIDAR.
GATE      el reflejo PUEDE re-validar en GUARDAR (gate inquebrantable) aunque el LLM se salte el loop.
P0        las reglas se declaran como MANDATOS (FIDELIDAD/COMPLETITUD/VERIFICADO/DELEGADO), no como prohibiciones.

LA TRIADA (elige por la tarea) {
  blueprint-coherente   → 5 fases, sin validar      — ops sin riesgo de salida rota
  blueprint-agentico    → 6 fases (+VALIDAR, freno)  — ops que dan forma y pueden romper
  agente-perspectiva-c  → el PENSAR como función-pura (tools:[], reflejo hidrata/persiste) — lo más fiable
}

EL FRENO TIENE UNA NATURALEZA POR MÓDULO (lección del recorrido) {
  el contrato NO es siempre un JSON Schema: es "qué hace que la salida de ESTE agente sea de fiar",
  y eso cambia con el dominio. El freno va donde hay una LEY computable; donde la salida es
  irreducible (la voz del copy) el único guardián honesto es el PENSAR — forzar un validador sería teatro.
}

APLICADO (los 6 que dan forma del subsistema-carta) {
  recetas (module 2.2.0 · blueprint 2.9.0 · reflejo 1.3.0) {
    contrato : modules/pizzepos/recetas/receta.schema.json (modelo_canonico, draft-07) — forma.
    freno    : recetas.validar.request (AJV) — mata la línea hueca (cantidad:0 / nombre vacío) SIN prohibir
               el borrador (lineas vacías = legítimo). crear al espinazo de 6 fases; actualizar recibe el
               freno antes de su fs.edit. Pendiente: actualizar a DELEGADO puro.
  }
  carta-design (module 3.2.0 · blueprint 2.4.0 · reflejo 2.1.0) {
    contrato : REPRESENTAR la carta (salida freeform HTML, no schema).
    freno    : design.validar.request (_checkDiseno) compara el HTML contra la carta REAL (carta.get):
               HTML no trivial + COMPLETITUD (cada producto aparece) + ALERGENOS (Reg. UE 1169/2011).
               save RE-VALIDA como gate → 422 si no representa.
  }
  escandallo (module 2.1.0 · blueprint 3.10.0 · reflejo 1.2.0) {
    contrato : PROCEDENCIA + COHERENCIA (el coste fija el precio de venta).
    freno    : escandallo.validar.request (_checkCosteo) — rechaza el precio INVENTADO (fuente
               'estimado_llm' → PRECIO_INVENTADO) y la aritmética incoherente (coste_total=Σlíneas).
               _precio_de_mercadona deja de estimar: el PRECIO sale de la API real o queda sin_precio.
  }
  carta-digital (module 2.18.0 · blueprint 1.3.0 · reflejo 2.7.0) {
    contrato : el CARD_TEMPLATE cumple el contrato de slots.
    freno    : cartadigital.validar.request (_checkDiseno) — núcleo funcional+legal {{id}} {{nombre}}
               {{precio}} {{alergenos}} {{add_label}} + hooks data-accion detalle/add. guardar RE-VALIDA
               como gate (422). (El freno ya existía pero incompleto: faltaban precio y alérgenos.)
  }
  menu-generator (blueprint 12.2.0) + carta-manager CUSTODIO (module 2.8.0 · reflejo 1.14.0) {
    contrato : ESTRUCTURA de la carta (caso ORIGEN — carta1). menu-generator orquesta, no tiene store.
    freno    : carta.validar.request (carta-manager _checkCarta) — carta con productos, producto con
               nombre+precio+categoria_id existente, ingrediente con nombre/familia/precio_extra.
               generar valida en bucle ANTES de carta.save. Antes la guarda vivía SOLO en el pseudocódigo
               del LLM (auto-chequeo = lo que falló en carta1). La FIDELIDAD (no perder los ingredientes
               de la fuente) se queda en el PENSAR: solo el LLM conoce la fuente.
  }
  carta-marketing (module 2.6.0 · blueprint 1.15.0 · reflejo 2.1.0) {
    MARCA  : contrato = marca.schema.json. carta-marketing.validar.request (_checkMarca, AJV) + GATE en
             update_perfil (valida el merge antes de escribir → 422 si lo rompe). Seguro: identidadVacia()
             ya es schema-válida.
    COPY   : texto libre → su contrato es la VOZ, irreducible a un schema. NO hay freno mecánico; la
             fidelidad ('no inventar') se queda como MANDATO del PENSAR. El hallazgo: no toda op que da
             forma tiene contrato computable.
  }
}
// skill: .claude/skills/blueprint-agentico/SKILL.md
```
