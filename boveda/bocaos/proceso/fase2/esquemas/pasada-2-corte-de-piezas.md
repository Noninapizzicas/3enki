# PASADA 2 · PUNTO: `corte-de-piezas` — qué es de la plaza y qué del nacional

> **Esta es la pasada que hace verificable la F0 §7.** Sin ella, "separar la plaza del nacional"
> es una intención; con ella, es una tabla que alguien puede auditar pieza a pieza.
>
> Método: se toma el árbol de la v2 (115 hojas) + las nuevas, y a cada una se le pregunta **de
> quién es**. No se duplica ninguna pieza: **se reubica o se amplía**.

## §0 · Las tres preguntas que deciden el nivel de una pieza

Para no decidir por intuición, un criterio cerrado. Se aplica **en orden**; la primera que
responda "sí", gana.

```
1 · ¿necesita el evento, la ruta o la posición del instante?
      sí → PLAZA.  El nacional no los tiene y no puede tenerlos.
2 · ¿escribe dinero, estado de un pedido, o una decisión sobre un rider o una tienda?
      sí → PLAZA.  El nacional no recauda, no sanciona, no decide.
3 · ¿sobrevive el negocio si esta pieza desaparece durante un día?
      sí, la plaza sigue repartiendo → puede ser NACIONAL (registro, marca, software, soporte)
      no, nada funciona          → es PLAZA y el nacional no la toca
```

Y una cuarta, que no es una pregunta sino una prohibición:

```
4 · ¿la pieza necesita saber QUÉ se pidió, POR CUÁNTO o A QUIÉN?
      sí → no puede ser del nacional. Nunca. Ni "solo para estadística".
```

## §1 · El árbol, grupo a grupo, con su dueño

Leyenda: **T** = tienda (su proyecto) · **P** = plaza (el despliegue) · **N** = nacional.

### A · PROPUESTA-ENLACE — 35 hojas · **todas P**

```
hecho-pedido-listo · composicion-de-la-vista · congelacion-de-la-foto · candidatos-elegibles
ruta-base · ruta-con-parada · medida-desvio · medida-espera · retraso-por-parada
agregado-del-retraso · medida-cobra · regla-de-enlace · propuesta-emitida · bloqueo-de-propuesta
ventana-de-propuesta · razones-de-la-decision · frase-derivada · redaccion-de-la-propuesta
aceptacion-libre · hora-de-aceptacion · rechazo-sin-coste · guarda-sin-puntuacion
caducidad-sin-respuesta · contrato-puntual · siguiente-candidato · escalada-de-enlace
guarda-sin-asignacion · guarda-sin-optimizador · reproduccion-de-la-decision
guarda-enlace-por-trayecto · guarda-enlace-no-rompe-promesa · guarda-no-captura-del-ahorro
guarda-propuesta-unica · hueco-de-medida · guarda-enlace-intra-plaza  ← NUEVA (§7)
```

**La prueba de que el corte está bien hecho está en este grupo.** El corazón del producto —34
hojas y la única decisión que el negocio no puede delegar— cae **entero** del lado de la plaza.
Si una sola de estas 35 hubiera caído en el nacional, la federación sería una mentira: habría un
sitio (arriba) que sabe a quién se le propone un pedido. **No lo hay, y no puede haberlo.**

### B · RUTA-VIVA — 6 · **todas P**
`posicion-rider` · `paradas-pendientes` · `promesa-por-parada` · `orden-de-paradas` ·
`capacidad-declarada` · `fin-de-trayecto`

La ruta viva es del rider **en la plaza donde está trabajando ahora**. Si cruza a otra plaza, esa
otra plaza no sabe nada de su trayecto, y ahí está el núcleo de Q52.

### C · PEDIDO — 7 · **mixto: el acto es T, el registro es P**

| pieza | nivel | nota |
|---|---|---|
| `captura-pedido` | **T** | el alta ocurre en el escaparate de la tienda |
| `estado-pedido` | **P** | el registro y su máquina de estados viven en la BD de la plaza |
| `aviso-tienda` | **P** | puente plaza→TPV de la tienda; el evento nace en la plaza |
| `hora-de-listo` | **T** | **la tienda declara**; es su acto y es el disparador |
| `estado-cocina-visible` | **T** | es la proyección de SU cocina hacia SU cliente |
| `aviso-cliente` | **T** | sale por el canal de la tienda |
| `cancelacion` | **P** | las transiciones son del registro; quién paga, abierto |

