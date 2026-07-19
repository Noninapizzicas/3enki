# Prisma · COMPUESTOS — insumo → compuesto → producto (modelo asentado)

> Guión de diseño del subsistema de composición de prisma, **prisma-puro** (todo en
> `/prisma/**`, cero cruce con pizzepos). Nace de replantear el órgano `recetario`
> (comestible → genérico) para que sirva a CUALQUIER comercio que fabrique/compone:
> química, industria, hostelería. Nada se resta: cada pieza de aquí es necesaria.
>
> Medio nativo: OOP + pseudocódigo + JSON. Prosa, la justa.

---

## 0 · Regla rectora y la costura a cortar

```
REGLA:  prisma guarda en /prisma/**  ·  pizzepos guarda en /pizzepos/**  ·  SIN cruce.

COSTURA ACTUAL (única violación en todo modules/prisma/):  recetario cruza a pizzepos por 2 sitios
  escandallo.coste.calculado   → escucha a escandallo (pizzepos)      · el COSTE viene de fuera
  recetas.obtener.request      → lee /pizzepos/recetas.json (pizzepos) · la RECETA vive fuera
Todo lo demás de recetario ya es prisma-puro (escribe en /prisma/catalogo vía producto-manager).
```

Este modelo corta esa costura: la formulación y su coste pasan a vivir en prisma.

---

## 1 · La cadena FRACTAL — tres niveles, referenciados (nunca embebidos)

```
insumo  ──ref + cantidad──►  compuesto  ──compuesto_ref──►  producto
(materia prima)              (formulación / receta)         (lo que entra en venta)
compartido, muchos           biblioteca (300+)              catálogo (los 5-20 que se venden)

· recursivo: un compuesto puede referenciar OTROS compuestos (sub-mezclas: masa, salsa, pre-mezcla) — sin límite
· cada nivel referencia al de abajo por REF; JAMÁS mete el dato dentro
```

---

## 2 · El escenario que OBLIGA este modelo (anti-cuello)

```
Macro-proyecto: un equipo desarrolla y perfila COMPUESTOS (químicos, industriales, pizzas…).
Puede haber 300 formulaciones y solo 5-20 en venta o producción.

Si el compuesto/insumo vive DENTRO del producto (visión estrecha):
  · la mayoría de formulaciones NO son producto → no tendrían dónde vivir
  · "harina" duplicada en 200 compuestos → cambiar su precio = reescribir 200 ficheros   ❌ cuello de botella

Si vive APARTE y se referencia:
  · las 300 formulaciones existen sin ser producto (I+D libre)
  · "harina" existe UNA vez → cambiar su precio = 1 escritura, propaga a todos           ✅
```

**Regla anti-cuello:** lo COMPARTIDO vive una vez y se referencia; nunca se embebe.

---

## 3 · Los STORES — cada dato UN custodio (el único que escribe)

```
/prisma/insumos/<id>.json           materia prima                custodio: insumos-manager      [CREAR]
/prisma/insumos/.versions/<id>/…    histórico versionado
/prisma/compuestos/<id>.json        formulación (refs+cantidad)  custodio: compuestos-manager   [CREAR]
/prisma/compuestos/.versions/<id>/… histórico versionado
/prisma/catalogo/<id>.json          producto (+ compuesto_ref)   custodio: producto-manager     [EXISTE]
/prisma/catalogo/.versions/<id>/<ts>.json                        histórico

· todo por proyecto (el módulo `filesystem` scopea cada ruta a su proyecto)
· escritura: fs.write.request (atómico) o fs.edit.request (parches JSON) — SIEMPRE vía el custodio
```

### Shape de cada fichero

