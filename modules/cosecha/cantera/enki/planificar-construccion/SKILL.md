---
name: planificar-construccion
description: >-
  FASE 3 · PLASMA del proceso de un proyecto (la empuja el orquestador
  proceso-negocio tras negocio.esquematizado): diseña el SISTEMA a construir en
  PSEUDOCÓDIGO OOP (clases, objetos, flujos, contratos — el lenguaje natural del
  diseñador) SIN conocer Enki ni framework, partiendo del árbol maestro de piezas
  que dejó la FASE 2 (esquemas/esquema.md + pasadas + disección). REGLA DEL PLASMA
  (innegociable): prohibido mencionar frameworks, módulos, tecnologías,
  infraestructura o plataforma — TODO el entorno (impresora, repositorios, canal
  de avisos, slicer) va por PUERTO ABIERTO cableado en el sitio de despliegue.
  Motor de esquematización = `prisma-universal` (vía delegate_task o cosecha.obtener)
  preseteándole las 3 variables: ENTRADA = el árbol de la FASE 2; ARCHIVO_FINAL =
  esquemas/diseno-oop.md; CÓMO = responsable técnico de diseño OOP / PARA = diseñar
  el sistema de la vertical del proyecto. El entregable es UN único archivo,
  `esquemas/diseno-oop.md`, que el gate del orquestador verifica (regla 'existe').
  Este documento ES el plan que la FASE 3b (adaptador X→Enki) traduce contra el
  inventario real en esquemas/plan-construccion.md. Al terminar:
  proceso-negocio.completar_fase { fase: 'planificado' } → empuja la FASE 3b
  (adaptar). NO confundir con construir-modulos (FASE 4, materializa en disco) ni
  con el adaptador (FASE 3b, traduce a Enki): esta fase SOLO piensa, no traduce ni
  construye. CERO tecnologías, CERO Enki.
fuente: enki
dominio: metodo
lente_dominio: diseno_oop
lente_tarea: disenar_sistema
tags: [fase3, plasma, diseno-oop, prisma-universal, sistema, proceso]
---

# Planificar Construcción — FASE 3 · PLASMA (diseño del sistema)

> **Qué es.** La skill que diseña el SISTEMA de un proyecto en pseudocódigo OOP
> cuando la FASE 2 ya dejó el árbol de piezas. Entra encadenada (la empuja
> `proceso-negocio` tras `negocio.esquematizado`) — no a mano.
>
> Código: fase 3 de proceso · habilita `negocio.planificado`

---

## 1 · ENTRADA — bebe del árbol de la FASE 2 (no preguntes)

**REGLA DIRECTIVA (innegociable)**: cuando esta skill entra **encadenada por el
orquestador** (empujón de `proceso-negocio`), el proceso YA decidió: toca diseñar
el sistema. **NO ofrezcas opciones** — nada de "¿lo diseño en X o en Y?", nada de
caminos A/B/C. **EJECUTA.**

Antes de diseñar, lee el árbol maestro de piezas que dejó la FASE 2 (esquematizar-negocio):

```
fs.list.request { path: 'esquemas' }
  → esquema.md                 ← árbol maestro (piezas globales + por interlocutor + por ROL, con su FORMA)
  → pasada-N-<pieza>.md        ← rondas del prisma
  → pasada-N-interlocutor-<rol>.md
  → pasada-N-rol-<rol>.md      ← piezas de interfaz + lógica de dominio por rol
  → pasada-N-diseccion.md      ← la FORMA de cada hoja atómica (reflejo/custodio/conversor/puente/micro-agente)
```

**Regla**: el sujeto del diseño son las **PIEZAS del árbol maestro** de la FASE 2
(lo que el negocio necesita construir). NO se replantea el negocio ni el esquema;
se DISEÑA la arquitectura de lo que hay que construir para servirlo.

