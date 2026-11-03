# PASADA 2 · PUNTO: `plaza-despliegue` — la plaza como unidad

> Sale del hueco CONTRATO de la r1 (§7: "una plaza = un despliegue"). Es el punto que la v2 no
> tenía, porque la v2 trataba "el mercado" como una cosa sola.

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es una plaza?

**Un mercado con su propia base de datos.** No es una región, ni una zona comercial, ni una
sucursal: es la unidad donde **todo ocurre**. Su definición operativa, en cuatro posesivos:

```
sus tiendas      cada una, un proyecto
sus riders       alta por plaza; su histórico no viaja
sus reglas       los cuatro umbrales, la ventana, el orden de candidatos
su frontera      qué direcciones son suyas y qué tiendas reparten en ellas
```

Y una definición negativa que ordena el árbol entero:

> **Todo lo que decide, ocurre en la plaza. Todo lo que registra, ocurre en el nacional.**

La plaza es, por tanto, la **dueña de la totalidad del grupo A** (la cadena de propuesta, 34
hojas) y de casi todo B–Q. Eso no es un detalle de organización: es la razón por la que el
nacional no puede ordenar el mercado.

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: el cliente solo ve las tiendas que reparten en su zona** (r.1).
  Protege que el escaparate no prometa lo que no puede entregar; limita el catálogo visible.
  → **EMPUJÓN**: `radio-de-tienda` (lo que cada tienda declara que reparte) + `config-zona`
  (lo que la plaza declara que cubre) + `filtro-por-cobertura` (la intersección, aplicada al
  índice). **No es un ranking: es una exclusión por hecho**, y por eso no viola
  `neutralidad-orden` (ver `pasada-2-corte-de-piezas.md` §D).
- **FRENO: la plaza no puede servir lo que no cubre.** Protege la promesa de entrega.
  → **EMPUJÓN**: `frontera-de-plaza` (la dirección de entrega decide a qué plaza pertenece el
  pedido) — y con ella la pregunta de la frontera compartida (Q52).
- **FRENO: un fallo de la plaza no puede tumbar el país.** Protege la continuidad.
  → **EMPUJÓN**: la plaza opera **sin pedirle nada al nacional**: ni configuración, ni catálogo,
  ni permiso. El nacional es un registro, no una dependencia. Ese es el test de que la federación
  está bien construida: **se puede apagar el nacional y las plazas siguen repartiendo**.
- **FRENO: los umbrales son de la plaza y cambian.** Protege que otro barrio no herede reglas
  ajenas.
  → **EMPUJÓN**: `config-umbrales` por plaza, con vigencia y con `version-efectiva`.
- **FRENO: una plaza nueva no tiene histórico.** Protege la ley de cero supuestos (no se inventan
  datos). Bloquea el arranque.
  → **EMPUJÓN**: `hueco-de-medida` a escala de plaza + la política de arranque, que **no está
  declarada** (Q51). Este es el cuello del crecimiento (ver `pasada-1-bocaos.md`).

### 3 · CONTRATO

```
con sus tiendas    da: suelo, riders, propuesta, liquidación de la zona, su medida
                   recibe: tramo 1 + tramo 3 (y el pedido, que es lo que la hace existir)
con sus riders     da: propuestas medidas, el importe íntegro, su cartera
                   recibe: céntimos por pedido aceptado
con su cliente     da: las tiendas que reparten en su dirección, precio cerrado, hora, prueba
                   recibe: nada. Ni cuenta, ni app, ni marca.
con el nacional    da: su censo, su versión, su devengo cerrado, su `plaza.viva`
                   recibe: marca, software, soporte, registro
con otra plaza     NADA. Ni datos, ni pedidos, ni riders, ni umbrales. Si dos plazas se hablan,
                   es a través del nacional y por un hecho declarado.
```

**Esa última línea es la que hace que la federación sea modular de verdad**: las plazas no se
conocen entre sí. Una plaza de Málaga y otra de Bilbao no comparten una fila.