```json
// /prisma/insumos/<id>.json  — la materia prima (existe una vez, se referencia N veces)
{ "id": "...", "nombre": "Harina T55",
  "naturalezas": { "precio": "por_peso", "coste_centimos_por_unidad": 59, "unidad": "kg", "stock": "..." },
  "clasificacion_ref": { "familia": "...", "subfamilia": "...", "grupo": "..." }   // eje COMPRA
}

// /prisma/compuestos/<id>.json  — la formulación: SOLO refs + cantidades (no los datos del insumo)
{ "id": "...", "nombre": "Masa madre",
  "componentes": [ { "ref": "<insumo|compuesto_id>", "cantidad": 500, "unidad": "g" }, ... ],
  "clasificacion_ref": { "familia": "...", "subfamilia": "...", "grupo": "..." }   // eje FABRICACIÓN
  // su coste = Σ (coste del componente × cantidad); lo calcula el costeador prisma, NO se guarda embebido
}

// /prisma/catalogo/<id>.json  — el producto (los 5-20 en venta)
{ "productos": [ { "id": "...", "nombre": "Pizza Funk",
    "compuesto_ref": "<compuesto_id>",              // el ARCO (antes receta_ref)
    "precio_base_centimos": 1250,                    // lo sella coste
    "preguntas_abiertas": [ { "campo": "coste", "respondida": false } ],
    "naturalezas": { "origen": "elaborado" },        // ← la LLAVE: sólo 'elaborado' lleva compuesto
    "clasificacion_ref": { "familia": "...", "subfamilia": "...", "grupo": "..." } // eje VENTA
  } ] }
```

---

## 4 · CLASIFICACIÓN — cada nivel la suya, por su eje de negocio

```
FORMA universal:   familia > subfamilia > grupo        (3 niveles fijos — el molde)
CONTENIDO:         qué familias existen → EMERGE del negocio, registro ABIERTO
                   (patrón `arquetipos`: semilla + custom propuestos por IA, humano aprueba = anti-wipe)
referencia:        por REF a nodos, NO texto libre → renombrar/mover una familia = 1 cambio, propaga

CADA NIVEL clasifica INDEPENDIENTE, por su propio eje (por eso 'depende de la lógica de negocio'):
   insumo     → eje COMPRA / inventario / proveedor      "¿qué materia es y de quién?"
   compuesto  → eje FABRICACIÓN / formulación / I+D       "¿qué tipo de mezcla o proceso?"
   producto   → eje VENTA / carta / escaparate            "¿cómo lo agrupo para el cliente?"

   (la misma harina: insumo 'cereales' · dentro de un producto 'panadería' — ejes distintos, NO el mismo árbol)

taxonomía = registro ABIERTO scopeado a su nivel/negocio (una pizzería y una química: familias opuestas)
```

### Lógica de negocio de la clasificación (para qué sirve, no adorno)

```
· AGRUPAR → carta / POS / escaparate muestran por familia (secciones)
· FILTRAR → el escaparate poda por familia / grupo
· COSTEAR → coste y margen AGREGADOS por familia ("¿qué familia me da margen?")
· REGLA   → margen / food-cost objetivo POR FAMILIA (una política por familia, no producto a producto)
```

---

## 5 · El molde PRISMA de cada ente (5 huecos)

