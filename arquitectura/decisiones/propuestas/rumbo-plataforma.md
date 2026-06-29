# Rumbo de plataforma — pizzepos es el vertical 1, no el destino

> Nota de dirección (2026-06-29). El destino lo tiene el humano; este doc lo
> REGISTRA para que gobierne cómo se juzga cada candidato (lente/subagente/pack)
> de aquí en adelante. Corrige un sesgo: evaluar fuentes con la lente de
> *pizzepos-hoy* en vez de la **plataforma**.

## El norte (lo que el humano sabe y yo no inferí)

```
HOY      pizzepos  = el PRIMER vertical (POS de pizzería/restaurante)
DESPUÉS  comercio local = "lo mismo que pizzepos, para comercio local"  (mismo producto, otro vertical)
```

pizzepos no es el producto: es la **primera instancia** de un producto que se
replica por verticales. Cuando pizzepos esté terminado, el siguiente cuerpo es
comercio local — y muy probablemente más detrás.

## La consecuencia arquitectónica (por qué lo construido ya sirve)

El cuenco + packs + grafo + homeostasis **ya es la plataforma**, no una pieza de
pizzepos. Un vertical nuevo no es un fork: es **soltar packs + páginas**.

```
comercio local  =  el MISMO cuenco/nervio/homeostasis/grafo
                +  packs nuevos (su oficio: negocio local, captación, fidelización, legal de comercio…)
                +  páginas nuevas que beben esos packs
                +  CERO reescritura del núcleo
```

Por esto encender el grafo temprano (cúpula Obsidian, §10) fue lo correcto: el
aprendizaje por co-uso de pizzepos **siembra** la vecindad que el 2º vertical
heredará. La plataforma compone entre verticales, no solo dentro de uno.

## La regla de juicio (lo que corrige mi error)

```
ANTES (sesgo)  ¿esta lente sirve a una PIZZERÍA?          → descartaba "cuerpo de software/negocio genérico"
AHORA (norte)  ¿esta lente sirve a la PLATAFORMA?          → pizzepos HOY + comercio local MAÑANA
```

Aplicado a `VoltAgent/08-business-product`: lo que llamé "cuerpo equivocado para
una pizzería" (product-manager, business-analyst, customer-success, growth-loops,
**assumption-mapping**, legal de negocio) es **cuerpo PROBABLE de comercio local**.
No entra hoy (pizzepos no tiene esas páginas), pero **se cosecha** como candidato
del vertical 2, no se descarta.

## El invariante que NO cambia (la frontera se mantiene)

```
una lente solo ENTRA cuando hay PÁGINA que la beba.
```

Para comercio local, las páginas llegan CON el vertical. Hasta entonces: se
**cosechan candidatos** (lista viva), no se montan packs colgantes (memoria sin
lector ensucia el grafo). Cosechar ≠ instalar.

## Pendientes anotados

```
· verificador-visual (Playwright como MOTOR)   freno de render real para carta-design/digital.
                                               Sirve a AMBOS verticales (todo vertical renderiza HTML).
· cosecha vertical-2 (comercio local)          candidatos vistos: business-product (VoltAgent) —
                                               assumption-mapping · product-manager · business-analyst ·
                                               customer-success · growth-loops · legal-advisor.
                                               Se evalúan cuando se abran sus páginas.
```
