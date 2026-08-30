# ESQUEMA — cara del JEFE del módulo `recetas` (el RECETARIO — origen del coste)

> Árbol maestro consolidado (pasadas 1-3). Alimenta al agente de UI que escribe
> el panel. Ley de agnosticismo: cero tecnología de sistema ambiente. El análisis
> es de la CARA DEL JEFE — la utilización (POS/PWA consumen recetas, cocina las
> ejecuta) quedó fuera, anotada.

> Fuente: `modules/pizzepos/recetas/index.js` (reflejo-1.3.0, leído completo) +
> `module.json` v2.2.0 (5 ui_handlers verificados) + `receta.schema.json`
> (el FRENO, AJV) + blueprint agéntico v2.9.0 (la cara FUZZY viva en el chat:
> 15 operaciones estructuran/EDITAN; el reflejo materializa 5 + 1 subscriber).

## 1. Quién es el jefe y qué decide

Dueño del RECETARIO: la definición de CÓMO se hace cada cosa que se elabora
(pizza, masa, salsa, base — un solo patrón: la Linea). Una receta =
{ nombre, tipo, rinde, lineas[] } y cada línea = ingrediente × cantidad exacta
con unidad canónica (g|ml|ud). Decide:

- **D1 — CREAR receta** (la Margherita, la masa nonina, la salsa Victorino):
  nombra, clasifica (tipo slug libre, default pizza) y DECLARA las líneas
  con sus cantidades → `recetas.crear`. El reflejo normaliza, persiste
  atómico, VERIFICA aterrizaje y solo entonces publica `receta.creada` —
  sin éxito fantasma (201 verificada · 409 ya existe · 503 NO guardada).
- **D2 — VALIDAR la forma (EL FRENO antes de creer que guardó)**: comprobar
  el borrador contra el contrato `receta.schema.json` (AJV) — mata la línea
  hueca (cantidad 0, nombre vacío, unidad no canónica) SIN prohibir el
  borrador → `recetas.validar` (respuesta 200 `{valid, errors[]}`, sin señal).

Frecuencia: alta en aperturas (alta de producto), baja después — cada receta
se declara UNA vez bien. Por eso la forma grande es el editor-bloque de líneas,
no un form apretado.

Lo que NO decide:
- **el coste**: lo deriva escandallo (`escandallo.coste.calculado` entra como
  persist write; `coste_unidad`, `lineas_detalle`, `lineas_sin_precio` son
  ESCRITOS por escandallo — la UI los muestra, no los edita).
- **editar* una receta ya creada**: sin reflejo ni ui_handler hoy
  ([ABIERTO] — ver huecos; el chat lo hace hoy vía blueprint).
- el catálogo de ingredientes que alimenta el `ref` (módulo ingredientes).
- consumir recetas al vender (POS) ni ejecutarlas (cocina) — utilización.

## 2. Invariantes (verificadas en código, restricciones honestas)

- INV1 — **el coste VIVE en las líneas**: escandallo lee
  `recetas.listar {incluir_lineas:true}` (receta_id, lineas[], coste_unidad)
  y ESCRIBE de vuelta vía `escandallo.coste.calculado` (→ persist en
  index.js L286-316). El recetario no calcula nada: su job es dejar las
  `lineas` COSTEABLES (ref resoluble + cantidad > 0 + unidad canónica).
- INV2 — **unidad canónica g|ml|ud** (schema `receta.schema.json`): el peso
  NUNCA va embebido en el texto de unidad (`bola (315g)` está vetado);
  no-convertibles (hojas, pizca) → `ud` con cantidad aproximada.
- INV3 — **ref ÚNICO para todo**: una línea referencia por `ref` un
  ingrediente del catálogo O otra receta (sub-receta: masa, salsa) — un solo
  mecanismo, resuelto por escandallo (coste_unidad × cantidad si es receta).
- INV3b — **borrador legítimo**: `lineas` vacía es válida (nace
  `incompleta:true` + `campos_pendientes`); el freno juzga CADA línea
  presente, no la completitud. `crear` con solo nombre es un borrador.
- INV4 — **dedup de nombres activos**: dos recetas no comparten nombre
  normalizado en en_servicio (409 ALREADY_EXISTS con `existing_id`); el id es
  slug estable con sufijo -N si choca con archivadas.
- INV5 — **tipo es slug LIBRE** (`^[a-z0-9-]+$`, se normaliza; default
  'pizza'): bocata/cazuela/postre entran sin tocar código. La unidad del rinde
  sí es enum {ud, g, ml}.
- INV6 — **`crear` responde SOLO tras verificar el disco** (no hay señal sin
  aterrizaje confirmado): la respuesta 201 ES la verdad inmediata y
  `receta.creada` (L271) la re-confirma (doble confirmación, nunca optimismo).