```
VALUE_OBJECT Insumo {                          // el minúsculo — materia prima
  IDENTIDAD     { id, nombre }
  CONTRATO      { — no tiene opciones de venta: es INSUMO, no producto }
  naturalezas   { precio: por_peso(€/kg)|por_unidad, stock }
  clasificacion { familia, subfamilia, grupo }  // eje COMPRA
  coste_componente : Centimos
  _NO_ES_PRODUCTO : true                        // GATE: un insumo/sub-compuesto NO se precia solo
}

VALUE_OBJECT Compuesto {                        // la formulación (receta genérica)
  IDENTIDAD     { id, nombre }
  CONTRATO      { componentes: [{ ref, cantidad, unidad }] }   // refs, no datos
  clasificacion { familia, subfamilia, grupo }  // eje FABRICACIÓN
  coste_unidad  : Centimos                       // Σ componentes — lo calcula el costeador prisma, llega por evento
  puede_anidar  : true                           // un componente puede ser otro Compuesto
}

VALUE_OBJECT Producto {                         // lo que se vende (5 huecos, lo que mira el puente)
  IDENTIDAD     { id, nombre }
  RESTRICCIONES { verdad_obligatoria: [alergenos] }            // heredados del compuesto
  CONTRATO      { compuesto_ref: Optional<Id>,                 // el arco producto↔compuesto
                  precio_base_centimos: Optional<Int>,         // ¿precio ya fijado a mano?
                  preguntas_abiertas: [{campo:'coste', respondida:Bool}] }
  naturalezas   { origen: 'elaborado' | 'de_reventa',          // ← la LLAVE del órgano
                  precio: por_unidad | por_peso | ... }
  clasificacion { familia, subfamilia, grupo }  // eje VENTA
  arquetipo     { comestible | pieza | servicio | ... }        // NO lo decide el puente (lo decide origen)
}
```

---

## 6 · El ÓRGANO-PUENTE (recetario → `puente-compuesto`)

```
QUÉ ES:  el CONECTOR de tres piezas que no se conocen entre sí —
         COMPUESTO (formulación) · PRODUCTO (catálogo) · PRECIO (coste)—.
         Es el ÚNICO que sabe a la vez el compuesto Y el producto.
         Es PUENTE, no custodio: conecta, no guarda.

CLASE PuenteCompuesto EXTIENDE ReflejoHibrido {
  estado_propio : NINGUNO          // puente puro; onUnload solo cierra limpio
  toca_fs       : NUNCA            // invariante del reflejo: nadie escribe sin custodio

  // ── TRABAJO 1 — ATAR la identidad (reacción a catalogo.editado|actualizado) ──
  atar(catalogo):
    PARA prod EN catalogo.productos DONDE origen=='elaborado' Y !compuesto_ref Y nombre:
        c ← compuestos.obtener(nombre)                        // busca compuesto HOMÓNIMO (por nombre)
        SI !c: CONTINUAR                                       // no hay homónimo → NO inventa el arco
        catalogo.update_product(prod, { compuesto_ref: c.id }) // ⇒ producto-manager ESCRIBE
    // idempotente: en cuanto queda el ref, el siguiente ciclo lo salta

  // ── TRABAJO 2 — PUENTE coste→precio (reacción a compuesto.coste.calculado) ──
  puente(evento):
    coste ← evento.coste_unidad || evento.coste_total ; SI !coste: RETORNA   // GATE: coste real
    hit ← resolverProducto(evento.compuesto_id)                              // ¿qué producto lo referencia?
    SI !hit: RETORNA                                                          // GATE: los 280 no-vendidos NO se precian
    { accion, pvp } ← decidir(hit.prod, coste, food_cost)
    SI accion=='testigo': EMITIR compuesto.coste_actualizado {pvp, precio_actual}   // avisa, NO pisa
    SI accion=='aplicar': coste.aplicar(hit, coste, food_cost)               // ⇒ producto-manager ESCRIBE pvp

  // ── el núcleo de la DECISIÓN — no pisar la decisión del comerciante ──
  decidir(prod, coste, food_cost):
    pvp_sugerido ← round(coste / food_cost)                    // food_cost def 0.30, overridable por evento
    preciado   ← prod.precio_base_centimos > 0
    costeAbierto ← prod.preguntas_abiertas.alguna(q.campo=='coste' Y !q.respondida)
    accion ← (preciado Y !costeAbierto) ? 'testigo' : 'aplicar'
    RETORNA { accion, pvp_sugerido }
    // testigo = tú ya pusiste precio a mano y cerraste la duda → NO se sobrescribe, solo se canta la deriva
    // aplicar = no hay precio firme → el puente escribe el pvp

  resolverProducto(compuesto_id):                              // barre catálogos, 'en_servicio' primero
    RETORNA el producto con compuesto_ref==compuesto_id | null
}
```

---