**El patrón "acto de la tienda / registro en la plaza"** se repite en todo el árbol y conviene
fijarlo: la tienda **actúa** (declara listo, sube incentivo, cierra la carta); la plaza **guarda**
el hecho con hora. Ninguna de las dos puede escribir la del otro.

### D · PLAZA-TIENDA — 8 · **mixto: la marca y la carta son T; el índice es P**

| pieza | nivel | nota |
|---|---|---|
| `marca-tienda` | **T** | quién firma el escaparate |
| `carta-publica` | **T** | conversor catálogo→escaparate, en el proyecto de la tienda |
| `precio-cerrado` | **T** | aritmética antes de pagar |
| `carrito-tienda` | **T** | el buffer de compra; **no hay carrito de plaza ni de federación** |
| `registro-cliente-tienda` | **T** | el cliente es de la tienda, aislado por tienda |
| `radio-de-tienda` | **T** | **NUEVA** · lo que esta tienda declara que reparte |
| `plaza-publica` | **P** | el índice del mercado, ya filtrado por cobertura |
| `neutralidad-orden` | **P** | **se AMPLÍA**: filtrar por cobertura no es ordenar (ver §3) |

### E · TARIFA-TRES-BANDAS — 7 · **P, salvo el incentivo que es T**

`oferta-cliente` **P** (el acto es del cliente, el registro es del pedido) ·
`incentivo-tienda` **T** · `precio-reparto` **P** · `comision-coordinacion` **P** ·
`reparto-del-pago` **P** · `contrato-tramos` **P** ← *cambia de contratante: la tienda contrata
con la plaza* · `subida-de-oferta` **P**

### F · REPARTO-MEDIDO — 7 · **todas P**
`hechos-del-reparto` · `prueba-entrega` · `seguimiento-vivo` · `chat-enmascarado` ·
`instrucciones-acceso` · `incidencia-reparto` · `lectura-de-incidencia`

### G · ADJUDICACIÓN DE FALLOS — 6 · **todas P**
`ventana-espera` · `hecho-verificado` · `regla-pago-fallo` · `cargo-fallo` · `disputa-fallo` ·
`trazabilidad-fallo`

La adjudicación es **local por definición**: usa hechos que solo existen en la plaza. Un fallo
adjudicado por el nacional exigiría ver los pedidos (prohibido) y sería el árbitro del mercado —
justo lo que la F0 §1 renuncia a ser.

### H · LIQUIDACIÓN — 6 · **todas P**, y nace una N
`devengo` · `ciclo-semanal` · `factura-gestion` · `cobro-gestion` · `impago-gestion` ·
`guarda-no-retencion` → **P**
`consolidacion-nacional` → **N** (nueva: suma devengos cerrados, no recauda)

### I · SALA-MERCADO — 8 · **todas P**, y nacen tres N
`alta-tienda` · `alta-rider` · `estado-tienda` · `estado-rider` · `salud-mercado` ·
`tablero-fricciones` · `aviso-sala` · `terminos-parte` → **P**
Nuevas del nacional: `soporte-nacional` · `permiso-de-plaza` · `acceso-delegado-a-plaza`

**El alta de una tienda tiene dos escritores y no es corrupción, son dos registros distintos:**
la plaza escribe el alta operativa (su censo, su estado); la plaza **publica** el hecho y el
nacional escribe su censo (`censo-de-tiendas`). Uno manda, el otro copia. Nunca al revés.

### J · CONFIG — 5 · **todas P** ← *aquí está el cambio de dueño más importante de la pasada*
`config-umbrales` · `config-ventana` · `config-zona` · `version-efectiva` · `simulador-de-umbrales`

La v2 decía "configuración del PROYECTO" (§6.3). Con tres niveles, **el PROYECTO es la tienda, y
la tienda no puede tener umbrales** (sería un mercado dentro del mercado: Q43). Los cuatro
números son de la **plaza**. La vertical solo sabe que hay cuatro.