**Si el árbol de F2 no existe** (no se esquematizó) → no inventes: avísalo y espera
(el árbol del prisma es la entrada; sin él no hay fase 3).

## 2 · EL MÉTODO — prisma-universal aplicado al diseño OOP (PLASMA)

> **Motor de esquematización = `prisma-universal`** (vía `delegate_task` o
> `cosecha.obtener`). Pásale las 3 variables preseleccionadas:
> - **ENTRADA** = el árbol de la FASE 2 (`esquemas/esquema.md` + `pasada-*.md` +
>   `pasada-N-diseccion.md`), las rutas tal cual.
> - **ARCHIVO_FINAL** = `esquemas/diseno-oop.md`.
> - **CÓMO** = responsable técnico de diseño OOP (ingeniero de diseño de sistemas
>   orientado a objetos) · **PARA** = diseñar el sistema completo de la vertical
>   del proyecto.
>
> El prisma-universal hace el prisma de 5 huecos + agota hasta seco + escribe.
> Tú le das el CÓMO+PARA de diseño OOP y la REGLA DEL PLASMA (abajo) va en el
> mandato/task que le pasas.

### La REGLA DEL PLASMA (prohibido pensar en Enki)

El diseño se hace en **pseudocódigo OOP tipado**, el lenguaje natural del
diseñador — **sin conocer Enki, sin framework, sin plataforma**:

- **Prohibido** mencionar: módulos Enki, MQTT, eventBus, BaseModule, `_shared`,
  Svelte, frontend, stores, blueprints, framework, infraestructura, despliegue.
- **Todo el entorno externo** (impresora, repositorios de modelos, canal de
  avisos, slicer, filamento) va por **puerto ABIERTO** (`Puerto <X>` cableado en
  el sitio de despliegue) — nunca acoplado a una tecnología concreta.
- **Cero juicio**: el sistema ejecuta y transporta de forma determinista; el
  dueño decide. Las decisiones humanas van por `SolicitudDecision`, no por
  lógica automática.

### Qué produce el diseño (`diseno-oop.md`)

El archivo final debe contener, al menos:

```text
# Diseño OOP — <proyecto> (Fase 3 · PLASMA)
## Objetivo del sistema          ← qué hace el sistema y cuándo interrumpe al dueño
## Entidades y clases            ← UNA clase por cada pieza del árbol de F2:
                                  CLASE <Entidad> { ATRIBUTOS · METODOS · REGLA }
## Puertos abiertos              ← entorno externo (impresora, repos, avisos, slicer)
## Flujos                        ← los flujos del sistema (encolar→aprobar→imprimir→…)
## Decisión humana               ← SolicitudDecision: dónde el dueño decide
## Contratos / eventos           ← qué pide cada clase y qué emite (sin MQTT: como contrato)
## Invariantes / determinismo    ← cero juicio, dato ausente = desconocido/[ABIERTO]
## Preguntas abiertas [ABIERTO]  ← huecos que se nombran, no se cierran
```

Cada **pieza del árbol de F2** (con su FORMA de la disección) debe mapearse a una
**clase con su lógica**. Si una pieza no tiene clase → el diseño está incompleto.

## 3 · DÓNDE SE PERSISTE — ruta EXACTA (no negociable)

El entregable de la FASE 3 es **UN único archivo**:

```text
<storage del proyecto>/esquemas/diseno-oop.md    ← el diseño OOP (OBLIGATORIO, UN archivo)
```

Ruta **relativa al proyecto** — el gate del orquestador
(`_verificarEntregable` → FASE 3 · PLASMA) comprueba que `esquemas/diseno-oop.md`
escribe. Escríbelo ahí:

```jsonc
fs.write.request { "project_id": "<id>", "path": "esquemas/diseno-oop.md", "content": "<diseño>" }
```