## 7 · PERSISTENCIA — por delegación, condicional

```
recetario/puente NO tiene fichero propio. Todo lo que cambia lo escribe el CUSTODIO:

  atar   → catalogo.update_product ⇒ producto-manager escribe compuesto_ref  en /prisma/catalogo/<id>.json
  precio → coste.aplicar           ⇒ producto-manager escribe precio_base    en /prisma/catalogo/<id>.json
           (coste TAMPOCO escribe fs: también delega en catalogo.update_product)

REGLA:  el puente y coste PROPONEN el cambio · el CUSTODIO lo ESCRIBE. El puente no posee nada.

CONDICIONAL a la decisión:
  accion=='aplicar' ⇒ SÍ persiste (se escribe el pvp)
  accion=='testigo' ⇒ NO persiste ⇒ solo EMITE compuesto.coste_actualizado (aviso, no escritura)
```

---

## 8 · RITMO — reactivo, disparado por eventos PRISMA

```
motor    : EVENT-DRIVEN · sin timer · sin polling · sin estado que vigilar
entrega  : best-effort · fire-and-forget (no responde, no bloquea el bus)

DOS gatillos = DOS cadencias, marcadas por OTROS (prisma-nativos):
  compuesto.coste.calculado     ← lo emite el COSTEADOR PRISMA (ya NO escandallo)  → dispara PUENTE
  catalogo.editado|actualizado  ← prisma                                           → dispara ATAR

idempotente : el ATAR salta lo ya atado
auto-freno  : GATE de coste (sin coste real → no dispara) · GATE de producto (nadie referencia → no dispara)

el puente NO tiene ritmo propio: late cuando laten el costeador o el catálogo. Es un REFLEJO, no un corazón.
```

---

## 9 · Lo que FALTA CREAR en prisma (para cortar pizzepos)

```
1. insumos-manager        custodio de /prisma/insumos/      (biblioteca de materias primas)
2. compuestos-manager     custodio de /prisma/compuestos/   (biblioteca de formulaciones, con .versions)
3. costeador prisma       Σ coste de un compuesto (recorre componentes por ref) → emite compuesto.coste.calculado
                          — reemplaza la dependencia de escandallo (pizzepos)
4. taxonomía abierta      registro de clasificación por eje (compra/fabricación/venta), semilla + custom
5. renombrar              recetario → puente-compuesto · receta_ref → compuesto_ref · recetas.obtener → compuestos.obtener
```

---

## 10 · Hallazgos del análisis (para no perderlos)

```
· recetario es hoy la ÚNICA pieza de prisma que cruza a pizzepos (escandallo + /pizzepos/recetas.json).
· su module.json declara `publishes: (vacío)` pero el código EMITE eventos → divergencia manifest↔realidad (a sanear).
· el reparto que gobierna todo:  REFLEJO (determinista: leer/sumar/persistir) · el LLM/guión solo lo fuzzy.
  El POS petó porque un AGENTE (LLM) hizo el trabajo del REFLEJO (procesar todo el catálogo de golpe → timeout).
· metáfora que lo fija:  guión = skill (qué hacer) · actor = LLM (interpreta) · tramoya = reflejo (construye, mecánico).
  El puente-compuesto es TRAMOYA: determinista, sin LLM.
```

---

## 11 · EL REPARTO (dramatis personae) — 7 papeles + 2 de fondo + 1 actor

> Metáfora: casi todos son TRAMOYA (reflejo determinista); solo el adaptador es ACTOR (LLM, piensa).