### K · CLIENTE FINAL — 2 · **T/P**
`reclamacion-por-la-tienda` **T** · `guarda-marca-ajena` **P**, **ampliada**: ahora también
prohíbe la marca del nacional, no solo la de Bocaos-plaza.

### L · RESTAURANTE — 4 · **todas T**
`panel-tienda` · `guarda-propiedad-cliente` · `puntualidad-declarada` · `resumen-para-la-tienda`

### M · REPARTIDOR — 5 · **todas P**, con instanciación por plaza
`cartera-rider` (una **por plaza**) · `zona-rider` · `guarda-sin-exclusividad` · `canal-rider`
(uno por plaza, y el rider los suma en su móvil) · `vista-de-propuesta` (**ampliada**: dice de
qué plaza es)

### N · BOCAOS (el suelo) — 2 · **P**
`politica-densidad` · `simulador-tramos` — usan los números de **una** plaza.

### O · ROL JEFE — 4 P + 1 N
`cuadro-del-mercado` **P** · `acta-decisiones` **P** · `cola-revision-humana` **P** ·
`dictamen-revision` **P** · `cuadro-de-la-federacion` **N** (nueva)

### P · ROL TRABAJADOR — 4 · **todas P**
`cola-sala` · `vista-parte` · `accion-sancion` · `checklist-alta`

### Q · ROL CLIENTE — 1 · **P**
`estado-cuenta-parte`

### S · FRONTERA — 2 · **P** (nuevas)
`frontera-de-plaza` · `filtro-por-cobertura`

### R · FEDERACIÓN — 25 · **todas N**
`registro-de-plazas` · `alta-de-plaza` · `estado-de-plaza` · `silencio-de-plaza` ·
`censo-de-tiendas` · `version-de-plaza` · `despliegue-de-plaza` · `verificacion-de-despliegue` ·
`compatibilidad-de-version` · `indice-nacional` · `buscador-nacional` · `resultado-con-su-plaza` ·
`enrutado-a-plaza` · `consolidacion-nacional` · `cuadro-de-la-federacion` · `marca-nacional` ·
`licencia-de-marca` · `soporte-nacional` · `permiso-de-plaza` · `traza-de-acceso` ·
`acceso-delegado-a-plaza` · `acta-de-federacion` · `guarda-sin-catalogo-nacional` ·
`guarda-no-recauda` · `guarda-frontera-de-plaza`

---

## §2 · Las 6 piezas que CAMBIAN de dueño respecto a la v2

| pieza | dónde estaba | dónde está | por qué |
|---|---|---|---|
| `config-umbrales` (+`config-ventana`, `config-zona`) | "configuración del PROYECTO" | **PLAZA** | con tres niveles, "proyecto" = tienda, y la tienda no legisla |
| `ciclo-semanal` · `devengo` · `cobro-gestion` · `impago-gestion` | Bocaos | **PLAZA** | se liquida por plaza; el nacional consolida (r.4) |
| `contrato-tramos` | Bocaos | **PLAZA** | el contratante de la tienda es la plaza (Q42) |
| `salud-mercado` · `tablero-fricciones` | Bocaos | **PLAZA** | miden pedidos, y los pedidos son de la plaza |
| `alta-tienda` · `alta-rider` · `estado-tienda` · `estado-rider` | Bocaos | **PLAZA** | los censos son locales; el nacional solo copia el de tiendas |
| `cuadro-del-mercado` | el jefe | **PLAZA** (y nace `cuadro-de-la-federacion` para el jefe del nacional) | son dos jefes, no uno con dos pantallas |

## §3 · Las 4 piezas que se AMPLÍAN (no se duplican)

| pieza | qué se le añade | por qué no se duplica |
|---|---|---|
| `vista-de-propuesta` | **de qué plaza es** la propuesta | el rider tiene un móvil y N plazas: los cuatro números siguen siendo cuatro |
| `canal-rider` | una instancia por plaza | el puerto es el mismo; lo que cambia es por dónde entra |
| `guarda-marca-ajena` | también la marca **del nacional** | es la misma prohibición, un nivel más arriba |
| `neutralidad-orden` | **filtrar por cobertura no es ordenar** | la exclusión es por hecho (¿reparte aquí?), el orden sería por preferencia |

