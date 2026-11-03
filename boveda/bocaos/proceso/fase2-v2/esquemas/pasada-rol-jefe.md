# PASADA · ROL `jefe` — el dueño del mercado

> El rol **interno**: declara lo que no se mide, responde de la regla y firma lo que la sala no
> puede firmar. Doble alcance: **qué ve/actúa** (interfaz) y **qué lógica exige** (dominio).

## 1 · IDENTIDAD — ¿qué es el negocio para este rol?
**Una política que él escribe y de la que responde.** No opera el día: escribe los cuatro
números, la ventana, la zona, y luego mira si el mercado respira.

Con el matiz, su identidad cambia de tercio: antes el jefe "gestionaba riders"; ahora **escribe
un criterio** que se aplica solo, miles de veces, sin que nadie lo revise. Su responsabilidad
crece: si el criterio está mal, se equivoca a escala y en silencio.

## 2 · RESTRICCIONES (freno → empujón)

- **FRENO**: no puede ver el mercado entero en la cabeza. Cuatro umbrales × N zonas × M franjas.
  → **EMPUJÓN**: `cuadro-del-mercado` (O01) y `simulador-de-umbrales` (J05).

- **FRENO**: cambiar un umbral a las 21:30 de un sábado cambia el criterio con pedidos en vuelo,
  y nadie sabrá después con qué regla se juzgó cada propuesta.
  → **EMPUJÓN**: vigencia en `config-umbrales` (J01) + `version-efectiva` (J04) + `acta-decisiones`
  (O02). La regla que juzgó un caso queda escrita.

- **FRENO**: la revisión humana puede degenerar en un sello de goma.
  → **EMPUJÓN**: `cola-revision-humana` (O03) con **dueño y plazo**, y `dictamen-revision` (O04)
  con firmante. Si el dictamen pudiera rehacer la propuesta, el humano sería un planificador —
  y no hay planificador: su efecto es un hecho (compensar, corregir el histórico, cambiar la
  regla **para adelante**).

- **FRENO**: es el único que puede decidir "cerrar una zona" y eso mata el negocio de alguien.
  → **EMPUJÓN**: `politica-densidad` (N01) le da el número, no la decisión; la decisión va al
  acta.

## 3 · CONTRATO — qué espera VER/ACTUAR
**Ver** (interfaz del jefe):
```
aceptación a la primera            propuestas aceptadas / propuestas emitidas
coste del criterio                propuestas por aceptación, por zona y por franja
pedidos sin propuesta nunca       ← el número que más duele: ventas que no existieron
espera media por tienda           y su tendencia, no su valor
retraso que el enlace causó       a los pedidos que ya iban
devengado vs cobrado              y la mora
los 8 pares de la F0              medidos, no descritos
```
**Actuar**: cambiar los cuatro números (con acta) · abrir o cerrar una zona · firmar un
dictamen de revisión · aprobar un tramo.

**La lógica que exige construir** (esto es lo que el rol añade al árbol): un **cuadro de
agregación** que cruce pedidos, propuestas, hechos, esperas y devengos — porque ninguna de esas
piezas sabe contar el mercado sola. `cuadro-del-mercado`, `simulador-de-umbrales` y
`acta-decisiones` **solo existen desde este rol**.

## 4 · NO-OBJETIVOS — lo que NO es de su alcance
- No opera el día (eso es la sala) · no propone a un rider concreto (eso es el reflejo) · no
  cambia un umbral para favorecer a una tienda (sería ordenar el mercado) · no re-juzga un caso
  cerrado con la regla de hoy.

## 5 · PREGUNTAS ABIERTAS
Q1/Q3/Q4 (los números y su vigencia) · Q25 (¿revisión humana desde el día uno?) · Q26 (quién
firma) · Q32 (consecuencia por cocina lenta) · Q22 (mercado mínimo) · Q40 (manos de la sala)

## Piezas que SOLO emergen desde este rol
`cuadro-del-mercado` (REFLEJO) · `acta-decisiones` (CUSTODIO) · `cola-revision-humana` (CUSTODIO) ·
`dictamen-revision` (CUSTODIO)