```
CUSTODIOS — guardan y escriben (dueños de UN store) · TRAMOYA
  1 insumos-manager      dueño /prisma/insumos/       ENTRA: al nacer/cambiar un insumo         [CREAR]
  2 compuestos-manager   dueño /prisma/compuestos/    ENTRA: al nacer/cambiar una formulación   [CREAR]
  3 producto-manager     dueño /prisma/catalogo/      ENTRA: al nacer/cambiar un producto       [existe]

MOTORES — calculan, NO guardan · TRAMOYA
  4 costeador prisma     Σ coste de un compuesto      ENTRA: cambia un insumo o se le pide → EMITE compuesto.coste.calculado
  5 coste                coste → margen → pvp         ENTRA: el puente le dice coste.aplicar (delega en producto-manager)  [FRONTERA]

PUENTE — conecta, sin store · TRAMOYA
  6 puente-compuesto     ata producto↔compuesto + pipetea coste→precio (ex-recetario)
                         ENTRA por 2 puertas: catalogo.editado|actualizado → ATAR · compuesto.coste.calculado → PUENTE

REGISTRO — transversal · TRAMOYA
  7 taxonomía            árbol abierto familia>subfamilia>grupo (un eje por nivel: compra/fabricación/venta)
                         ENTRA: al clasificar un item o al proponerse una familia nueva (humano aprueba)

DE FONDO — siempre en escena
  · filesystem   escribe FÍSICAMENTE (fs.write atómico) a las órdenes de un custodio
  · bus          el escenario (todo entra/sale por eventos)

EL ÚNICO ACTOR (fuzzy) — el LLM
  adaptador (blueprint/LLM)  INTERPRETA el crudo (foto/texto/fila) → molde de 5 huecos
                             ENTRA: al dar de alta insumo/compuesto/producto desde algo sin estructurar
                             el único que PIENSA; el resto es tramoya.

MAPA: custodio GUARDA · motor CALCULA · puente CONECTA · registro CLASIFICA · actor INTERPRETA · fs ESCRIBE · bus TRANSPORTA
```

---

## 12 · PUERTAS DE ENTRADA — por dónde entra el dato crudo

> TODAS convergen en el ADAPTADOR (1 normalizador). Cada puerta tiene su lector del medio.

```
PUERTA               ACTOR (quién recibe)          PAPEL
  1 CHAT             LLM de página (ai-gateway)    escucha lenguaje natural, entiende intención, CONDUCE
                     — el que tiene el hilo         (estructura o delega en adaptador). Rellena lo PRIVADO. Actor principal.
  2 TEXTO libre      adaptador (LLM)                descompone "harina T55, 0,59€/kg" → molde. Normalizador puro.
  3 FOTO / imagen    ocr4rs + verificador-visual    OJOS: imagen/etiqueta → texto+campos → adaptador
  4 FACTURA (OCR)    módulo facturas (OCR+AI)       extrae qué compraste + precio real → insumos  [oportunista, ver §16]
  5 WEB / precio     crawl4rs·mercadona-api·leer-web precio de MERCADO de un insumo → adaptador
  6 HOJA/CSV/LOTE    importador [por crear]         parte el lote en filas; cada fila → adaptador. VOLUMEN.
  7 API proveedor    conector [por crear]           sincroniza catálogo/precios del proveedor → insumos
  8 MIGRACIÓN        importador [por crear]         trae de pizzepos/otro una vez → los 3 niveles

REGLA DE LAS PUERTAS:
  · ninguna escribe directa en un store: todas pasan por ADAPTADOR → molde → CUSTODIO
  · lo OBJETIVO (qué es, precio mercado, ingredientes) → lo estructura el adaptador
  · lo PRIVADO (tu coste real, tarifa, stock) → SOLO por la puerta MANUAL/CHAT. No se inventa (queda ABIERTO).
  · una puerta puede traer PARCIAL → las preguntas_abiertas marcan lo que falta
  patrón común:  lector del medio (ojos/OCR/scraper/parser) → ADAPTADOR (normaliza) → molde → custodio
  (el CHAT es la excepción: el medio es lenguaje, el LLM lo lee directo, sin pre-lector)
```

---

## 13 · FORMA → NIVEL — cómo el adaptador enruta (y el LÍMITE de la parcela)

> La misma "pizza" llega en formas distintas y cae en niveles distintos. El adaptador lee la FORMA.

