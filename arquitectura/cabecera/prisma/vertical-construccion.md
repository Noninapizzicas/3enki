---
id: prisma/vertical-construccion
dominio: prisma
resumen: El vertical del HACER: etapas universales como espina (rail), arquetipos de fabricación por forma, órganos de obra — bancos puros v0.1.
fuentes:
  - modules/_shared/etapas-construccion.js
  - modules/_shared/arquetipos-fabricacion.js
  - modules/_shared/organos-fabricacion.js
verificado: 2026-07-06
---

# PRISMA-CONSTRUCCIÓN — vertical universal del HACER (construir cualquier cosa · v0.1 bancos)

> Segundo hermano de PRISMA (comercio = vender · construcción = HACER). Confirma que PRISMA es un
> PATRÓN, no una app: el segundo tema que lo prueba. Propuesta:
> arquitectura/decisiones/propuestas/prisma-construccion.md. Bancos puros + tests; módulos = follow-up.

## El hallazgo — las ETAPAS son la espina universal (no el tipo de elemento)

```json
{
  "esquema": "prisma-construccion-v2",
  "tema": "no es edificación — es FABRICAR cualquier cosa física (barco·coche·mesa·silla·cámara de frío·edificio)",
  "correccion": "arquetipos de edificación (estructural/cerramiento/tierras) eran demasiado estrechos; lo UNIVERSAL son las ETAPAS",
  "entidad": "ElementoConstructivo · agregado = la Obra (lo construido)",
  "tres_ejes": {
    "ETAPAS (espina · el RAIL)": "diseño → aprovisionamiento → fabricación → inspección[freno:ensayo_ok] → entrega[freno:recepcion_ok]. Orden ESTRICTO, IGUAL para todo lo construido. Es una plantilla de la CÚPULA DE ESTADOS (el rail vivo era la pieza que faltaba).",
    "ARQUETIPO del elemento (por forma → qué cálculo)": "estructura · envolvente · sistema · acabado · union",
    "DOMINIO (solo el sabor)": "naval·automocion·mueble·refrigeracion·edificacion → elige normativa y sabor del cálculo; NO cambia la estructura"
  },
  "prueba_universalidad": "casco=estructura · carrocería=envolvente · equipo frío=sistema · barniz=acabado · soldadura=union — misma máquina, mismas etapas, distinto dominio",
  "composicion": "fabricar + vender son hermanos: una silla la HACE construcción y la VENDE comercio. Dos verticales, un núcleo.",
  "cierre": "la skill ingenieria-experta (cantera) es la LENTE del cálculo — una página 'calculo' que beba dominio 'ingenieria' la encarna."
}
```

## Piezas (v0.1) · estado

```
_shared/etapas-construccion.js     LA ESPINA — OBRA (proceso universal) + plantillaEtapas(dominio, extra)
_shared/arquetipos-fabricacion.js  5 arquetipos por forma + clasificar({funcion}) — registro abierto (custom con prioridad)
_shared/organos-fabricacion.js     KNOWN_ORGANOS + ORGANOS_UNIVERSALES (presupuesto·planificacion·normativa·seguridad) + organosDe + diffPlan
TESTS  prisma-construccion__semillas (11: clasificar por forma · custom prioridad · OBRA estricta · override de dominio ·
       organosDe universales+arquetipo · diff · el rail ATASCA en inspección sin ensayo_ok = el cierre con la cúpula).
ESTADO ✓ bancos puros del dominio + tests. ◑ follow-up: obra-manager (custodio) · adaptador (crudo→elementos) · proyector
       (presupuesto/plan de obra) · boss+enforcement (obra→órganos) · wiring obra→cúpula (instanciar las etapas).
DECISIÓN meta-frame (pipeline genérico parametrizado por tema) = se extrae cuando la duplicación comercio↔construcción
         DUELA, no antes. Hoy: reusar los bancos _shared, crecer al lado (no refactorizar el comercio que funciona).
```
