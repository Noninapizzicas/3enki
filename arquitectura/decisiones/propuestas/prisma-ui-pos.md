# PRISMA · UI-POS — la superficie de venta que EMERGE del ProductoUniversal

> Guión de diseño, disecionado con la skill `diseccionador` (las 6 preguntas).
> **Corte limpio**: la UI-POS NO es una isla cliente (nada de bundle autónomo, catálogo embebido,
> tasado en el navegador, ni `cobro` que muere en un `TODO`). Es una **superficie prisma-pura** que
> EMERGE del ProductoUniversal, corre sobre el frontend genérico ya vivo, y cuya única verdad de
> precio/carrito/cobro es el **backend POS de prisma, que ya existe y está verificado**.
>
> Medio nativo: OOP + pseudocódigo + JSON. Prosa, la justa.
> Guiones hermanos: `prisma-pos-valor` (el margen que esta venta genera) · `prisma-compuestos` (el coste que consume).

---

## 0 · Objetivo (afilado)

```json
{
  "objetivo": "un POS OPERABLE de verdad para un proyecto prisma — el operador toca un producto, lo personaliza, lo suma y cobra — CERRANDO el círculo real (carrito→cuenta→cobro→ticket→cierre), no una maqueta",
  "regla_madre_1": "la UI REFLEJA, no calcula — la verdad del precio, del carrito y del cobro vive en el BACKEND; la pantalla no la duplica",
  "regla_madre_2": "los controles EMERGEN del ProductoUniversal (opciones[].modo) — nada se teclea a mano ni se copia de pizzepos: una pizza, una lámpara, un regalo y un servicio salen de UN render derivado",
  "regla_madre_3": "el gusto TIÑE (marca · lentes-diseño), no BLOQUEA — v1 sale con base neutra derivada; la capa de diseño fina es follow-up marcado, jamás un requisito de arranque"
}
```

## 1 · Lo que YA existe y REUSAMOS tal cual (no reconstruir)

```
BACKEND POS PRISMA — verificado, persistente, prisma-puro (/prisma/**), EVENT-DRIVEN
  carrito   buffer de venta · add_item TASA con opciones.evaluar (céntimos) · persiste por proyecto   ✓
  cobro     efectivo/tarjeta/bizum/transf/mixto · ciclo pendiente→completado · céntimos               ✓
  cuenta    ticket · abierta→cobrada→cerrada · ata carrito↔cobro · ref_display (T-001…)                ✓
  ticket    recibo formateado (texto)                                                                  ✓
  cierre    cuadre del día por método · acumula cobro.procesado · persiste por proyecto                ✓
PROYECCIÓN — sin estado, deriva del catálogo
  proyector vista.completa/productos/producto/buscar · re-emite vista.actualizada al cambiar catálogo  ✓
  opciones  evaluar.request → valida + precia la selección (Strategy por modo · céntimos)              ✓
FRONTEND GENÉRICO — pizzepos lo prueba, prisma lo HEREDA sin tocar infra
  MqttClient (singleton, WSS 443) · mqtt-request (ui/request/<dom>/<accion> → ui/response) ·
  lazy-registry (módulos bajo demanda) · patrón STORES (writable+derived, subs al bus) ·
  rutas multi-tenant /[project_id]/<pantalla> · resiliencia (cola pre-conexión, reconexión)            ✓
```

**Nada de lo anterior se construye aquí.** Esta parcela es la SUPERFICIE que los orquesta.

## 2 · El corte limpio (lo que esta UI NO hace — porque otro ya es su dueño)

```
✗ NO tasa en el cliente          → el precio lo fija carrito.add_item (opciones.evaluar) · UNA fuente de verdad
✗ NO embebe el catálogo          → lo lee VIVO por el proyector (vista.completa) · se refresca por evento
✗ NO guarda carrito propio       → el buffer es del backend (prisma/carrito) · la pantalla lo REFLEJA
✗ NO isla servida por Caddy      → eso es el ESCAPARATE (público, read-only, sin escribir); el POS ESCRIBE (cobra)
✗ NO componentes de pizzepos     → prisma-puro; los controles salen del ProductoUniversal, no del comandero viejo
```