```
¿trae CANTIDADES (g, ml, hojas) y no precio de venta?   → COMPUESTO   (fabricación)   ← NUESTRO
¿es materia suelta con su precio de compra?             → INSUMO      (materia prima)  ← NUESTRO
¿trae PRECIO DE VENTA + categoría + opciones?           → PRODUCTO    (venta)          ← PARCELA VECINA

Ej.1  "pizza samba masa 315g tomate 60g mozzarella 100g 2 hojas albahaca"  → COMPUESTO (+ insumos)   NUESTRO
Ej.2  catálogo JSON {precio 10.5, categoria, ingredientes[opciones QUITAR/AÑADIR]}  → PRODUCTO/venta  NO nuestro

⚠ en el catálogo, "ingredientes" con precio_extra NO son la receta: son OPCIONES DE VENTA (quitar/añadir).
   precio_extra = delta de VENTA ≠ coste del insumo. Prisma SEPARA opciones (venta) de compuesto (fabricación).
   El pizzepos viejo los metía en la misma lista — ese era el lío.
```

### El LÍMITE de la parcela (contra el ansia de control)

```
NUESTRA PARCELA:  insumo → compuesto → COSTE.  FIN.
FUERA (vecino):   producto · precio de venta · opciones · categoría-venta · escaparate · POS
FRONTERA:         el compuesto emite su coste → ahí acaba lo nuestro. Quién lo use para un pvp = el vecino.
                  (compuesto_ref y el ATAR lo TOCA el puente, pero el producto NO se diseña aquí)
SEÑAL DE ALARMA:  si aparece "precio de venta / opciones / cliente" en el diseño → me salí de la parcela.
```

---

## 14 · INGESTA ≠ PROCESO — de a una o en tanda; costeo receta a receta

> P0 (expresión en positivo): se DECLARA el camino correcto, no se prohíbe nada.

```
INGESTA (cómo ENTRAN)          →  de a una  O  en tanda   (las dos puertas valen)
PROCESO/COSTEO (cómo se TRABAJAN)  →  CAMINO CORRECTO: receta a receta, una a una

CAMINO CORRECTO (el mandato, no una prohibición):
  la tanda se PARTE en unidades · el costeo es 1 compuesto : 1 cálculo : 1 evento

POR QUÉ es lo sano (la lección del POS, que petó por "todo de golpe"):
  · no revienta el timeout        (nunca hay un "de golpe" que ahogue)
  · fallo AISLADO                 (falla la 137 → las otras 299 siguen)
  · progreso VISIBLE              (ves 137/300, no 20 min de silencio)
  · determinista y REINTENTABLE   (repites solo la que falló)
  · idempotente                   (recostear una no toca a las demás)

MECÁNICA:  tanda de 300 → compuestos-manager persiste cada una → se ENCOLA (rail/chef's list) →
           el costeador procesa UNA por tick → emite compuesto.coste.calculado (×1) → siguiente.
           La tanda es la PUERTA; el motor late de a una.
```

---

## 15 · PASO 0 — RECONCILIAR insumos ANTES de crear (limpieza de biblioteca)

> Lo PRIMERO cuando entra una formulación no es crear insumos: es RECONOCER si ya existen.
> Sin esto, la biblioteca se llena de duplicados y el anti-cuello se rompe.

