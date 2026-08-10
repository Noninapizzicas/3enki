---
name: construir-modulos
description: >-
  FASE 4 del proceso de proyecto (la empuja el orquestador proceso-negocio tras
  negocio.planificado o negocio.interfaz_construida): CONSTRUYE los módulos del
  plan de construcción, UNA hoja a la vez. CONSUME el plano del ADAPTADOR
  (esquemas/plan-construccion.md — reutiliza · construye · adapta): cada hoja
  con su decisión REUTILIZAR (ya existe — no se construye), ADAPTAR (se ajusta
  un módulo existente) o CONSTRUIR (nuevo módulo — se invoca el pipeline
  construir-modulos con el slug). MANDATO MECÁNICO: UNA hoja a la vez, en el
  orden de las etapas del plan, sin saltar dependencias, verificando cada
  módulo antes de seguir (el JEFE valida api_real + en_repo). Después de cada
  módulo construido: proceso-negocio.completar_fase { fase: 'construido',
  resumen: { modulos: ['<slug>'] } } → empuja F5 (skill) y F6 (interfaz) por
  pieza. Al terminar todas las hojas: completar_fase { fase: 'completado' }.
  NO construir hojas REUTILIZA. NO saltarse el orden de dependencias. Verificar
  en disco, no creer al reporte.
fuente: enki
when-to-use: "Entra encadenada por proceso-negocio tras negocio.planificado (FASE 4 inicial) o negocio.interfaz_construida (siguientes hojas del ciclo por pieza). Ante un proyecto con plan-construccion.md (del adaptador) pendiente de materializar: construir sus módulos UNA hoja a la vez. También a mano para construir/adaptar un módulo concreto del plan."
dominio: metodo
lente_dominio: construccion
lente_tarea: construir
tags: [fase4, construccion, modulo, plan, adaptador, reutiliza, api_real, en_repo, proceso]
---

# Construir Módulos — FASE 4 del proceso de proyecto

> **Qué es.** La skill que CONSTRUYE los módulos del negocio según el plan de
> construcción. Entra encadenada (la empuja `proceso-negocio` tras
> `negocio.planificado` o `negocio.interfaz_construida`) — no a mano.
>
> **El plan ya NO se inventa aquí**: viene del ADAPTADOR X→Enki (fase 3b),
> que tradujo el diseño OOP al sistema real (reutiliza · construye · adapta).
> La fase 4 EJECUTA ese plano, no lo replantea.
>
> Código: fase 4 de proceso · habilita `negocio.construido` (por pieza) y
> `negocio.completado` (fin).

---

## 1 · ENTRADA — lee el plan del ADAPTADOR (no lo replantees)

**REGLA DIRECTIVA (innegociable)**: cuando esta skill entra **encadenada por el
orquestador**, el proceso YA decidió: toca construir. **NO ofrezcas opciones**,
no reordenes el plan, no redecidas formas. **EJECUTA** el plano tal cual.

Lee el plan de construcción (lo generó el adaptador):

```
fs.read.request { path: 'esquemas/plan-construccion.md' }
  → el plano con las hojas y su decisión:
      - REUTILIZA: <módulo>          → YA existe — NO se construye
      - ADAPTA: <módulo> (cambio)     → se ajusta el módulo existente
      - CONSTRUYE: <slug> (FORMA)     → nuevo módulo — se invoca el pipeline
```

**Si el plan no existe** (el adaptador aún no lo generó) → no inventes: avísalo
y espera (el adaptador produce plan-construccion.md; sin él no hay fase 4).

## 2 · LA UNIDAD DE TRABAJO — UNA hoja a la vez

**MANDATO MECÁNICO**: el ciclo por pieza es de Paco — **fase 4 uno a uno**, no
todos de una. Por cada hoja del plan, en el ORDEN de las etapas:

