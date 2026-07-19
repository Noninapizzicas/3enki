---
id: prisma/vertical-comercio
dominio: prisma
resumen: ProductoUniversal de 5 huecos: producto-manager, adaptador, proyector, arquetipos, opciones, boss+enforcement, coste, escaparate, POS completo, calendario (base del tiempo).
fuentes:
  - modules/prisma/**
  - modules/_shared/prisma-del-caso.js
  - modules/_shared/arquetipos-semilla.js
  - modules/_shared/organos-recetario.js
  - modules/_shared/pos-persistencia.js
  - modules/_shared/ical.js
verificado: 2026-07-18
---

## LA LEY DE LA EVIDENCIA — el prisma gobierna la PROCEDENCIA en todos los frenos

> `modules/_shared/prisma-del-caso.js` (banco PURO, hermano meta de los prismas): un caso-de-dato
> se descompone por NATURALEZA (DERIVABLE · AFIRMACION_EXTERNA · CREACION), el juez tipado
> `circuloCerrado` cierra el rail, y `leyDeLaEvidencia` es su Specification de procedencia:
> **la fuente JAMÁS se veta por nombre — se califica por su evidencia.**

```json
{
  "esquema": "ley-de-la-evidencia-v1",
  "tesis": "la línea nunca es fuzzy/determinista — es RECTIFICABLE/IRRECTIFICABLE (piedra angular soysuper)",
  "juez": "leyDeLaEvidencia({fuente, evidencia|url|referencia_id|mercadona_producto_id}) → {ok, naturaleza, falta?}",
  "clasificacion": {
    "derivadas (catalogo, sub_receta)": "pasan — su evidencia es el propio cálculo",
    "testimonio (manual)": "pasa — el humano es la evidencia",
    "mercadona": "pasa — su producto_id cacheado es la vuelta",
    "CUALQUIER otra (soysuper, makro, la-que-venga)": "afirmación externa: nombra tu evidencia y entras — cero muros nuevos por fuente nueva",
    "estimado / estimado_llm": "IRRECTIFICABLE — afirma sin vuelta posible: jamás persiste como real (el ÚNICO enemigo)"
  },
  "fertil": "nunca un 'no' pelado: falta nombra el camino ('nombra tu evidencia y entras')",
  "consumidores": [
    "escandallo._checkCosteo (aquí murieron FUENTES_TRAZABLES y EXIGEN_EVIDENCIA)",
    "recetas.actualizar_precio (fuera el enum de fuente) · recetas crear/actualizar (fuente de receta = string libre)",
    "pedidos.create_tienda (canal_origen = slug libre: glovo/telegram entran sin tocar código)"
  ],
  "vigilancia": "cúpula-eventos canta 'veto por nombre' si un freno futuro nace con lista cerrada sobre procedencia",
  "tests": "prisma-del-caso (ley 6 casos) · escandallo__reflejo-validar 13 (makro+url ENTRA) · pizzepos__pedidos (telegram ENTRA)"
}
```

# PRISMA — Vertical universal de comercio (producto de 5 huecos · modules/prisma/)

> Vertical 2 del rumbo (comercio local/universal): producto NO pizza-shaped, molde universal.
> Propuesta: arquitectura/decisiones/propuestas/prisma.md (6 casos trabajados). Nace 2026-07-01. Columna determinista v0.1 COMPLETA (8 módulos · 50/50); verificación en vivo + wiring pendientes.

## Modelo — ProductoUniversal (contrato)

```json
{
  "esquema": "producto-universal-v1",
  "principio": "lo objetivo lo descompone la IA; lo privado se marca ABIERTO (no se inventa)",
  "identidad": { "que_es": "String", "trabajo_que_resuelve": "String" },
  "arquetipo": "comestible|pieza|servicio|uso_temporal|... (ABIERTO; la IA propone, humano aprueba = anti-wipe)",
  "restricciones": [{ "tipo": "compatibilidad|factibilidad|verdad_obligatoria|periodo|retorno", "regla": "String", "no_negociable": "Bool" }],
  "contrato": {
    "atributos_saber": [{ "nombre": "String", "valor?": "Any", "derivado?": "Bool", "eje?": "precio|alergenos" }],
    "opciones": [{ "id": "String", "etiqueta": "String",
                   "sub_forma": "variante|modificacion|añadido|personalizacion_libre",
                   "modo": "ELEGIR_UNO|ELEGIR_VARIOS|QUITAR|LIBRE",
                   "valores": [{ "id": "String", "etiqueta": "String", "delta_precio": "Int", "disponible": "Bool" }] }],
    "estados": ["ciclo de vida del producto"]
  },
  "ejes": { "tiempo": "ninguno|instante|cita|intervalo_que_cobra", "estado_de_partida": "false|String", "ciclo": "de_ida|con_retorno" },
  "naturalezas": { "stock": "unidades|ingredientes|capacidad_temporal|activo_reutilizable", "precio": "por_unidad|por_peso|por_tiempo|rango_valoracion", "origen": "elaborado|de_reventa" },
  "no_objetivos": ["String"],
  "preguntas_abiertas": [{ "campo": "coste|stock|tarifa|agenda", "para": "comerciante", "porque": "privado|no_computable", "respondida?": "Bool" }],
  "madurez": "listo|necesita_aclaracion_comerciante|necesita_revision"
}
```

```
VERDAD_OBLIGATORIA (alérgenos·etiqueta energética·seguridad) = clase aparte: no se alinea, se dice fiel. universal (4/5 casos).
SUB_FORMA domina según arquetipo:  pizza=modificacion · TV=variante+añadido · tarta=+personalizacion_libre.
EJES se encienden por producto:    agenda (no-inmediato) · estado_de_partida (servicios) · retorno (alquiler/leasing).
NATURALEZA stock/precio varía:     ingredientes·unidades·capacidad_temporal·activo_reutilizable / unidad·peso·tiempo·rango_valoracion.
ORIGEN decide si lleva TU TRABAJO: elaborado (lo creas o modificas → RECETARIO) · de_reventa (lo compras hecho → DESCRIPCIÓN).
   Ortogonal al arquetipo: lámpara fabricada=elaborado · pizza cocinada=elaborado · pizza comprada para revender=de_reventa.
   El órgano recetario cuelga del ORIGEN, no del arquetipo (una pizza de_reventa no lo lleva; una lámpara elaborada sí).
CLASIFICADOR: arquetipo por la FORMA (ejes+naturalezas), NO por la superficie (corte y masaje = servicio por forma).
```

## Reparto pizzepos → prisma (copiar · reusar · dejar-arquetipo)

```
COPIAR+GENERALIZAR (llevan la forma del producto) → modules/prisma/
  carta-manager   → producto-manager   custodio del ProductoUniversal              ✓ HECHO
  menu-generator  → adaptador          crudo → 5 huecos + clasifica arquetipo      ✓ HECHO (híbrido: reflejo determinista + blueprint LLM)
  productos       → proyector          ProductoUniversal → vista destino            ✓ HECHO
  (fase 2) opciones ✓ · coste ✓ · escaparate ✓ (de carta-digital · núcleo público; bundle HTML/PWA follow-up en vivo)
REUSAR TAL CUAL (plataforma agnóstica): conversacion/* · filesystem · credential-manager · project-manager ·
  database-manager · interruptores · propiocepcion · conserje · destilador · homeostasis · lentes-diseno · verificador-visual · portal
POS UNIVERSAL (la espina de venta SÍ es reutilizable; copiar+generalizar → prisma, como carta-manager):
  comandero → carrito ✓ (buffer, tasa con opciones, céntimos, sin cocina) · cobros → cobro ✓ (pago: efectivo/tarjeta/bizum/transf/mixto, cambio) ·
  cuentas → cuenta/ticket ✓ (ciclo abierta→cobrada→cerrada) · impresion → ticket ✓ (recibo) · persistencia-comandero → cierre de caja ✓ (cuadre)
HOSTELERÍA (órgano del arquetipo; encender solo si el comercio es de hostelería):
  cocina · pase-cocina + los ganchos de cocina del comandero (enviar_cocina/estaciones) · cuentas-canales (delivery)
BOSS orquesta: un comercio = conjunto de arquetipos de sus productos; enciende packs+páginas+blueprints de esos arquetipos.
```

## producto-manager (module 0.1.0 · reflejo 0.1.0) — aggregate root ✓

```
CLASE ProductoManagerReflejo HEREDA ModuloHibridoReflejo {   // copiado de carta-manager, generalizado (pizza → 5 huecos)
  STORE    /prisma/catalogo/<id>.json (+ .versions/<id>/<ts>.json)   single-writer
  AGREGADO catalogo { meta{id,nombre,version,estado,created_at,updated_at}, categorias[], productos[ProductoUniversal] }
  _mutar   read → snapshot → aplicar → fs.edit → version++ → catalogo.editado   (mismo patrón que carta-manager)
  OPS (RPC catalogo.<op>.request → .response):
    save · get · list · delete(soft=archivado) · add_product · remove_product · update_product(merge+renormaliza) ·
    add_category · activar(exactamente 1 en_servicio) · clonar · search · stats(por arquetipo/madurez) · versions · restore · validar
  FRENO    _checkProducto: identidad.que_es + arquetipo + nombre presentes · opciones sub_forma/modo canónicos · madurez canónica.
           NO exige completitud (borrador con preguntas_abiertas = legítimo → "no inventar"). _checkCatalogo: por-producto + CATEGORIA_DANGLING.
  NORMALIZA _normalizarProducto: rellena los 5 huecos con defaults sanos, canonicaliza opciones/ejes/naturalezas.
            id determinista slug(categoria_id)+'_'+slug(nombre). NO inventa contenido (vacío = borrador legítimo).
  ENTRADA  onProductoAdaptado (fire-and-forget del adaptador): upsert idempotente por id en el catálogo general del proyecto.
  EVENTOS_PUBLISHES { catalogo.actualizado · catalogo.editado · catalogo.borrado + catalogo.<op>.response }
  EVENTOS_SUBSCRIBES { catalogo.<op>.request (15) · producto.adaptado }
}
```

## proyector (module 0.1.0 · reflejo 0.1.0) — proyector sin estado ✓

```
CLASE PrismaProyectorReflejo HEREDA ModuloHibridoReflejo {   // gemelo de pizzepos/productos, generalizado
  SIN STORE  vista == proyectar(catalogo_activo) SIEMPRE. Lee via catalogo.get/list.request (producto-manager).
  _proyectar(catalogo) PURO → { categorias(orden), productos[vista] }
  _proyectarProducto → aplana el ProductoUniversal a la vista de consumo:
    { id, nombre, que_es, arquetipo, categoria_id, atributos, opciones(con disponible), estados,
      verdades_obligatorias (restricciones tipo=verdad_obligatoria → alérgenos/etiqueta/seguridad),
      ejes, naturalezas, madurez, listo_para_vender(=madurez 'listo'), requiere_tiempo(=eje tiempo≠ninguno) }
  OPS (RPC vista.<op>.request → .response): completa · productos(filtro categoria/arquetipo) · producto · buscar
  SEÑAL  catalogo.{actualizado,editado,borrado} → re-emite vista.actualizada (lite). project.activated → warm.
  DOMAIN 'vista.*' propio para no pisar catalogo.* (que posee producto-manager, el único writer).
}
```

## adaptador (module 0.3.0 · reflejo 0.2.0 · blueprint 0.1.0) — crudo → ProductoUniversal ✓ (híbrido)

```
CLASE PrismaAdaptadorReflejo HEREDA ModuloHibridoReflejo {   // blueprint-agentico 6 fases · REFLEJO = la mitad determinista
  ESPINAZO  CONTRATO {crudo,project_id,catalogo_id?} → LEER → PENSAR → VALIDAR → GUARDAR → EMITIR
  LEER (reflejo 0.2.0)  _leerAprobados: arquetipos.listar → los custom APROBADOS del proyecto (best-effort).
                        Cierra el anti-wipe: propuesto→aprobado→clasifica productos nuevos (prioridad sobre la semilla).
  PENSAR (determinista)  crudo estructurado → 5 huecos ; _clasificarArquetipo POR LA FORMA (con los aprobados como extra):
     ciclo=con_retorno→uso_temporal · tiempo=cita|stock=capacidad_temporal→servicio ·
     stock=ingredientes|precio=por_peso→comestible · resto→pieza · (custom aprobado gana)
  _preguntasAbiertas  coste+stock (privados) + agenda(tiempo≠ninguno) + tarifa(precio rango/tiempo)
                      → madurez necesita_aclaracion_comerciante (no inventa: MARCA lo que no sabe)
  VALIDAR  catalogo.validar.request → _checkProducto (freno de producto-manager); !valid → 422 FALLA HONESTO
  GUARDAR  publish producto.adaptado (producto-manager: onProductoAdaptado, upsert)
  MITAD FUZZY (blueprint 0.1.0)  adaptador.blueprint.json — cajón 'adaptar': el LLM descompone foto/texto libre
                           → el Crudo de 5 huecos + propone arquetipo nuevo si no encaja (arquetipos.proponer), y
                           DELEGA al reflejo (adaptador.adaptar.request) el clasificar·VALIDAR·GUARDAR. FIDELIDAD:
                           lo que no sabe (coste/stock) NO lo inventa → el reflejo lo marca abierto. Verificación real = ai-gateway vivo.
}
```

## arquetipos (module 0.1.0 · reflejo 0.1.0) — registro ABIERTO ✓

```
_shared/arquetipos-semilla  SEMILLA (comestible·servicio·uso_temporal·pieza) + clasificar(ejes,naturalezas,extra)
                            FUENTE ÚNICA del clasificador POR LA FORMA (la usan adaptador y arquetipos, sin drift).
CLASE PrismaArquetiposReflejo HEREDA ModuloHibridoReflejo {
  ARQUETIPO = forma {ejes+naturalezas} + defaults {sub_formas, modelo_precio, organos que enciende}
  REGISTRO  semilla (código, intocable) + custom (store /prisma/arquetipos.json, estado propuesto|aprobado)
  OPS (RPC arquetipos.<op>.request → .response):
     listar · obtener · clasificar(custom aprobados con PRIORIDAD sobre semilla) · proponer · aprobar
  ABIERTO   proponer = la IA registra uno nuevo cuando algo no encaja (estado 'propuesto') ;
            aprobar = el humano lo cierra (estado 'aprobado' → entra a clasificar). ANTI-WIPE: la semilla es
            intocable (409); un id aprobado no se pisa. Mismo patrón que el destilador con las skills.
  EVENTOS_PUBLISHES { arquetipo.propuesto · arquetipo.aprobado + arquetipos.<op>.response }
}
```

## opciones (module 0.1.0 · reflejo 0.1.0) — valida + precia la selección ✓

```
CLASE PrismaOpcionesReflejo HEREDA ModuloHibridoReflejo {   // ENVUELVE el banco _shared/motor-opciones (puro, céntimos)
  ENTRADA  opciones.evaluar.request { producto | catalogo_id+producto_id, selecciones } → .response
  _aProductoMotor  ProductoUniversal → forma del banco: delta_precio(€) → delta_precio_centimos ;
                   aparta las LIBRE (personalizacion_libre) a `libres` (texto del cliente, sin cardinalidad/precio).
  _baseCentimos    precio_base_centimos · o atributo 'precio'(€) · o 0 (desconocido → base_resuelto:false, pregunta_abierta)
  SALIDA   { valida, errores, precio_final_centimos, precio_final_eur, libres, base_resuelto }
  REUSA    evaluarProducto (banco): Strategy por modo (ELEGIR_UNO/ELEGIR_VARIOS/QUITAR) + Composite. Céntimos enteros.
  GENERALIZA pizzepos/variaciones (validar) + pedido-tasador (preciar) a cualquier arquetipo.
}
```

## boss (module 0.1.0 · reflejo 0.1.0) — el orquestador ✓

```
CLASE PrismaBossReflejo HEREDA ModuloHibridoReflejo {   // el CEREBRO; el enforcement lo consume aparte
  TESIS  un comercio NO se declara pizzería/peluquería: su identidad EMERGE de sus productos.
  NÚCLEO PURO  _arquetiposDelCatalogo(catalogo) → arquetipos presentes ;
               _organosDe(arqIds, defs) → unión de organos por arquetipo ; _plan añade recetario si HAY producto elaborado ;
               _plan(catalogo, defs) → {arquetipos, organos, por_arquetipo, total}
  ORGANOS semilla: comestible→[carta,cocina] · servicio→[agenda] · uso_temporal→[agenda,retorno,fianza] · pieza→[stock]
  ORGANO POR ORIGEN (no por arquetipo): recetario ⟺ el catálogo tiene ≥1 producto naturalezas.origen=='elaborado'
                     (lo creas o modificas). Universal: lo enciende la lámpara fabricada igual que la pizza cocinada.
  OPS (RPC boss.{plan,estado}.request → .response): calcula sobre el catálogo activo (producto-manager) + arquetipos (semilla+custom aprobados)
  SEÑAL  catalogo.{actualizado,editado,borrado} + project.activated → boss.plan.actualizado (un producto nuevo puede encender un órgano nuevo)
  CEREBRO≠ENFORCEMENT  BOSS señala qué órganos necesita el comercio; encender los interruptores de esos órganos lo hace prisma/enforcement (abajo).
}
```

## enforcement (module 0.1.0 · reflejo 0.1.0) — el EFECTOR del BOSS ✓

```
CLASE PrismaEnforcementReflejo HEREDA ModuloHibridoReflejo {   // cierra el lazo CEREBRO→acción
  CONSUME  boss.plan.actualizado {project_id, organos} → _aplicar: por cada órgano necesario
           interruptor.set {id:'organo-<x>', enabled:true, motivo:'boss:<project>'} (canal universal;
           el dueño del órgano lo reacciona en caliente, patrón interruptor.registrar/cambiado).
  PURO     _plan(project_id, deseados) = organos-recetario.diffPlan(deseados, aplicados[project]) → {encender, innecesarios}
  ADDITIVO edge-triggered por proyecto (idempotente: interruptores solo emite cambiado en divergencia).
  NO APAGA solo  un órgano que sobra recibe solo TESTIGO boss.organo.innecesario — la voluntad de
           apagar es humana (como la apoptosis de la homeostasis: canta, no mata).
  SIN FALLO MUDO  registra el interruptor de cada órgano al vuelo (custom de arquetipos incluidos)
           → nunca hay un órgano necesario sin canal de encendido.
  onLoad   registra organo-<id> por cada órgano de la SEMILLA (grupo 'prisma-organos', default OFF).
  RPC      enforcement.estado.request {project_id} → {aplicados, organos_conocidos, registrados}.
  NOTA multi-proyecto  el interruptor es GLOBAL (panel único); 'necesario por este comercio' ⊆
           'capacidad disponible en este Enki'. El estado APLICADO se lleva por proyecto (diff/testigo).
}
_shared/organos-recetario.js  (PURO)  KNOWN_ORGANOS {carta(nativo:escaparate) · cocina(hosteleria) ·
  agenda/retorno/fianza/stock(previsto)} · ORGANOS_SEMILLA (unión de arquetipos-semilla, sin drift) ·
  interruptorDe(o)='organo-'+o · metaDe(o) · diffPlan(deseados,aplicados)→{encender,innecesarios}.
```

## coste (module 0.2.0 · reflejo 0.2.0) — cara comerciante: coste → margen → pvp ✓

```
CLASE PrismaCosteReflejo HEREDA ModuloHibridoReflejo {   // generaliza escandallo(Σ coste)+viabilidad(food cost→pvp), en céntimos
  ENTRADA  coste.costear.request { componentes[{coste_centimos,cantidad?}], coste_extra_centimos?, food_cost_objetivo?, pvp_centimos? }
  _costear  coste_total = Σ(coste×cantidad)+extra ; food_cost_objetivo(0..1] → pvp_sugerido = coste/objetivo ;
            pvp dado → food_cost_real=coste/pvp · margen=(pvp-coste)/pvp · margen_centimos
  NO INVENTA  los componentes de coste los pone el COMERCIANTE (respuesta a las preguntas_abiertas de coste). _costear puro, sin store.
  APLICAR  coste.aplicar.request → espinazo LEER→calcula→GUARDA→EMITE (blueprint-agentico determinista):
           LEE catalogo.get → resuelve pvp (pvp_centimos o pvp_sugerido) → _planAplicar (PURO) fija
           precio_base_centimos, marca la pregunta_abierta de coste 'respondida' y sube madurez a 'listo'
           si ya no falta ninguna → GUARDA catalogo.update_product → EMITE coste.aplicado. Cierra el lazo coste→producto.
}
```

## ui-forge (module 0.1.0 · reflejo 0.1.0) — EL TALLER DE UI de prisma ✓ (esqueleto v0.1)

```
CLASE PrismaUiForgeReflejo HEREDA ModuloHibridoReflejo {   // el espacio donde prisma CREA UIs potentes
  FRAME  ui-forge.generar.request {project_id, proposito} → .response
    LEER    catálogo (proyección) + marca (carta-marketing.get_perfil) + lentes.obtener{dominio:'diseño'} (best-effort)
    PENSAR  v0.1 RENDER DETERMINISTA (render-pos.js); la capa LLM la GUÍA la skill .claude/skills/prisma-taller-ui
            (LEER catálogo+marca+COPY/marketing+lentes-diseño + módulos UI de pizzepos para REUSAR → COMPONE → ojos)
    VALIDAR render.verificar.request (verificador-visual: render real · a11y · sin overflow), best-effort
    GUARDAR fs.write a storage/www/prisma/<proposito>/index.html + project.ensure-feature('www')
    EMITIR  ui-forge.generado
  PRIMERA SALIDA  proposito 'pos' → el POS de DOS ZONAS dirigido por el catálogo (render-pos.js):
    grid de productos · botón 2 zonas (cuerpo=añadir rápido · franja=OpcionesRenderer SOLO si hay opciones) ·
    OpcionesRenderer dibuja el control por opciones[].modo (ELEGIR_UNO=radio · ELEGIR_VARIOS=check · QUITAR=chip · LIBRE=texto) ·
    carrito cliente + total en céntimos (tasa con deltas) · Cobrar (v0.1 cliente; enganche carrito/cobro por bus = follow-up marcado)
  CLAVE  qué controles salen NO se copia de pizzepos: se DERIVA del ProductoUniversal (pizza, lámpara, regalo, servicio con 1 UI)
  NAMESPACE  /www/prisma/<proposito>/ → sirve /<ns>/<slug>/prisma/pos/ (no colisiona con carta-digital ni escaparate)
}
```

## recetario (module 0.1.0 · reflejo 0.1.0) — DUEÑO del órgano recetario (productos ELABORADOS) ✓

```
CLASE PrismaRecetarioReflejo HEREDA ModuloHibridoReflejo {   // glue idiosincrática: la ÚNICA pieza que conoce a la vez la receta y el producto
  ÓRGANO POR ORIGEN  recetario ⟺ producto.naturalezas.origen == 'elaborado' (lo creas o modificas), NO por arquetipo.
                     El error corregido: recetario colgaba de comestible (superficie); baja al eje ORIGEN (causa).
  ATAR  _pendientesDeAtar(catalogo) → productos ELABORADOS sin receta_ref y con nombre (cualquier arquetipo:
        pizza cocinada Y lámpara fabricada). onCatalogoCambiado ata por NOMBRE a la receta homónima
        (recetas.obtener), idempotente; sin homónima → no inventa el arco (queda suelto, atable a mano).
  PUENTE coste→precio  onCosteCalculado (escandallo.coste.calculado) → resuelve el producto por receta_ref →
        coste.aplicar (prisma/coste escribe el pvp). GATE: sin producto que referencie la receta, no hace nada
        (las sub-recetas masa/salsa no son productos). NO PISA pvp manual: canta recetario.coste_actualizado (deriva), no sobrescribe.
  SIN ESTADO  puro puente. NO reescribe recetas/escandallo (contratos vivos) ni coste (genérico). food_cost objetivo 0.30 (política, overridable).
  EVENTOS_SUBSCRIBES { escandallo.coste.calculado · catalogo.editado · catalogo.actualizado }
}
```

## escaparate (module 0.2.0 · reflejo 0.2.0) — cara cliente pública ✓ (núcleo + RENDER bundle a www/)

```
CLASE PrismaEscaparateReflejo HEREDA ModuloHibridoReflejo {   // gemelo generalizado de carta-digital, sin estado
  DIFERENCIA con proyector: el escaparate es PÚBLICO → PODA lo que el comerciante no ofrece.
  _proyectarPublico(catalogo) PURO → { categorias(orden), productos[público] }
  _productoPublico → { id, nombre, descripcion(=que_es), precio (fijo € | 'consultar' si rango_valoracion/desconocido),
     opciones (SOLO valores disponible:true; opción sin valores ofrecibles se cae; LIBRE se conserva),
     avisos_obligatorios (restricciones verdad_obligatoria), requiere_cita (eje tiempo≠ninguno) }
  OPS (RPC escaparate.publico.request → .response): proyecta el catálogo activo a la vista del cliente.
       escaparate.publicar.request → .response (reflejo 0.2.0): RENDER determinista del bundle (vista pública +
       marca → HTML legible, base NEUTRA teñida por --accent de la MARCA) → VALIDAR (render.verificar,
       verificador-visual, best-effort) → GUARDAR (fs.write storage/www/prisma/index.html + ensure-feature('www')) →
       EMITIR escaparate.publicado. Servido por Caddy en /<ns>/<slug>/prisma/ (namespace prisma/ bajo www → NO
       colisiona con carta-digital, que sirve la raíz /<ns>/<slug>/). El look emerge de la MARCA de cada
       comercio (no un tema global): así se diferencia de pizzepos Y de otro prisma a la vez.
  SEÑAL  catalogo.{actualizado,editado,borrado} → escaparate.actualizado.
  FOLLOW-UP (en vivo)  render real por verificador-visual · assets PWA (sw.js/manifest/icons) · logo de marca.
}
```

## carrito (module 0.2.0 · reflejo 0.2.0) — buffer de venta universal ✓ (POS · persistente)

```
CLASE PrismaCarritoReflejo HEREDA ModuloHibridoReflejo {   // copiado de comandero, SIN los ganchos de cocina
  BUFFER  Map<cuenta_id, {items, total_centimos, project_id}>. Entrada del flujo de venta: carrito → (cuenta) → cobro.
  OPS (RPC carrito.<op>.request → .response): get · add_item · remove_item · update_item(0→quita) · vaciar · list
  TASADO  add_item tasa cada ítem con opciones.evaluar (producto+selección → precio_final_centimos) · o precio_unitario_centimos inline
  ÍTEM    { id, producto_id, nombre, cantidad, selecciones, precio_unitario_centimos, subtotal_centimos, libres?, notas }
  DINERO  CÉNTIMOS (coherente con opciones/coste/tasador). SIN enviar_cocina (órgano del arquetipo hostelería).
  PERSISTE via _shared/pos-persistencia (snapshot fs por project_id, debounced; restaura en project.activated; vuelca en onUnload).
}
```

## cobro (module 0.2.0 · reflejo 0.2.0) — pago universal ✓ (POS · persistente)

```
CLASE PrismaCobroReflejo HEREDA ModuloHibridoReflejo {   // copiado de cobros, en céntimos, sin llevadoo/cajón
  OPS (RPC cobro.<op>.request → .response): crear · confirmar · reembolsar · get · list · metodos
  crear   total del carrito (carrito.get) o monto_centimos inline. Métodos: efectivo(cambio)·tarjeta·bizum·transferencia·mixto(split cuadra el total).
  CICLO   pendiente → completado (confirmar) → reembolsado. Idempotencia: un cobro activo por cuenta.
  DINERO  CÉNTIMOS. EVENTOS cobro.iniciado/procesado/reembolsado (mismo dominio que cobros; una cuenta prisma no la conoce pizzepos).
  PERSISTE por project_id (pos-persistencia). Sin link_pago/qr (integraciones externas = follow-up).
}
```

## cuenta · ticket · cierre (module 0.2/0.1 · reflejo 0.2/0.1) — POS tail ✓ (persistente salvo ticket)

```
CLASE PrismaCuentaReflejo   // ticket/cuenta (de cuentas, SIN estados de cocina)   [module/reflejo 0.2.0]
  ciclo abierta → cobrada → cerrada. OPS cuenta.{crear,get,list,cerrar}.request. onCobroProcesado → pagada+total.
  ref_display generado (T-001…). Ata carrito↔cobro bajo un ticket. PERSISTE por project_id (+seq de ref_display).

CLASE PrismaTicketReflejo   // recibo (de impresion, solo el ticket, SIN comanda de cocina)   [SIN estado → sin persistencia]
  OP ticket.formatear.request { items, total?, comercio?, ref_display?, ancho? } → { texto, total_centimos, ancho }.
  _formatearTicket PURO (líneas item/subtotal €, TOTAL). Emite ticket.generado. Impresora física = follow-up.

CLASE PrismaCierreReflejo   // cuadre de caja (de persistencia-comandero, la parte del cuadre)   [module/reflejo 0.2.0]
  onCobroProcesado acumula la venta (con project_id). OPS cierre.{cerrar_caja,estado}.request. _cuadre PURO → {total, por_metodo, num_ventas}.
  cerrar_caja resetea el día (global) + emite caja.cerrada. PERSISTE las ventas del día por project_id (dedup por cobro_id al restaurar).

_shared/pos-persistencia.js  (composición)  snapshot(project_id)/hidratar(project_id,data) los pone cada reflejo (map↔obj);
  el helper escribe /prisma/pos/<mod>.json (fs.write atómico, debounced) y restaura en project.activated. Sin project_id → solo memoria (honesto).
```

## calendario (module 0.2.0 · reflejo 0.2.0) — BASE COMPARTIDA del tiempo (órgano `agenda`) ✓ (motor + iCal bidireccional)

```
CLASE PrismaCalendarioReflejo HEREDA ModuloHibridoReflejo {   // base compartida (como marca/recetas) · product-AGNÓSTICO
  DOS CAPAS  DISPONIBILIDAD (oferta de tiempo — privada, onboarding como el coste) + RESERVAS (consumo — el POS del tiempo)
  INVARIANTE  hueco(recurso_tipo,[t]) = capacidad − reservas_solapadas ; reserva ⊂ disponibilidad ∧ hueco>0
  UN MOTOR 2 GRANOS  cita(minutos·de_ida·fin fijo·libera al pasar la hora) · intervalo(días·con_retorno·fin abierto→devolver)
  DISPONIBILIDAD  { recurso_tipos:[{id,etiqueta,capacidad}], horario:{L..D:[[hh:mm,hh:mm]]}, excepciones:[{fecha|desde+hasta,abierto:false}], tz }
  OPS (RPC calendario.<op>.request → .response):
    get_disponibilidad · set_disponibilidad(deep-merge) · bloquear_dia(excepción cerrada = "día que no trabajo") ·
    huecos({recurso_tipo,desde,hasta,duracion_min} → troceo back-to-back, capacidad−solapadas) ·
    reservar (guarda _hayHueco: cita exige horario+fin · intervalo solo capacidad; 409 SIN_HUECO/412 FUERA_DE_HORARIO/404 RECURSO_DESCONOCIDO) ·
    cancelar (libera) · devolver (alquiler: cierra el intervalo abierto) · list_reservas ·
    feed_ics (reservas → texto .ics RFC 5545, vía _shared/ical) · feed_url (provisiona el token secreto → URL suscribible) ·
    importar_ics ({ics|url} → lee el .ics/CalDAV del dueño, vuelca los días completos que huelen a cierre como excepciones 'días cerrado')
  MOTOR PURO  _ventanasAbiertas(horario−excepciones ∩ [desde,hasta]) · _huecos · _hayHueco · _solapa. Reloj de pared naïve,
              comparado determinista vía Date.UTC de componentes (sin deriva de zona).
  BORDE iCal  _shared/ical (serializador + parser RFC 5545 PROPIO, sin deps): horas en tiempo FLOTANTE (reloj de pared) · DTSTAMP UTC · plegado 75 octetos · escape.
              EXPORT — GET público suscribible: apis GET /modules/calendario/feed/:project?token=… (handleFeedIcs) — el clásico 'secret iCal URL'
              (quien tiene el token ve la agenda; el token se provisiona con feed_url y NO viaja en get_disponibilidad).
              IMPORT — importar_ics lee el .ics del dueño (fetch de url o texto) → días completos que huelen a cierre → excepciones (idempotente,
              reemplaza origen 'ics', respeta las manuales; DTEND exclusivo). tz/DST (TZID+VTIMEZONE, luxon) = follow-up.
  PRODUCT-AGNÓSTICO  la duración/recurso los aporta el CONSUMIDOR (agenda-citas/alquiler), no el calendario.
  PERSISTE  por proyecto (pos-persistencia, /prisma/calendario/estado.json: disponibilidad + reservas). Siempre cargado (base, no gateado).
}
CONSUMIDORES (posibles — NO construir en especulación · decisión 2026-07-02) {
  DECISIÓN  el calendario REPOSA como infra completa; su FORMA DE USO nace con el proyecto
            concreto que la necesite (una o varias formas). No se cablea agenda-citas ni ningún
            consumidor "por si acaso" — se construye cuando llega la ocasión y el proyecto la dicta.
  formas de uso PLAUSIBLES (bocetos, no compromisos):
    agenda-citas  producto(duración+recurso vía proyector) → huecos → reservar → cobro   (gateado por organo-agenda)
    alquiler      unidad(recurso, con_retorno) → reservar(fin=null) → devolver           (mismo motor, grano días)
    staff-turnos  turnos = reservas de tipo 'empleado' sobre la capacidad · scheduler-promos = ventanas (ya vive carta-scheduler)
}
```

## Topics / eventos

```
catalogo.{save,get,list,delete,add_product,remove_product,update_product,add_category,validar,activar,clonar,search,stats,versions,restore}.request → .response
adaptador.adaptar.request → .response    (reflejo: crudo → clasifica + VALIDAR(freno) + GUARDAR)
adaptacion.{iniciada,fallida}            (blueprint del adaptador: progreso/fallo del PENSAR fuzzy)
producto.adaptado                        (adaptador → producto-manager; upsert idempotente)
catalogo.{actualizado,editado,borrado}   (producto-manager → proyector; señal de refresco)
vista.{completa,productos,producto,buscar}.request → .response   (proyector; lectura proyectada)
vista.actualizada                        (proyector → consumidor/escaparate; consume-on-read del refresco)
arquetipos.{listar,obtener,clasificar,proponer,aprobar}.request → .response   (registro abierto)
arquetipo.{propuesto,aprobado}           (IA propone · humano aprueba — anti-wipe, la semilla intocable)
opciones.evaluar.request → .response     (valida + precia la selección del cliente; céntimos; aparta LIBRE)
boss.{plan,estado}.request → .response   (comercio → arquetipos presentes → unión de órganos)
boss.plan.actualizado                    (el plan del comercio cambió — lo consume prisma/enforcement)
enforcement.estado.request → .response   (qué órganos hay aplicados a este proyecto)
interruptor.set {id:'organo-<x>',enabled,motivo}   (enforcement → panel central: enciende el órgano)
boss.organo.encendido / boss.organo.innecesario    (testigo del efector: encendió / lo dejó sobrando sin apagar)
coste.costear.request → .response        (cara comerciante: coste → margen → pvp; los costes los pone el comerciante)
coste.aplicar.request → .response · coste.aplicado   (escribe el pvp en el producto + cierra la pregunta_abierta de coste)
escandallo.coste.calculado               (escandallo → recetario: coste de la ficha; recetario resuelve el producto elaborado y aplica)
recetario.coste_actualizado              (recetario: deriva cantada cuando el pvp manual ya estaba fijado — no pisa)
escaparate.publico.request → .response   (cara cliente: catálogo → vista pública, poda lo no ofrecido)
escaparate.publicar.request → .response · escaparate.publicado   (RENDER bundle + fs.write a www/prisma/ + ensure-feature www; sirve /<ns>/<slug>/prisma/)
ui-forge.generar.request → .response · ui-forge.generado   (TALLER: LEER catálogo+marca+lentes → RENDER → verificador-visual → fs.write www/prisma/<proposito>/; primera salida 'pos')
escaparate.actualizado                   (escaparate → PWA/consumidor; consume-on-read del refresco)
carrito.{get,add_item,remove_item,update_item,vaciar,list}.request → .response   (buffer de venta; tasa con opciones)
carrito.{item_agregado,item_eliminado,item_actualizado,vaciado}   (mutaciones del carrito)
cobro.{crear,confirmar,reembolsar,get,list,metodos}.request → .response   (pago del carrito, céntimos)
cobro.{iniciado,procesado,reembolsado}   (ciclo del cobro)
cuenta.{crear,get,list,cerrar}.request → .response · cuenta.{creada,cerrada}   (ticket)
ticket.formatear.request → .response · ticket.generado   (recibo)
cierre.{cerrar_caja,estado}.request → .response · caja.cerrada   (cuadre del día)
calendario.{get_disponibilidad,set_disponibilidad,bloquear_dia,huecos,reservar,cancelar,devolver,list_reservas,feed_ics,feed_url,importar_ics}.request → .response   (base del tiempo + feed .ics)
GET /modules/calendario/feed/:project?token=…   (endpoint HTTP público suscribible: .ics de la agenda, con token secreto)
calendario.disponibilidad.cambiada · calendario.{reservada,cancelada,devuelta}   (señales del calendario)
```

## Estado

```
✓ prisma.md · producto-manager (13/13) · proyector (4/4) · adaptador HÍBRIDO (12/12, LEER cablea arquetipos custom) · arquetipos (4/4) · opciones (5/5) · boss (5/5) · coste (9/9, con aplicar→producto) · escaparate (10/10, núcleo + RENDER bundle a www/ · look teñido por la marca)
✓ _shared/arquetipos-semilla (clasificador único) · _shared/motor-opciones (banco, envuelto por prisma/opciones) · _shared/organos-recetario (órgano→interruptor, diff PURO) · _shared/pos-persistencia (snapshot fs por proyecto)
✓ project-type blueprints/project-types/prisma.json — comercio universal INSTANCIABLE
✓ POS COMPLETO + PERSISTENTE — carrito (7/7) · cobro (8/8) · cuenta (6/6) · ticket (3/3) · cierre (4/4): catálogo→carrito→cuenta→cobro→ticket→cierre (sin cocina). Estado vivo persistido por proyecto (/prisma/pos/*.json), restaura en project.activated.
✓ BOSS ENFORCEMENT — enforcement (7/7): boss.plan.actualizado → interruptor.set enciende los órganos del comercio (additivo-seguro, no apaga solo). Lazo CEREBRO→acción cerrado.
✓ COSTE→PRODUCTO — coste.aplicar escribe el pvp en el producto (precio_base_centimos) + cierra la pregunta_abierta de coste (madurez→listo). Lazo cara-comerciante cerrado.
✓ ÓRGANO RECETARIO POR ORIGEN — naturaleza `origen` (elaborado|de_reventa) en el ProductoUniversal; recetario (dueño del órgano) ata producto↔receta y cierra escandallo.coste.calculado → coste.aplicar. Corregido el error de superficie: recetario baja del arquetipo comestible al eje ORIGEN → lo enciende TODO producto elaborado (lámpara fabricada = pizza cocinada), nada de_reventa. boss lo añade al plan por producto; el atado y el gate leen origen=='elaborado'. Tests: boss (6/6, gate por origen) · recetario (11/11, ata cross-arquetipo).
✓ ÓRGANO AGENDA (base + feed .ics suscribible + import) — calendario.md (propuesta) + calendario (17/17) + _shared/ical (8/8): base compartida del tiempo (disponibilidad+capacidad+reservas+huecos), motor determinista, un motor para cita y alquiler, persistente, BORDE iCal BIDIRECCIONAL — export (feed .ics + GET suscribible con token) e import (.ics/CalDAV del dueño → días cerrado). El organo-agenda ya tiene BASE (falta el consumidor que lo gatee).
◑ EN VIVO: adaptador.blueprint (PENSAR fuzzy) · escaparate bundle HTML/PWA · calendario tz/DST estricto (luxon; hoy tiempo flotante) · los interruptores organo-* esperan dueño (cocina la reacciona pizzepos) — se verifican corriendo el Enki
✓ ADAPTADOR LEER — adaptador reflejo 0.2.0: _adaptar lee los arquetipos custom APROBADOS (arquetipos.listar) y los pasa al clasificador con prioridad sobre la semilla. Lazo anti-wipe cerrado (propuesto→aprobado→clasifica).
[ ] wiring/en vivo: dueños de retorno/fianza/stock (órganos previstos)
⏸ APARCADO POR DECISIÓN (2026-07-02): los CONSUMIDORES del calendario (agenda-citas/alquiler/staff-turnos) NO se construyen en especulación. El calendario reposa como infra; su forma de uso se construye cuando un proyecto concreto la pida.
↻ REENCUADRE SKILL-FIRST (2026-07-02): la filosofía del sistema viró a SKILLS (cantera·cuenco·planificador·ejecutor). El KNOW-HOW de Prisma (molde·arquetipos por forma·reparto reflejo/blueprint·flujo) se COSECHÓ como skill en la cantera — modules/cosecha/cantera/enki/prisma-modelo-universal/SKILL.md (lente_dominio:prisma). Los módulos reflejo siguen siendo las HERRAMIENTAS deterministas que la skill CONDUCE. La receta montar-pack-lentes manda: sin página que la beba → se cosecha, NO se monta como pack; se promueve a lente cuando una página Prisma llegue. La semilla del molde (product-capability) ya vivía como lente en el pack ecc.
```

## Frontend — plan de arranque (anotado 2026-07-02; NO construir sin proyecto concreto + Enki vivo)

```
DOS CAPAS {
  GENÉRICO (ya existe · pizzepos lo prueba)   LazyShell · MqttClient · chat(ai-gateway) · module-loader · stores ·
                                              request/response. Un proyecto Prisma lo HEREDA tal cual — cero infra nueva.
  ESPECÍFICO de Prisma (= forma de uso)       páginas Svelte (catálogo/POS/agenda/escaparate) + page-blueprint (el CONDUCTOR
                                              que traduce intención → reflejos). Se MOLDEA con el comercio concreto.
}
CLAVE  el CHAT es la interfaz primaria (el LLM de página es el agente). Un comercio Prisma se opera ENTERO desde el chat
       genérico con su page-blueprint ("añade una margarita a 8€" → catalogo.add_product + coste.aplicar) ANTES de tener
       una sola página Svelte propia. Las páginas visuales = mejora progresiva, no requisito.
REGLA  páginas Svelte = lo más específico del proyecto → se construyen cuando el proyecto las pida (misma disciplina que
       los consumidores del calendario). El page-blueprint es escribible offline (JSON de cajones) pero solo VERIFICABLE
       en el Enki vivo (el blueprint lo ejecuta el LLM de página = runtime). Qué cajones necesita lo dicta el flujo real.
ARRANQUE (cuando llegue el proyecto + Enki) {
  1. crear proyecto tipo `prisma` (project-type ya existe)
  2. page-blueprint mínimo (onboarding marca/coste · alta de producto · POS) + verificar en el chat vivo
  3. páginas Svelte después, según lo que ESE comercio necesite ver
}
NO-HACER  no scaffoldear páginas ni cajones en el vacío — sería especular la UX. El chat reutilizado YA es el frontend para arrancar.
```