---

## 3 · LA DISECCIÓN — espinazo + 6 preguntas

```
ESPINAZO (responsabilidades de la superficie):
  DERIVAR (qué mostrar) → RENDER (pintar) → CAPTURAR (la selección) → TASAR → ACUMULAR → COBRAR → REFLEJAR (estado vivo)

DERIVAR     1.¿pensar o calcular? CALCULAR (opciones[].modo → tipo de control)   → REFLEJO (proyector: vista.completa, EXISTE)
            2.¿quién escribe?     nadie — proyección SIN estado
            3.¿de a una?          el catálogo se proyecta entero para mostrar; el render es incremental por producto
            4.¿si falta dato?     producto sin precio → "Consultar" NOMBRADO · producto sin opciones → botón directo (sin sheet)
            5.¿cruces?            céntimos (canónico) — la UI FORMATEA €, no convierte
            6.¿conexión?          escucha vista.actualizada → re-render (consume-on-read del refresco)

RENDER      1.¿pensar o calcular? presentación DETERMINISTA por la vista        → REFLEJO DE UI (componentes Svelte)
              el GUSTO (layout, marca, lentes-diseño) = JUICIO                  → capa fuzzy OPCIONAL (follow-up, no bloquea)
            2.¿quién escribe?     no persiste — pinta desde el store
            6.¿conexión?          props ← store reactivo

CAPTURAR    1.¿pensar o calcular? CALCULAR (ELEGIR_UNO=radio·VARIOS=check·QUITAR=chip·LIBRE=texto)  → REFLEJO DE UI (OpcionesRenderer deriva del modo)
            4.¿si falta dato?     LIBRE sin texto → se añade sin nota · opción sin valores disponibles → no se pinta

TASAR       1.¿pensar o calcular? CALCULAR
            2.¿QUIÉN?  ── EL CORTE MAESTRO ──  el BACKEND (carrito.add_item tasa con opciones.evaluar). La UI NO tasa.
                       eco optimista en cliente = permitido para latencia, pero la VERDAD llega en carrito.item_agregado
            5.¿cruces?            céntimos, UNA frontera (opciones.evaluar) — ya canónica
            6.¿conexión?          carrito.add_item.request → carrito.item_agregado

ACUMULAR    1.¿pensar o calcular? CALCULAR → el custodio del buffer es prisma/carrito (persistente por proyecto)
            2.¿quién escribe?     prisma/carrito (ÚNICO dueño del buffer) · la UI NO tiene carrito propio: refleja el suyo
            3.¿de a una?          1 item : 1 add_item : 1 evento
            4.¿si falta dato?     sin conexión → cola de mqtt-request (ya existe) → NOMBRADO "reintentando", jamás pierde el ítem en silencio
            6.¿conexión?          store ← carrito.{item_agregado, item_eliminado, item_actualizado, vaciado}

COBRAR      1.¿pensar o calcular? CALCULAR (orquestación de RPCs, cero juicio)   → REFLEJO (la superficie DISPARA, el backend HACE)
            2.¿quién escribe?     cuenta (cuenta.crear) · cobro (cobro.crear/confirmar) · cierre (acumula) — cada uno SU custodio
            3.¿de a una?          1 venta : 1 cuenta : 1 cobro
            4.¿si falla confirmar? NOMBRADO "cobro no confirmado" — la venta NO se marca cerrada · JAMÁS finge cobrado
            5.¿cruces?            método de pago (efectivo/tarjeta/bizum/transf/mixto) — el backend cuadra; la UI solo elige
            6.¿conexión?          cobro.procesado → cuenta pagada → cierre acumula → la UI VACÍA el carrito (reflejo del cierre real)

REFLEJAR    1.¿pensar o calcular? CALCULAR → store reactivo (patrón STORES: writable+derived+subs)  → REFLEJO
            6.¿conexión?          subscribe a los eventos del POS → render reactivo (nada de polling)
```

---

## 4 · BUILD-LIST (piezas, en orden de dependencia)