```
1. Lee la hoja del plan (slug + decisión + forma + contrato)
2. REUTILIZA → verifica que el módulo existe y salta (no construyas)
3. ADAPTA   → ajusta el módulo existente según el cambio indicado
4. CONSTRUYE → invoke_agent('construir-modulos', { task: <contrato de la hoja> })
   → el pipeline genera index.js + module.json, escribe en modules/<slug>/,
     commitea (identidad 'Enki Motor' automática), y el JEFE verifica
     api_real + en_repo
5. VERIFICA en disco (no creas al reporte):
   fs.list_modules / fs.read_module → modules/<slug>/index.js existe
   → el JEFE ya validó api_real + en_repo en la bitácora
```

**NUNCA** construyas dos hojas en paralelo. **NUNCA** saltes una dependencia.
**NUNCA** construyas una hoja REUTILIZA (existe — el plan lo dice).

## 3 · LA FORMA según el patrón real (rebanada patron/modulo-real.md)

El código lo genera el pipeline, pero el CHAT debe saber el patrón para validar
que lo que vino es correcto (la rebanada `patron/modulo-real.md` es el ADN):

```json
{
  "_doc": "Descripción larga del módulo.",
  "name": "<slug>",
  "version": "0.1.0",
  "description": "Una línea: qué hace el módulo.",
  "subscribes": [
    { "event": "<slug>.get.request", "handler": "onGetRequest", "description": "…" }
  ],
  "publishes": [
    { "event": "<slug>.algo_paso", "description": "…" }
  ]
}
```

El `index.js` sigue `_shared/base-module`: clase que extiende `BaseModule` con
`this.name` y `this.version`, y un método `_atender(evento, contexto,
respuesta, siguiente)` (4 args — la regla `api_real` del JEFE). Si el módulo
necesita reflejo determinista: `_shared/modulo-hibrido-reflejo`.

## 4 · CERRAR LA PIEZA — y seguir con F5/F6 por módulo

Tras construir (o adaptar) UN módulo, cierra el ciclo por pieza:

```
proceso-negocio.completar_fase { fase: 'construido', resumen: { modulos: ['<slug>'] } }
  → el orquestador empuja FASE 5 (escribir-skills) y FASE 6 (decidir-interfaz)
    para ESE módulo, y luego vuelve a esta skill para la siguiente hoja.
```

**Cuando NO queden hojas sin construir** (todas REUTILIZA verificadas o
CONSTRUYE/ADAPTA completadas):

```
proceso-negocio.completar_fase { fase: 'completado' }
  → fin del proceso (todas las piezas con módulo).
```

## 5 · ERRORES A EVITAR (lecciones en vivo)

- ❌ **Construir hojas REUTILIZA** — el plan del adaptador ya decidió que
  existen; construirlas de nuevo es re-inventar lo que el sistema tiene.
- ❌ **Construir de memoria** — el patrón real vive en
  `arquitectura/cabecera/patron/modulo-real.md`; si el pipeline genera algo
  que no lo sigue, el JEFE lo rechazará con `api_real`. No lo aceptes a mano.
- ❌ **Creer el reporte del pipeline** — verifica en disco con
  `fs.list_modules`/`fs.read_module` que `modules/<slug>/` existe de verdad.
- ❌ **Decir "no escribió nada"** cuando el motor escribió en
  `/opt/enki/modules/` — el fs del chat está scopeado al storage del proyecto;
  usa `fs.list_modules`/`fs.read_module` (solo lectura) para VER los módulos
  del sistema.
- ❌ **Saltar el orden de dependencias** — el plan del adaptador tiene etapas;
  construir fuera de orden rompe los contratos.
- ❌ **Construir varias hojas a la vez** — UNA a la vez, siempre (ciclo por
  pieza). El orquestador decide cuándo vuelves.

## 6 · VERIFICACIÓN (antes de declarar construido)

1. El JEFE validó `api_real` + `en_repo` (bitácora del pipeline).
2. `modules/<slug>/module.json` + `index.js` existen (fs.list_modules).
3. El módulo carga: `require('modules/<slug>/index.js')` no lanza.
4. El plan de construcción marca la hoja como construida.
