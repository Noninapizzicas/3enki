# PASADA 2 · PUNTO: `config-proyecto`

> **Este punto nace del matiz.** La F0 §6.3 lo dice en una línea: *"los umbrales son del
> PROYECTO → otro barrio, otros umbrales; la vertical no se toca"*. Esa frase obliga a un
> punto entero, porque es la frontera entre lo que se construye una vez y lo que se declara
> cada vez.

## Prisma de los 5 huecos

### 1 · IDENTIDAD
La **política del mercado concreto**: cuatro números, una ventana, una zona y un orden de
candidatos. La vertical conoce la **forma** de esa política (que hay cuatro umbrales con sus
unidades, que la ventana es finita, que el orden es determinista); el proyecto pone **todos
los valores**.

```
lo que la VERTICAL fija        lo que el PROYECTO declara
────────────────────────       ────────────────────────────
hay 4 umbrales                 desvío  = ____ m
sus unidades (m, min, min, c€) espera  = ____ min
la comparación es AND          retraso = ____ min
la ventana es finita           cobra   > ____ c€
el orden es determinista       orden   = ____ (cerca · menos espera · menos retraso)
hay zonas                      zona    = ____ (barrios, radio)
hay vigencia                   desde   = ____
```

### 2 · RESTRICCIONES (freno → empujón)
- **FRENO**: cambiar un umbral a mitad de la cena cambia el criterio con pedidos en vuelo.
  → **EMPUJÓN**: `config-umbrales` con **vigencia** y `version-efectiva`, que devuelve la
  versión que estaba viva en un instante. Cada propuesta guarda la suya: se explica con la
  regla que la juzgó. **Q4** decide si el cambio rige para lo que ya está en vuelo.
- **FRENO**: nadie sabe qué pasa si se endurece el desvío.
  → **EMPUJÓN**: `simulador-de-umbrales` — recalcula con los números del proyecto, no con los
  de un ejemplo.
- **FRENO**: la tentación de meter aquí "el barrio bueno" y convertirlo en vertical.
  → **EMPUJÓN**: ninguna pieza de este grupo nombra un lugar, un precio ni un rider. Es
  config. Si un valor se repite en todos los proyectos, deja de ser config — y entonces sí hay
  que subirlo a la vertical, con acta (`acta-decisiones`).

### 3 · CONTRATO
El dueño declara la política; el sistema la aplica igual para todos y la cita cuando explica.

### 4 · NO-OBJETIVOS
No es un panel de tuning para cambiar el criterio a conveniencia de un rider concreto · no
permite reglas por rider · no permite reglas por tienda (sería ordenar el mercado).

### 5 · PREGUNTAS ABIERTAS
Q1 (¿son de la vertical o del proyecto?) · Q3 (¿un juego por zona?) · Q4 (vigencia) · Q5
(ventana) · Q6 (serie o paralelo) · Q7 (el orden)

## Hojas
`config-umbrales` (CUSTODIO) · `config-ventana` (CUSTODIO) · `config-zona` (CUSTODIO) ·
`version-efectiva` (REFLEJO) · `simulador-de-umbrales` (REFLEJO)