```
1. store  prisma-pos            [CREAR] frontend/src/lib/stores/prisma-pos.ts
                                        estado ← bus (carrito.*, cobro.*, cuenta.*, cierre.*) · patrón STORES ·
                                        derivados: lineas, total_centimos, num_items, metodoSeleccionado, cobrando ·
                                        acciones: add(producto,selección) · quitar(i) · vaciar · cobrar(metodo)
                                        (las acciones son mqttRequest a los RPCs prisma ya vivos — cero lógica de precio)
2. proyección vista POS         [REUSA]  proyector.vista.completa — nada nuevo en backend
3. OpcionesRenderer             [CREAR] components/prisma-pos/OpcionesSheet.svelte — un control por opciones[].modo (deriva, no teclea)
4. componentes de pantalla      [CREAR] components/prisma-pos/{PosScreen, ProductoGrid, ProductoCard, CarritoPanel, CobroPanel}.svelte
                                        PosScreen orquesta; el resto es presentación pura ← store
5. ruta                         [CREAR] routes/[project_id]/pos/+page.svelte (patrón de página: projectId + onNavigate + <PosScreen>)
6. módulo lazy (si va en barra)  [CREAR] modules/prisma-pos/{manifest.json,index.ts} — zona work-bar, botón + panel (autodescubierto)
7. wiring al backend            [REUSA]  carrito.* · cobro.* · cuenta.* · cierre.* — RPCs prisma EXISTENTES (solo se consumen)

CAPA FUZZY (follow-up marcado, NO bloquea v1):
8. teñido por marca + lentes    [FUTURO] el look emerge de carta-marketing.get_perfil + lentes.obtener{dominio:'diseño'};
                                        v1 base neutra derivada del ProductoUniversal. La capa LLM de gusto se cosecha como
                                        skill de cantera (prisma-taller-ui) cuando haya PÁGINA que la beba (regla montar-pack-lentes).
```

---

## 5 · Reglas transversales aplicadas

```
· la UI REFLEJA, no es la verdad     — precio (carrito), buffer (carrito), cobro (cobro), cuadre (cierre) viven en el backend
· nada embebido                      — catálogo LEÍDO en vivo por el proyector; se refresca por vista.actualizada
· nada teclado                       — los controles EMERGEN de opciones[].modo (mismo ProductoUniversal, N arquetipos, 1 render)
· de a una                           — ítem a ítem, venta a venta; ninguna tanda "de golpe" (la lección del POS que petó)
· todo por evento                    — ui/request → ui/response para actuar · subscribe para reflejar · cero import entre parcelas
· dato ausente NOMBRADO              — sin precio → "Consultar" · sin conexión → cola visible · cobro no confirmado → dicho, no fingido
· el humano cierra la venta          — la UI ofrece y dispara; el backend ejecuta; nada automático pisa una decisión de caja
```

---

## 6 · Lo que esta parcela NO es (límite — contra el ansia de control)

```
· NO el backend POS                 → carrito/cobro/cuenta/ticket/cierre YA existen (prisma-puro) — aquí solo se consumen
· NO re-tasado en cliente           → la única fuente de precio es opciones.evaluar (vía carrito.add_item)
· NO un bundle servido por Caddy    → eso es el ESCAPARATE (público, read-only); el POS escribe y necesita el bus autenticado
· NO componentes de pizzepos        → prisma-puro; si algo se parece al comandero, se DERIVA del producto, no se copia
· NO margen/beneficio               → esa cara la añade prisma-pos-valor (escucha cobro.procesado) — guión hermano
· NO cocina/pase                    → órgano del arquetipo hostelería (pizzepos), no del POS universal
```

---

## 7 · Frontera con lo vecino (por dónde CONECTA, sin pisar)

```
proyector        →  la UI LEE la vista (vista.completa) y se refresca (vista.actualizada)          [lee]
carrito/cobro/…  →  la UI DISPARA RPCs y REFLEJA sus eventos                                        [actúa + refleja]
prisma-pos-valor →  escucha cobro.procesado por SU cuenta (margen) — la UI no lo conoce             [desacoplado]
marca + lentes   →  TIÑEN el look (best-effort) — ausentes → base neutra, nunca bloquea             [opcional]
FRONTERA:  la UI acaba donde empieza el backend. Toca el bus, no los stores de nadie. Es superficie, no dueña.
```
