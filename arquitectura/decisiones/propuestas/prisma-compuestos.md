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
