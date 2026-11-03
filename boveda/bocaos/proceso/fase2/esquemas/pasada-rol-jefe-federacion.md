# PASADA · ROL `jefe` — dos jefes, no uno con dos pantallas

> El prisma por ROL es obligatorio y en la v2 ya existía `pasada-rol-jefe.md`. La §7 lo parte: hay
> un jefe de la plaza (decide el futuro de **un** mercado) y un jefe de la federación (decide
> **qué mercados existen**). Son dos roles distintos aunque los ejerza la misma persona — y en una
> federación de una sola plaza, los ejerce la misma persona el mismo martes.

## Los 5 huecos, con doble alcance (interfaz + lógica)

### 1 · IDENTIDAD

```
JEFE DE PLAZA         "¿cómo va mi mercado, y qué cambio para que vaya mejor?"
                      su unidad de decisión: un pedido, una tienda, un rider, un umbral
JEFE DE FEDERACIÓN    "¿qué plazas tengo, cuáles funcionan, cuál abro y cuál cierro?"
                      su unidad de decisión: una plaza. Nunca un pedido.
```

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO (jefe de plaza): no tiene riders propios ni puede captar clientes.** Su palanca es la
  regla y la medida, no el músculo.
  → **EMPUJÓN (interfaz)**: `cuadro-del-mercado` (aceptación a la primera, propuestas por
  aceptación, esperas, fallos, devengado) + `simulador-de-umbrales` (qué pasaría si cambio los
  números) + `acta-decisiones` (por qué los cambié).
- **FRENO (jefe de federación): no puede ver un pedido.** No puede diagnosticar una plaza mirando
  dentro; solo mirando su agregado.
  → **EMPUJÓN (interfaz)**: `cuadro-de-la-federacion` (plazas vivas, versiones, aceptación por
  plaza, devengo consolidado) + `estado-de-plaza`. **Y aquí hay una pieza de lógica que no es
  obvia**: para comparar dos plazas hace falta que "aceptación a la primera" signifique lo mismo en
  las dos. Eso son **definiciones comunes, versionadas**. El esquema **no crea una pieza nueva**:
  `cuadro-de-la-federacion` **lleva sus definiciones dentro**, y cada cifra dice con qué definición
  se calculó. Si no, el cuadro compara peras con manzanas y el jefe decide con basura.
- **FRENO: la información asimétrica es poder.** Si el nacional ve el agregado de todas las plazas
  y cada plaza solo ve el suyo, el nacional sabe quién va mal antes que el que va mal.
  → **EMPUJÓN**: decidir si el cuadro se publica hacia abajo (Q56). Publicarlo convierte al
  nacional en un espejo; no publicarlo lo convierte en un supervisor. **Ninguna de las dos está
  declarada.**

### 3 · CONTRATO — qué ve y qué actúa cada uno

| | JEFE DE PLAZA | JEFE DE FEDERACIÓN |
|---|---|---|
| **ve** | pedidos, propuestas, riders, tiendas, importes, fallos de SU plaza | plazas, versiones, censos, agregados, devengo consolidado |
| **actúa** | cambia umbrales y ventana (con acta) · abre y cierra tiendas · sanciona · fija cobertura | abre y cierra plazas · despliega versiones · retira marca · concede acceso |
| **NO ve** | los pedidos de otra plaza | **ningún pedido, de ninguna plaza** |
| **NO actúa** | sobre otra plaza, ni sobre la federación | sobre un pedido, un rider, una tienda o un umbral |

**Esa última fila es la que hay que poder testear.** Un jefe de federación con un botón para
cambiar un umbral de Málaga ha convertido la federación en una sede. Un jefe de plaza con un botón
para ver Bilbao ha convertido la federación en un espía.

### 4 · NO-OBJETIVOS

El jefe de plaza no decide qué plazas existen · no firma la marca · no negocia el software · el
jefe de federación no opera · no sanciona · no re-juzga un fallo · no cambia umbrales ajenos · **no
tiene una pantalla con pedidos "en solo lectura"** (esa pantalla es el principio del final: primero
mirar, después opinar, después mandar).

### 5 · PREGUNTAS ABIERTAS

**Q50** (quién abre una plaza: ¿el jefe de federación, un socio local, un franquiciado?) ⚠ ·
**Q41** ⚠ · Q53 (la consolidación, ¿para quién?) · Q56 (¿se publica el cuadro hacia abajo?) ·
Q26 (quién firma un dictamen) · Q47 (qué pasa con las tiendas de una plaza cerrada).

## Doble alcance, resumido

```
INTERFAZ que emerge      `cuadro-del-mercado` · `cuadro-de-la-federacion` · `simulador-de-umbrales`
                         `simulador-tramos` · `acta-decisiones` · `estado-de-plaza` · `salud-mercado`
LÓGICA que emerge        agregación por plaza con definiciones versionadas (dentro del cuadro)
                         comparación entre plazas sin acceso a pedidos
                         `acta-decisiones` con vigencia (lo que permite decir "con la regla de marzo")
                         `politica-densidad` (¿cuántos riders hacen falta? el jefe decide con un número,
                         no con una impresión)
```

## Lo que este rol destapa y no estaba en la v2

La v2 tenía un solo jefe y por eso no veía el problema: **con dos jefes, la frontera entre ellos es
una decisión de producto.** Y la frontera más peligrosa no es la de arriba (el nacional mandando),
sino la de **mirar**: un cuadro con demasiado detalle es una sede disfrazada de informe. La
pregunta operativa que hay que hacerle al dueño no es "¿qué quieres ver?" sino **"¿qué NO quieres
que el de arriba pueda ver?"** — porque esa lista es la constitución de la federación.
