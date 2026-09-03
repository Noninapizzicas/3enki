---
name: esquematizador-que-construir
description: >-
  FM1 (Fase Marketing 1): AGENTE que deriva QUÉ hay que crear para cubrir los
  objetivos del negocio, partiendo de la pregunta rectora sobre FASE 0 + FM0:
  "¿qué tenemos que CREAR para cubrir los objetivos de estas bases?". Produce el
  documento FM1 (storage/marketing/fm1.md) con las piezas a construir — interfaces,
  plataformas, dashboard, app móvil, PWA, bot — SIN asumir web ni catálogo; lo que
  no existe se marca a_crear. Es el paso PREVIO al esquematizador-interfaz-cliente
  (que consume el FM1 y esquematiza cada pieza).
when-to-use: >-
  Tras tener la FASE 0 (identidad-negocio) y el FM0 (fundamento de marketing) de
  un proyecto, antes de esquematizar ninguna interfaz. Cuando se pida "qué hay
  que construir", "qué nos pide la lógica crear", "FM1", o alimentar al
  esquematizador-interfaz-cliente con el QUÉ decidido.
source: hermes
tags: [enki, marketing, fm1, que-construir, esquema, proceso, pipeline, decidir, logica]
---

# Esquematizador QUÉ CONSTRUIR (FM1)

> **Nace de la LÓGICA, no de un catálogo.** Deriva el QUÉ construir de los
> objetivos de FASE 0 + FM0. Produce el FM1: el documento que dice qué hay que
> crear y porqué, antes de esquematizar ninguna interfaz.

## Posición en el ciclo

```
FASE 0  identidad-negocio   → qué ES y qué VENDE
FM0     fundamento-marketing → qué PROMETER y a QUÉN (objetivos, canales, embudo)
FM1     esquematizador-que-construir (ESTE) → QUÉ CREAR para cubrir esos objetivos
FASE 2  esquematizador-interfaz-cliente → CÓMO se ve cada pieza (consume el FM1)
F7      construir-interfaz   → el trío frontend real
```

**Gate**: solo arranca con FASE 0 + FM0. Si faltan o no hay objetivos, decirlo y
NO inventar.

## La pregunta rectora (todo nace de aquí)

> **"¿Qué tenemos que CREAR para cubrir los objetivos de fase-0 y fm0?"**

De la **lógica** de ambos documentos se deriva el QUÉ. Ese QUÉ **no está asumido
ni limitado por catálogo/inventario**: puede ser 1 o 2 interfaces distintas, una
app web, una PWA instalable, una app móvil, un dashboard, un bot — lo que la
lógica pida.

**Regla de oro**: lo que no existe se CREA (construir-modulos / generar-ui-web /
adaptar-a-enki). La oferta no se corta por lo que ya hay. Los frenos suman: cada
pieza convierte un freno del negocio en una oportunidad.

## Cómo deriva (pasos)

1. **Leer** FASE 0 (storage/proceso-negocio/fase0-identidad-negocio.json) y FM0
   (storage/marketing/fm0.md).
2. **Derivar** las piezas que cubren sus objetivos, cada una con: nombre, tipo,
   cara (cliente/jefe/neutro), objetivo que sirve, porqué (qué freno convierte
   en oportunidad), estado (existe / a_crear).
3. **No asumir** web: dejar que la lógica diga si son 1 o 2 interfaces, o un
   dashboard, o una PWA.
4. **Marcar `a_crear`** lo que no existe — sin descartar.

## Entregable: FM1

```
storage/marketing/fm1.md   (junto a fm0.md, en la carpeta marketing)
```

Estructura:
- `# FM1 — Qué construir`
- objetivo (derivado de fase-0 + fm0)
- lista de PIEZAS (una por bloque: nombre, tipo, cara, objetivo, porque, estado)
- frenos que cada pieza convierte en oportunidad
- preguntas abiertas (nunca inventar datos)

## Quién lo ejecuta

- **AGENTE** (pipeline del registro): `esquematizador-que-construir` — el chat lo
  invoca con `invoke_agent('esquematizador-que-construir', {task})`. Determinista:
  fuzzy → reflejo → JEFE verifica `storage/marketing/fm1.md`.
- **Cúpula**: registrado en `agentes/_index.json`.
- **Skill** (este documento): documenta el método para el chat/gente.

## Después

El FM1 alimenta a `esquematizador-interfaz-cliente`, que esquematiza cada pieza
del FM1 con su lente correcta (cliente/jefe/neutro).