```
ACTOR:  adaptador (LLM, match semántico) + insumos-manager (la biblioteca)

  match EXACTO                        → reusa
  similitud tipográfica (typo)        "mozarella" ≈ "mozzarella"          → propone el existente
  mayúsculas / acentos / plural       "Tomate","olivas" → "tomate","oliva"
  mismo concepto, OTRO idioma         "tomate"/"tomato"/"tomàquet"        → match por concepto
  sinónimo                            "aceituna" ≈ "oliva"                → propone unir
  ⚠ ambiguo (¿variante o el mismo?)   "tomate" vs "tomate frito" vs "tomate seco"
                                      → NO fusiona a la ligera: PROPONE, el humano confirma (anti-wipe)
  genuinamente nuevo                  → crea el insumo (canónico, en la biblioteca)

POR QUÉ es el paso 0 (no un arreglo posterior):
  · el compuesto guarda REFS → deben apuntar al insumo CANÓNICO, no a un duplicado
  · reconciliar DESPUÉS = 5 "mozzarellas" repartidas por 200 compuestos → limpiar es un infierno
  · reconciliar ANTES = biblioteca nace limpia (un insumo, una identidad, un precio, un sitio)
  · misma ley que arquetipos: la identidad se RECONOCE, no se duplica · lo dudoso lo aprueba un humano

FLUJO:  formulación entra → adaptador extrae componentes → RECONCILIA cada uno (paso 0) →
        existe: usa id · nuevo: crea · dudoso: pregunta → compuesto guarda refs CANÓNICAS → costeo de a una
```

---

## 16 · COSTE POR FASES — estimado ahora, real después (post-venta)

> Meter facturas + coste real en el arranque = mucha complejidad → RALENTIZA la puesta en marcha.

```
FASE 1 · COMPUESTOS (ahora)          →  coste ESTIMADO
  insumo lleva precio de REFERENCIA (web) o estimado a mano.
  compuesto = Σ componentes (por ref, cantidades) → coste estimado. Receta a receta.
  SUFICIENTE para arrancar y orientar el pvp. Simple, rápido, sistema VIVO ya.

FASE 2 · COSTE REAL (más tarde, POS-VENTA)  →  cruce con la realidad
  compras REALES (lo que pagaste) × producto VENDIDO (lo que salió) → coste verdadero.
  vive con la venta/compras, no con la formulación. Otra parcela, otro momento.
  (llega cuando hay ventas y compras que cruzar — antes no serviría)
```

### La FACTURA no se cierra — queda OPORTUNISTA (matiz)

```
FASE 1 no DEPENDE de facturas (arranca con estimado). PERO la puerta no se cierra:
  · si llega una factura/albarán y encaja con un insumo → se aprovecha (el camino ya existe:
    misma reconciliación del paso 0 + misma escritura del coste del insumo). No se construye pipeline OCR dedicado.

REGLA DE FUENTE (espera lista, muerde sola cuando el dato cae):
  hay coste REAL de un insumo (factura/albarán)  →  gana sobre la referencia (web)
  no hay                                          →  referencia/estimado

NORMAL vs EXCEPCIÓN (por ORIGEN):
  NORMAL     factura de producto TERMINADO / de_reventa  →  parcela VENTA (un de_reventa NO lleva compuesto). No nuestro.
  EXCEPCIÓN  factura de una MATERIA PRIMA (insumo de un elaborado)  →  alimenta el coste REAL de ese insumo. Oportunista.
```

---

## 17 · LO DISTINTO DE CADA PUERTA (lo que NO repite patrón)

```
1 FOTO no trae CANTIDADES      → identifica componentes, no gramos → formulación INCOMPLETA (cantidades ABIERTAS). Puerta débil.
2 FACTURA/WEB no traen receta  → traen el COSTE del ÁTOMO (insumo). Precedencia: factura (real) > web (referencia).
3 CAMBIO DE PRECIO = CASCADA   → actualizar el precio de "harina" NO es un alta: re-costea los N compuestos que la usan.
                                 Aquí el anti-cuello se vuelve real. La cascada también es receta a receta (por salud).
                                 Es un RITMO propio: cambio-de-precio → recálculo, distinto de formulación-entra.
4 RECONCILIAR PROVEEDOR        → la factura dice "HARINA TRIGO W300 25KG" → tu insumo "harina". Misma reconciliación (§15),
                                 otro vocabulario (jerga de albarán).

CSV · API-alta · migración → variantes de "tanda" o "una a una" del mismo patrón. Sin novedad estructural.
```
