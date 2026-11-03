# PASADA 2 · PUNTO: `config-plaza` — los cuatro números y su dueño (J, corregido)

> Sale del hueco RESTRICCIONES de la r1, y **corrige la v2**. La v2 tituló este grupo "lo que hace
> que esto sea vertical y no proyecto" y puso los umbrales en el PROYECTO. La F0 §7 obliga a
> deshacer esa frase: con tres niveles, "proyecto" es la tienda, y **la tienda no legisla**.

## Prisma de los 5 huecos

### 1 · IDENTIDAD

**La plaza es la que tiene reglas; la vertical solo tiene forma.** Todo el grupo J cambia de mano:

```
la VERTICAL   fija que HAY cuatro umbrales, sus unidades (m · min · min · c€), que la comparación
              es AND, que la ventana es finita y declarada, que el orden es determinista,
              que toda regla tiene vigencia, y que hay una cobertura.
la PLAZA      declara los valores: 800/4/6/0 (o los que sean), la ventana, el orden, la cobertura.
la TIENDA     no tiene umbrales. Tiene UNA palanca: `incentivo-tienda`.
```

Y la razón de que la tienda **no** pueda tener umbrales, que es de negocio y no de gusto:

```
si cada tienda tuviera sus umbrales
   → el rider tendría N juegos de reglas que aprenderse para el mismo trabajo
   → el mercado dejaría de ser un mercado y sería N mercados dentro de un mercado
   → la promesa "te lo ofrecí porque pasabas a 300 m" dejaría de ser cierta entre tiendas
la tienda ya tiene una palanca económica: sube su incentivo y el pedido pasa el umbral de cobra
```

Es decir: **la tienda no necesita umbrales porque ya tiene precio.** La §6 le dio el incentivo y
la §7 le quitó la tentación de legislar.

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: un umbral sin dueño se cambia a escondidas.** Protege la explicabilidad (art. 8 de la
  Directiva: derecho a explicación).
  → **EMPUJÓN**: `config-umbrales` con vigencia + `version-efectiva` + `acta-decisiones` (acta de
  la plaza, no del nacional).
- **FRENO: los umbrales de una plaza no valen para otra.** Protege que abrir Bilbao no herede los
  números de Málaga.
  → **EMPUJÓN**: la config **nunca viaja**. No hay config por defecto del nacional: cada plaza
  nace con sus números, y si no los tiene, **no propone** (`hueco-de-medida`) en vez de heredar.
  Esto es incómodo y es correcto: heredar números es inventar datos.
- **FRENO: un barrio dentro de la misma plaza no se comporta como otro.** Protege la precisión.
  → **EMPUJÓN**: `config-zona` admite **juegos por zona** dentro de la plaza (Q3). Es la única
  granularidad por debajo de la plaza que el esquema deja abierta.
- **FRENO: cambiar un umbral a mitad de un pedido en vuelo.** Protege que la explicación siga
  siendo cierta.
  → **EMPUJÓN**: `version-efectiva` congela la versión **con cada propuesta**, no con cada plaza.

### 3 · CONTRATO

```
la plaza   da: los números y su vigencia; y la obligación de poder explicar cada propuesta con ellos
           recibe: el derecho a cambiarlos sin pedir permiso a nadie de arriba
la tienda  da: nada. recibe: la posibilidad de subir su incentivo y ver su propia medida
el nacional NO participa. No hay `config-umbrales` en el nacional, ni una.
```

### 4 · NO-OBJETIVOS

No hay valores por defecto de la vertical · no hay config heredada entre plazas · no hay umbrales
por tienda · no hay umbrales que dependan de datos del rider (eso sería puntuación,
`guarda-sin-puntuacion`) · no hay "modo aprendizaje" automático de umbrales (sería un optimizador
con otro nombre).

### 5 · PREGUNTAS ABIERTAS

**Q1** (¿de la vertical, de la plaza o del primer mercado? — la §6.3 y la §7 se contradicen) ·
**Q3** (¿por zona dentro de la plaza?) · **Q43** (¿puede una tienda tener umbrales propios?) ·
Q4 (¿rige para el pedido en vuelo?) · Q5 (ventana) · Q7 (orden) · Q51 (¿hay umbrales de arranque
para una plaza nueva?).

## Hojas

`config-umbrales` (CUSTODIO) · `config-ventana` (CUSTODIO) · `config-zona` (CUSTODIO) ·
`version-efectiva` (REFLEJO) · `simulador-de-umbrales` (REFLEJO).

**Las cinco, sin cambios de forma. Solo de nivel: de "proyecto" a PLAZA.**

## La tabla que resuelve vertical / plaza / tienda

| | lo fija la VERTICAL | lo declara la PLAZA | lo declara la TIENDA |
|---|---|---|---|
| umbrales | que hay 4, con esas unidades, en AND | los cuatro números | — (su `incentivo`) |
| ventana | que es finita y declarada | su duración | — |
| candidatos | que el orden es determinista y público | el orden | — |
| cobertura | que hay una y que filtra el índice | sus barrios / polígono | su radio de reparto |
| vigencia | que toda regla la tiene | la fecha | la fecha de su incentivo |
| liquidación | que hay tramo fijo y tramo por pedido | los números | — |
| espera | que se mide y se cobra | las tres N | — |

**Prueba de fuego (la de la v2, ahora con una columna más):** si borras la plaza y dejas la
vertical, quedan 144 piezas y ninguna forma de configurarlas. Si borras la vertical y dejas la
plaza, quedan números sin sitio donde ponerlos. Si borras la tienda, quedan reglas sin mercado.
**Los tres niveles son irreducibles.**
