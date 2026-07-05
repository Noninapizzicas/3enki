# PRISMA-CONSTRUCCIÓN — vertical universal del HACER (construir cualquier cosa física)

> Estado: v0.1 — bancos puros del dominio (etapas + arquetipos + órganos) + tests. Los módulos
> (obra-manager, adaptador, proyector, boss) son follow-up. Segundo hermano de PRISMA-comercio;
> el meta-frame EMERGE de tener dos instancias, no se fuerza. Ver CLAUDE.md § PRISMA + § Cúpula de estados.

## El tema — no es edificación, es FABRICAR

"Construir" no es solo obra de edificación. Es hacer CUALQUIER cosa física: un barco, un coche,
una mesa, una silla, una cámara de frío, un edificio. La primera versión del modelo puso arquetipos
de edificación (estructural/cerramiento/tierras) — demasiado estrechos. La corrección que sube el
techo: **lo universal no es el tipo de elemento, son las ETAPAS.**

## El modelo (v2)

```json
{
  "esquema": "prisma-construccion-v2",
  "entidad_universal": "ElementoConstructivo (una pieza de lo construido)",
  "agregado": "Obra (lo construido: barco/coche/silla/cámara/edificio; contiene N elementos, sigue las etapas)",
  "tres_ejes": {
    "ETAPAS (espina universal · el RAIL)": "diseño → aprovisionamiento → fabricación → inspección → entrega. Orden ESTRICTO, frenos = inspecciones/ensayos. IGUAL para todo lo construido.",
    "ARQUETIPO del elemento (por forma → qué cálculo)": "estructura · envolvente · sistema · acabado · union",
    "DOMINIO (solo el sabor)": "naval · automocion · mueble · refrigeracion · edificacion — elige normativa y sabor del cálculo; NO cambia la estructura"
  },
  "cinco_huecos_del_elemento": {
    "identidad":     "qué es (viga IPE-300, casco, panel aislante) · qué trabajo resuelve",
    "arquetipo":     "estructura|envolvente|sistema|acabado|union (por la FORMA)",
    "restricciones": "NORMATIVA = verdad_obligatoria (Eurocódigo·CTE·normativa de dominio·seguridad). No se alinea, se dice FIEL — como los alérgenos en comercio. Es el freno.",
    "contrato":      "atributos (dimensiones, material, cálculos) · opciones (variante material/sección) · estados (proyectado→ejecutado→inspeccionado→recibido)",
    "ejes_naturalezas": "medición (m|m²|m³|ud|kg) · coste (material + mano de obra + maquinaria)"
  }
}
```

## Las ETAPAS son el rail vivo — la espina que engloba el universo

```
proceso 'obra' (UNIVERSAL · orden estricto · frenos entre etapas):
  diseño → aprovisionamiento → fabricación → inspección[freno: ensayo_ok] → entrega[freno: recepcion_ok]

// idéntico para un barco, un coche, una silla, una cámara de frío o un edificio.
// no fabricas antes de diseñar; no entregas antes de inspeccionar. La ley del hacer, hecha rail.
// Es una PLANTILLA de la cúpula de estados (modules/estados) → el rail vivo era la pieza que faltaba.
```

## Arquetipos por la forma → sus órganos (universal a todo lo construido)

```
ARQUETIPO    forma (qué hace)   órgano que enciende               ejemplos (barco/coche/silla/cámara/edificio)
estructura   soporta, da forma  calculo_estructural·ensayo·insp.  casco · chasis · patas · bastidor · pilares
envolvente   cierra, aísla      calculo_termico·estanqueidad      forro · carrocería · asiento · panel · fachada
sistema      da función         dimensionado·prueba_funcional     motor · eléctrica · — · equipo frío · instalaciones
acabado      termina            medicion·control_calidad          pintura · tapicería · barniz · sellado · solados
union        junta              calculo_uniones                   soldadura · tornillería · ensamble
```

Órganos UNIVERSALES (toda obra los enciende): `presupuesto` (BOM+mediciones), `planificacion`
(agenda/gantt — lo bebe el calendario ya construido), `normativa` (el freno), `seguridad` (PRL).

## El regalo: fabricar y vender son hermanos que componen

PRISMA-comercio tiene arquetipos de VENDER (comestible/servicio/uso_temporal/pieza).
PRISMA-construcción tiene los de HACER (estructura/envolvente/sistema/acabado/union). Y una cosa se
HACE y luego se VENDE: una silla la fabrica construcción y la vende comercio. Dos verticales, un núcleo.

## El cierre: la skill ingenieria-experta es la LENTE del cálculo

La skill de oficio `ingenieria-experta` (cantera) es el oficio que las páginas de cálculo de esta
obra beberán: cuando una página `calculo` declare `lente_default: {dominio:'ingenieria'}`, el LLM la
encarna y el cálculo deja de ser genérico. La munición se guardó justo antes del tema.

## Piezas (v0.1 · bancos puros)

```
_shared/etapas-construccion.js     LA ESPINA — OBRA (proceso universal) + plantillaEtapas(dominio, extra)
_shared/arquetipos-fabricacion.js  SEMILLA (5 arquetipos por forma) + clasificar({funcion}, extra) — registro abierto
_shared/organos-fabricacion.js     KNOWN_ORGANOS + ORGANOS_UNIVERSALES + organosDe(arquetipos) + diffPlan
tests/unit/prisma-construccion__semillas.test.js  (11: clasificar por forma · custom prioridad · OBRA estricta ·
  override de dominio · organosDe universales+arquetipo · diff · el rail atasca en inspección sin ensayo_ok)
```

## Follow-up (módulos, cuando el modelo esté rodado)

```
obra-manager   custodio aggregate-root de la obra (elementos + estados). Copiar el patrón producto-manager.
adaptador      crudo (plano/descripción/"una nave de 500m²") → elementos + clasifica arquetipo. blueprint-agentico.
proyector      obra → presupuesto / pliego / plan de obra (proyecciones de consumo).
boss+enforcement  obra = conjunto de arquetipos → enciende SUS órganos + los universales (organosDe → interruptor).
rail           al crear la obra, instanciar la plantilla de etapas en la cúpula de estados (estados.crear/instanciar).
DECISIÓN abierta  el meta-frame (pipeline genérico parametrizado por tema) se extrae cuando la duplicación
                  comercio↔construcción DUELA, no antes. Hoy: reusar los bancos _shared, crecer al lado.
```