### 4 · NO-OBJETIVOS

No es una región comercial (no hay "zona sur") · no ordena sus tiendas por conveniencia · no
comparte clientes entre tiendas · no presta sus riders a otra plaza · no ejecuta reglas del
nacional (solo puede aceptar una actualización de software) · no guarda el histórico de un rider
que se va a otra plaza · **no puede crecer sin medir** (el arranque en frío es un límite real,
no una excusa).

### 5 · PREGUNTAS ABIERTAS

Q3 (umbrales por zona dentro de la plaza) · Q43 (¿puede una tienda tener umbrales propios?) ·
Q47 (qué pasa cuando la plaza cae) · Q51 (cómo arranca una plaza) · Q52 (frontera compartida) ·
Q55 (la forma del despliegue: ¿un proyecto con N tiendas, o N proyectos?).

## Hojas

**Nuevas de este punto (4):**

- `radio-de-tienda` — **CUSTODIO** · lo que cada tienda declara que reparte (su zona, no la de la plaza)
- `filtro-por-cobertura` — **REFLEJO** · el índice público muestra solo las tiendas que reparten en la dirección del cliente
- `frontera-de-plaza` — **REFLEJO** · de qué plaza es una dirección de entrega
- `guarda-enlace-intra-plaza` — **REFLEJO** · ninguna propuesta enlaza un pedido con un rider de otra plaza

**Heredadas de la v2 que este punto reubica (no se duplican):**

`config-umbrales` · `config-ventana` · `config-zona` (→ la cobertura de la plaza) ·
`alta-tienda` · `alta-rider` · `estado-tienda` · `estado-rider` · `salud-mercado` ·
`aviso-sala` · `terminos-parte` · `cartera-rider` · `zona-rider` · y las 34 de la cadena de
propuesta. **Todas pasan a ser de la plaza.** El listado
completo, pieza a pieza, está en `pasada-2-corte-de-piezas.md`.

## El hallazgo de este punto: el cliente es el único que cruza

```
la tienda    no cruza. Vive en una plaza, y su escaparate está en ella.
el rider     cruza, pero se da de alta otra vez y empieza de cero (regla 2).
el nacional  no cruza: no tiene nada que cruzar.
el CLIENTE   cruza sin darse cuenta y sin cuenta: su dirección puede caer en la cobertura de
             dos plazas, y entonces ve tiendas de las dos, y cada una le lleva a la suya.
```

Y eso no rompe nada porque **el cliente no tiene sesión**: no hay carrito global que se parta en
dos, no hay cuenta que se duplique, no hay historial que se mezcle. El carrito es de una tienda
(`carrito-tienda`), y la tienda está en una plaza. Es la renuncia de la F0 §1 (no hay app de
cliente) pagando un dividendo inesperado: **la federación es invisible para el único actor que la
cruza.**

Si algún día hubiera app de cliente, ese actor tendría una sesión que cruza despliegues, y con
ella un carrito multi-plaza, un historial multi-plaza y un problema de datos que hoy no existe.
**Es otro argumento, y es el más técnico, contra la app de cliente.**

## Lo que queda abierto aquí

- Si la cobertura de dos plazas se solapa, ¿quién sirve? ¿La más cercana? ¿La que tiene la tienda?
  `frontera-de-plaza` **necesita una regla de desempate** y no está declarada (Q52).
- ¿La cobertura es un polígono, un radio o una lista de códigos postales? Cambia el coste de
  mantenerla y la precisión del filtro. **Es configuración de la plaza, no de la vertical**, pero
  la vertical tiene que decir **que hay una**.
- ¿El rider que trabaja en dos plazas ve dos propuestas en el mismo móvil? Sí. Y entonces
  `vista-de-propuesta` tiene que decir **de qué plaza es** — se amplía la pieza (no se duplica):
  los mismos cuatro números, en el mismo orden, **con su plaza delante**.