- INV7 — **validar es función pura**: función pura sin señal — dictamen en la
  respuesta (`{valid, errors[]{path}}`); parearían una señal inventada.
- INV8 — **multi-tenant**: todo RPC lleva `project_id` (proyecto activo); las
  señales se filtran por proyecto — las de otro negocio no tocan la vista.

## 3. Señales pareadas (verificadas en index.js, hoja a hoja)

| Declaración | Señal de confirmación | Origen | Granularidad |
|---|---|---|---|
| `crear` | `receta.creada` {receta_id, nombre, version, estado_operativo, firma, incompleta?, campos_pendientes?} | L271 — tras verificar que la persistencia aterrizó | 1 evento |
| (coste aplicado por escandallo) | `receta.actualizada` {receta_id, campos_actualizados[], origen:'escandallo.coste.calculado'} | L306 (persist write del subscriber) | 1 por coste aplicado |
| `listar/obtener/ingredientes` | — (lecturas) | — | — |
| `validar` | — (dictamen en la RESPUESTA; función pura) | L112-129 | — |

## 4. Composición de la vista del jefe (3 capas)

```
1. INFORMARSE   cinta del recetario (n recetas · n con coste · n incompletas)
                selector de receta (ref-select: borrador + en_servicio)
                TABLA del recetario: líneas ingrediente × cantidad + unidad
                (+ notas) y su coste si escandallo ya lo escribió; ficha por
                obtener {tipo, rinde, version, estado, versiones_anteriores}
2. DECLARAR     CREAR receta — editor-bloque: nombre + tipo + rinde +
                líneas dinámicas (ref del catálogo `recetas.ingredientes`,
                cantidad, unidad, notas) con el FRENO `validar` en vivo
                (errors[].path clicables en su fila)
3. CONFIRMAR    dictamen de CREAR (201 verificada / 409 ya existe /
                503 NO guardada, todos nombrados) + receta.creada
                re-confirmando con debounce 60ms (nunca recarga, nunca
                estado optimista)
```

Frecuencia → jerarquía: leer el recetario es lo diario (tabla arriba); crear
es la forma grande abajo; validar corre en vivo mientras se escribe.

## 5. Formas UI asignadas (hoja a hoja)

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| H1 cinta del recetario | cinta-estado | (proyección de listar) | receta.creada / receta.actualizada |
| H2 selector | ref-select (receta) | `recetas.listar` | — |
| H3 tabla del recetario | tabla líneas ingrediente×cantidad | `recetas.obtener` (+ listar con incluir_lineas) | receta.actualizada (coste) |
| H4 crear receta | editor-bloque (la forma GRANDE) + transición | `recetas.crear` | receta.creada |
| H5 freno validar | informe/dictamen (errores[].path) | `recetas.validar` | — (función pura) |
| H6 catálogo para líneas | ref-select + chips de precio | `recetas.ingredientes` | — |

## 6. Huecos [ABIERTO] (decisiones del dueño — nombrados, no suplidos)

- [ABIERTO] cara EDITAR una receta existente: `actualizar` tiene pseudocódigo
  agéntico (snapshot history + bump + freno) PERO sin reflejo ni ui_handler —
  la UI no la inventa; hoy via chat. Si llega su reflejo: nueva pasada.
- [ABIERTO] eliminar / archivar / cambiar_estado en UI (sin reflejo).
- [ABIERTO] alta de ingrediente desde el editor (un `ref` sin entrada del
  catálogo hoy exige chat / módulo ingredientes).
- [ABIERTO] instrucciones/descripción/notas del editor (el reflejo las
  persiste — forma de edición aún sin decidir).
- [ABIERTO] flujo de sub-recetas en el editor (referenciar masa/salsa ya
  creadas vs crearlas aquí mismo).

## 7. Fuera del árbol del jefe

- Costeo (escandallo: lee `recetas.listar {incluir_lineas}` y escribe el
  resultado del cálculo — aquí hay `lineas_c`/`coste_unidad` persistidos).
- Consumo al vender (POS/páginas de utilización) y ejecución en cocina.
- Catálogo de ingredientes de compra (módulo ingredientes / precios).

## 8. La cara FUZZY (viva en el chat — no es de este panel)

El blueprint agéntico v2.9.0 sigue VIVO en la página (no se toca): crear desde
intención («pizza cumbia con jamón y champiñón» → el LLM normaliza a lineas[]),
investigar receta, ediciones conversacionales. El reflejo es la mitad
DETERMINISTA: lecturas instantáneas + el GUARDAR verificado + el freno AJV.
La página mixta queda: el chat da forma (fuzzy) y delega en este reflejo
(v2.7 — «crear» = LLM da forma, reflejo valida y persiste verificado).
El panel del jefe (esta cara) opera el reflejo directamente — sin turno LLM,
instantáneo y verificado.