**Patrón del repo: UN entregable = UN archivo.** El diseño completo va EMBEBIDO
en `diseno-oop.md` (prisma + disección ya vienen del árbol de F2; aquí solo se
convierte ese árbol en diseño OOP). Sin `diseno-oop.md`, el gate devuelve
`FASE_INCOMPLETA` y el proceso no avanza a la FASE 3b (adaptador).

## 4 · SALIDA — señal de fase completada

Al terminar (diseño escrito), cierra la fase para que el orquestador encadene:

```jsonc
proceso-negocio.completar_fase.request {
  project_id,
  fase: 'planificado',
  resumen: { clases: N, puertos: N, archivo_diseno: 'esquemas/diseno-oop.md' }
}
```

El orquestador marca la fase y empuja la **FASE 3b · ADAPTADOR X→Enki**
(`construir-modulos`): traducir este diseño OOP al sistema real
(`esquemas/plan-construccion.md`, reutiliza·construye·adapta). Después, el ciclo
por pieza (FASE 4).

**Cómo encadena** — la respuesta 200:
```jsonc
{ "fase_completada": "negocio.planificado",
  "siguiente": "construir-modulos",    // ← la FASE 3b (adaptador)
  "entregable": { "ok": true, "verificados": ["diseno-oop"] },
  "fin": false }
```

**Si algo bloquea** (árbol F2 incompleto, no se puede leer) → informa con
honestidad y NO inventes el diseño. La fase queda pendiente, no forzada.

---

## 5 · Errores a evitar

- **Ofrecer opciones A/B/C al entrar encadenada** — el proceso ya decidió: EJECUTA.
- **Pedir permiso de configuración** (¿"activo la skill"?) — el orquestador ya la activó.
- **Replanetear el negocio o el esquema** — el sujeto es el SISTEMA de piezas de F2; se diseña, no se re-esquematiza.
- **Colar tecnologías Enki** (módulos, MQTT, BaseModule, Svelte, `_shared`, stores) — REGLA DEL PLASMA: pseudocódigo OOP puro, puertos abiertos.
- **Acoplar el entorno a un proveedor** — impresora/repos/avisos/slicer van por puerto ABIERTO, no por API de marca.
- **Dejar una pieza de F2 sin clase** — cada pieza con su forma mapea a una clase; si falta, el diseño está incompleto.
- **Inventar juicio automático** — las decisiones del dueño van por `SolicitudDecision`; el sistema no decide.
- **Escribir fuera de `esquemas/`** — el gate ve solo `esquemas/diseno-oop.md`.
- **Mezclar F3 con F3b** — F3 piensa (OOP puro, sin Enki); F3b traduce (adaptador X→Enki, plan-construccion.md). NO hacer ambos en esta fase.
- **Mezclar F3 con F4** — F4 materializa el módulo en disco; F3 solo el diseño en papel.
- **Olvidar la señal de fase** — sin `proceso-negocio.completar_fase { fase: 'planificado' }`, el proceso se detiene aquí.

## 6 · Verificación

- Se lee el árbol de la FASE 2 (esquema.md + pasadas + disección), con sus piezas y formas.
- **Sí hay diseño**: `esquemas/diseno-oop.md` existe y es UN archivo con el diseño OOP.
- **Plasma cumplido**: CERO menciones a Enki/framework/plataforma/tecnología; puertos abiertos para el entorno.
- **Cada clase** mapea una pieza del árbol de F2 (con su forma de la disección).
- **Cada flujo del negocio** (declarado en F2) tiene su flujo diseñado en OOP.
- **CERO juicio automático**: las pocas decisiones humanas van por `SolicitudDecision`.
- **Preguntas abiertas** del diseño quedan como [ABIERTO] nombradas, no cerradas.
- **Dato ausente = desconocido/[ABIERTO]**, nunca inventado (invariante del sistema).
- Señal de fase enviada: `proceso-negocio.completar_fase { fase: 'planificado' }` → 200 (no 409), y la respuesta trae `siguiente: 'construir-modulos'` (FASE 3b).