Esa última línea merece un párrafo, porque es la objeción obvia al §7:

```
FILTRAR   "esta tienda no reparte en tu dirección"   → hecho verificable, no hay preferencia
ORDENAR   "esta tienda va primero porque paga"       → preferencia, y es Glovo
```

El filtro por cobertura **quita** tiendas por una razón que el cliente puede comprobar (pide a esa
dirección y no llega). El ranking **pone** tiendas por una razón que el cliente no ve. La
`neutralidad-orden` cubre las dos: no se pone, solo se quita lo que no puede llegar.

## §4 · El recuento (esta es la tabla que se audita)

| Nivel | Hojas | Qué contiene |
|---|---|---|
| **NACIONAL** | **25** | registro, censo, versiones, buscador, marca, soporte, consolidación, 4 guardas |
| **PLAZA** | **103** | **toda la cadena de propuesta**, ruta viva, pedido (registro), tarifa, reparto, fallos, liquidación, sala, config, riders, jefe y trabajador de la plaza |
| **TIENDA** | **16** | marca, carta, precio, carrito, registro de cliente, radio, captura, hora de listo, cocina visible, aviso, incentivo, panel, puntualidad, resumen, reclamación, propiedad del cliente |
| **total** | **144** | + 3 **[ABIERTA]** |

```
NACIONAL   25  =  17 %   y ninguna de ellas decide nada
PLAZA     103  =  72 %   incluidas las 35 del eslabón limitante
TIENDA     16  =  11 %   todo lo que el cliente ve y toca
```

**La proporción es el argumento.** Un esquema en el que el 72 % de las piezas vive en el
despliegue y el 17 % arriba no puede degenerar en una empresa central sin reescribir la mitad del
árbol — y eso es exactamente lo que la §7 quiere: **que centralizarse cueste caro**.

## §5 · Las cuatro auditorías (cómo se comprueba que el corte es real)

No basta con la tabla: cada una de estas se puede escribir como un test.

```
1 · el nacional no tiene pedidos
    ¿existe en el almacén del nacional alguna tabla o índice con pedido, línea, importe,
    dirección de entrega o posición?    → debe estar vacío. `guarda-sin-catalogo-nacional`

2 · el nacional no recauda
    ¿algún flujo del nacional mueve dinero de una parte a otra?
    Solo puede mover el canon que la plaza le pague (si Q41 lo dice).  → `guarda-no-recauda`

3 · ninguna fila cruza de plaza
    ¿toda fila de pedido, propuesta, ruta o cargo lleva `plaza_id` y coincide con el
    despliegue que la escribió?        → `guarda-frontera-de-plaza`

4 · el nacional se puede apagar
    con el despliegue del nacional caído, ¿una plaza sigue aceptando pedidos, proponiendo
    y cobrando?                        → sí, o la federación es una dependencia disfrazada
```

La cuarta es la más dura y la más útil: **es la que distingue una federación de un monolito con
buena prensa.** Si una plaza necesita al nacional para proponer, el nacional tiene el poder sin
tener los datos, que es la peor combinación posible.

## §6 · Lo que esta pasada deja abierto

- **Q55** es la que muerde: si una plaza es "un despliegue con su BD" y una tienda es "un
  proyecto", ¿son N proyectos dentro de un despliegue, o un proyecto con N tiendas dentro? La
  tabla de arriba funciona con las dos respuestas, pero la FASE 3 no: necesita una.
- El **acta de federación** asume que una plaza firma algo. Si las plazas son de la misma persona
  jurídica que el nacional, no hay acta: hay un manual de procedimiento. Eso cambia Q41 y Q50.
- La `traza-de-acceso` se escribe en el nacional según esta tabla, pero **el dato es de la
  plaza**. Si la plaza tiene derecho a leerla (debería), entonces se escribe en la plaza y el
  nacional la recibe. Es un traslado de una pieza, no un cambio de forma.
