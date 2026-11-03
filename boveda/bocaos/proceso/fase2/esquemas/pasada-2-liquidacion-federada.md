# PASADA 2 · PUNTO: `liquidacion-federada` — el dinero, por plaza (H, partido en dos)

> Sale del hueco CONTRATO de la r1, y **parte en dos la pieza que la §7 parte en dos frases**:
> "la liquidación es por plaza" (r.4) y "el nacional comparte la liquidación" (r.5). Las dos son
> verdad y no son lo mismo.

## Prisma de los 5 huecos

### 1 · IDENTIDAD — qué se liquida, exactamente

Lo primero es ver lo pequeño que es esto. En un pedido hay **tres** movimientos de dinero y solo
uno pasa por Bocaos:

```
1 · el cliente paga la COMIDA a la tienda        directo. Bocaos no lo toca.   (F0 §1)
2 · el cliente paga el REPARTO al rider          directo. Bocaos no lo toca.   (F0 §1)
3 · la tienda y el rider pagan la GESTIÓN        semanal, a la plaza.           ← esto sí
```

Así que **la liquidación de una plaza tiene una sola deuda**: la cuota. Eso la hace barata y, más
importante, hace que `guarda-no-retencion` sea casi trivial de cumplir: no hay dinero de terceros
que retener porque nunca entra.

Y encima de eso, la §7 pone el nivel:

```
la PLAZA     devenga · cierra la semana · factura · cobra · persigue el impago
el NACIONAL  suma los devengos cerrados de todas las plazas y los presenta
             NO cobra, NO persigue, NO compensa, NO paga a nadie
```

### 2 · RESTRICCIONES (freno → empujón)

- **FRENO: el nacional no recauda** (r.4). Protege la renuncia a ser banco.
  → **EMPUJÓN**: `consolidacion-nacional` (suma) + `guarda-no-recauda` (test) + `acta-de-federacion`
  (dice de quién es cada euro).
- **FRENO: la liquidación es por plaza.** Protege que un impago en Málaga no suspenda Bilbao.
  → **EMPUJÓN**: `ciclo-semanal` **por plaza**, con su propio calendario y su propia mora. El
  nacional no tiene un ciclo: tiene una suma de ciclos ajenos.
- **FRENO: el nacional comparte "la liquidación" y no tiene ingreso declarado.** Protege nada:
  **es un hueco, no un freno.**
  → **EMPUJÓN**: `canon-de-plaza` **[ABIERTA]** — la pieza existe solo si Q41 dice que existe.
- **FRENO: el cargo por fallo necesita ser efectivo sin que Bocaos toque dinero.** Protege la
  renuncia a retener; hoy deja la adjudicación decorativa (Q29, herencia de la v2).
  → **EMPUJÓN**: compensación **contra la cuota** semanal — la única forma de hacer efectivo un
  cargo sin mover dinero de un tercero. Es un empujón real: el cargo se descuenta de lo que la
  parte ya debe, no se cobra.

### 3 · CONTRATO

```
tienda → plaza     tramo 1 (fijo mensual) + tramo 3 (céntimos por pedido aceptado)
rider  → plaza     tramo 3 (céntimos por pedido aceptado)
plaza  → nacional  [Q41 — canon, porcentaje o nada]
cliente→ tienda    la comida        (directo, fuera del sistema)
cliente→ rider     el reparto       (directo, fuera del sistema)
```

**Y la pregunta que ninguna tabla responde: ¿quién pone la marca en la factura?** Si la tienda
recibe una factura de "Bocaos Málaga, S.L." y otra de "Bocaos Nacional, S.L." por el mismo
servicio, el contrato está roto en dos. Si solo factura la plaza, el nacional es invisible
—correcto— pero entonces **el nacional no tiene con qué justificar su canon** (Q42).

### 4 · NO-OBJETIVOS

No retiene el ticket · no retiene el reparto · no compensa entre partes sin un cargo con evidencia
(`trazabilidad-fallo`) · no hace *netting* entre plazas (una plaza con saldo a favor no paga la
deuda de otra) · no presta dinero · no financia el reparto (si el nacional pagara las subidas de
oferta, entraría en otra categoría de negocio: Q17).

### 5 · PREGUNTAS ABIERTAS

**Q41** (con qué se paga el nacional) ⚠ · **Q42** (quién factura y con qué marca) ⚠ ·
Q53 (para qué sirve la consolidación si no recauda) · Q18 (¿se devenga en un pedido fallido?) ·
Q19 (¿el cliente ve el incentivo?) · Q29 (cómo se hace efectivo un cargo) · **Q50** (quién abre
una plaza, que decide si el canon es interno o comercial) ⚠.

## Los tres modelos posibles (y qué pieza crea cada uno)

El esquema no elige. Pero sí puede decir qué se rompe en cada caso — y eso es lo que convierte la
pregunta en una decisión informada.

```
A · CANON FIJO POR PLAZA
    la plaza paga X al mes por existir en la federación
    + ingreso predecible para el nacional, independiente del volumen
    − una plaza que arranca paga antes de tener pedidos (y el arranque en frío ya es duro)
    pieza: `canon-de-plaza` (CUSTODIO) + un `devengo` de la plaza hacia el nacional
    naturaleza: FRANQUICIA

B · PORCENTAJE DEL DEVENGADO DE CADA PLAZA
    el nacional se lleva un % de la cuota que la plaza cobra
    + el nacional gana cuando las plazas ganan (alineado)
    − el nacional pasa a tener interés en que haya más pedidos aceptados… que es sano, pero
      hay que vigilar que no se traduzca en presión sobre los umbrales (presión = control)
    pieza: `canon-de-plaza` como coeficiente en el `devengo` de la plaza
    naturaleza: SOCIEDAD / COOPERATIVA

C · NADA (misma persona jurídica)
    el nacional es una función interna, no una empresa
    + cero complejidad, cero facturación cruzada, cero riesgo de "recaudar"
    − entonces el "nacional" no es un nivel de negocio: es un registro lógico, y Q42 desaparece
    consecuencia: `consolidacion-nacional` sigue teniendo sentido (informe), `canon-de-plaza` no
    naturaleza: UN DUEÑO CON VARIOS DESPLIEGUES
```

**Ninguno de los tres está declarado**, y la §7 no lo dice. Es el hueco más caro del esquema y por
eso encabeza el guion.

## Hojas

`devengo` (REFLEJO) · `ciclo-semanal` (CUSTODIO) · `factura-gestion` (CONVERSOR) ·
`cobro-gestion` (PUENTE) · `impago-gestion` (REFLEJO) · `guarda-no-retencion` (REFLEJO) → **PLAZA**
`consolidacion-nacional` (REFLEJO) → **NACIONAL**
`canon-de-plaza` **[ABIERTA]** → **NACIONAL** (solo si Q41 lo enciende)

## El detalle que la §7 sí resuelve, y es bueno

Con la liquidación por plaza, **el impago se vuelve local y proporcional**: si una plaza tiene
mala cobranza, suspende a sus morosos (o se suspende ella misma como mercado) sin que el resto de
la federación lo note. Y al revés: una plaza ejemplar no puede ser rehén de una plaza morosa.

Lo que **no** resuelve, y hay que decirlo: si el nacional vive de las plazas y una plaza no paga
su canon, el nacional no puede hacer nada salvo sacarla del registro (`estado-de-plaza`). **Un
registro sin músculo económico.** Eso es coherente con la §7 —y es exactamente el tipo de
consecuencia que hay que aceptar a sabiendas, no descubrir después.
