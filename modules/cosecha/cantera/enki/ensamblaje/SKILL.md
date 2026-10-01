---
name: ensamblaje
description: "FASE 7b del proceso de proyecto: RECOMPONE la realidad escrita. Cruza el CONTRATO DISEÑADO — el bloque ```json enki-plan``` de F3b (plan-construccion.md), donde CADA hoja declara sus subscribes[] y publishes[] — contra lo ESCRITO (los module.json reales de F4 y las interfaces de F6→F7). Detecta las CONEXIONES DE DOMINIO ROTAS (un evento que se publica y nadie escucha → se pierde silenciosamente) y las HOJAS DIVERGENTES (el plan declaró que un módulo escucha/publica algo y el módulo escrito no lo hace). Determinista, sin LLM: cruzar dos listas no es un juicio."
when-to-use: "Entra encadenada por proceso-negocio cuando el ciclo por pieza ha completado TODAS las hojas (módulo + skill + interfaz) y ANTES de la verificación final (F8). También a mano: cuando sospeches que los módulos no se hablan entre sí, cuando una cadena de eventos se corta sin error visible, o cuando quieras el mapa real de conexiones de una vertical. Sirve para CUALQUIER vertical construida con el proceso, no solo nichos."
fuente: enki
dominio: proceso
lente_dominio: orquestacion
lente_tarea: ensamblar
tags: [fase7b, ensamblaje, proceso-negocio, eventos, conexiones, contrato, plan-construccion, f3b, determinista, recomposicion, islas, gate]
---

# Ensamblaje — FASE 7b del proceso de proyecto

> El eslabón que cierra la cadena por donde se escapaba la coherencia:
> F0 identidad → F2 esquematizar → F3 planificar → **F3b adaptador (el plan con
> contratos)** → F4 construir → F5 skills → F6/F6½/F7 interfaz → **F7b ENSAMBLAJE**
> → F8 verificar.
>
> Código: `modules/proceso-negocio/ensamblaje.js` (el recomponedor) + la fase
> `negocio.ensamblado` del orquestador · habilita el paso a F8.

---

## 1 · El problema que resuelve (medido, no supuesto)

El proceso construye cada módulo como una **isla** (F4: «cada parcela hace SU
trabajo y punto») y F8 verifica que cada isla **carga**. Pero **nadie comprobaba
que las islas HABLEN entre sí**. Resultado real en la vertical nichos (leído en
vivo, 1-oct-2026):

```
49 hojas en el plan · 18 divergentes · 81 conexiones de dominio rotas
```

Y 8 módulos que no hacían lo que el plan declaró:

| Módulo | El plan (F3b) dijo | Lo escrito |
|---|---|---|
| `alerta-sangria` | escucha `nichos.salud.actualizada` | no lo escucha |
| `gate-decision-operar` | escucha `nichos.decision.resuelta` | no lo escucha |
| `reglas-aprendidas` | escucha `nichos.cobro.ejecutado` | no lo escucha |
| `pipeline-por-nicho` | publica `nichos.pipeline.ciclo_completado` | publica otro nombre |

Cada módulo **emite su resultado y espera su propia petición con otro nombre**.
No falta cablear: **el nombre no coincide**. El ensamblaje lo mide.

## 2 · La materia prima ya existe — no se inventa nada

```
F3   diseno-oop.md         0 eventos    ← habla de CLASES (CONTRATO X pide/emite)
F3b  plan-construccion.md  249 eventos  ← CADA HOJA declara subscribes[] y publishes[]
F4   modules/<slug>/module.json  ...... lo construido
```

**F3 no sirve** (tipos abstractos, cero eventos reales). **El dato vivo está en
F3b**: el bloque `` ```json enki-plan``` `` que el adaptador escribe.

## 3 · Qué hace exactamente

Determinista, sin LLM, **sin efectos** (solo lee y produce un informe):

1. **Divergencia POR HOJA** — para cada hoja del plan, compara `subscribes`/
   `publishes` declarados contra los del `module.json` real:
   - `falta_subscribes` / `falta_publishes`: el plan lo declaró y el módulo no lo hace.
   - `extra_subscribes` / `extra_publishes`: el módulo hace algo que el plan no declaró.
   - `NO_ESCRITA`: la hoja está en el plan y no hay módulo.
2. **CONEXIONES DE DOMINIO ROTAS** — sobre lo escrito: un evento de dominio que
   alguien publica y **nadie escucha** (se pierde silenciosamente).
3. **Veredicto** `ensamblado: true|false` — true solo sin rotas y sin divergentes.

> Los eventos `.request` / `.response` del bus **NO cuentan**: los atiende el
> propio módulo por su handler RPC, no son conexiones entre piezas.

## 4 · Cómo se conduce (determinista)

El orquestador lo hace solo. La puerta de cierre es la del resto de fases:

```
proceso-negocio.completar_fase { fase: "ensamblado" }
```

- El gate corre `_ensambladoRecomponer` (el recomponedor). Si no está ensamblado
  → **409 FASE_INCOMPLETA** con el motivo medido (rotas + divergentes). No pasa a F8.
- El informe queda **en disco**: `proceso-negocio/fase7b-ensamblaje.json`.
- A mano, para inspeccionar sin cerrar fase:

```js
const { Ensamblaje } = require('modules/proceso-negocio/ensamblaje');
const informe = new Ensamblaje(plan, real).recomponer();
// plan = JSON.parse(bloque ```json enki-plan``` de esquemas/plan-construccion.md)
// real = { <slug>: { existe, subscribes, publishes, tiene_interfaz } }
```

## 5 · Por qué F7b (y no F3/F3b ni F8)

Cuando F7b corre, la realidad escrita está **completa**: plan (F3b) + módulos (F4)
+ skills (F5) + interfaces (F6→F7). **Antes no habría nada que recomponer**;
después (F8) ya es verificación. **F7b recompone con la realidad escrita; F8
verifica el resultado.**

## 6 · Por qué no vale el validador de eventos del repo

`arquitectura/decisiones/_validators/blueprint-eventos-conscientes.validate.js`
ya sabe detectar un evento publicado sin consumidor, **pero**:
- su check es **OPT-IN**: solo mira módulos que declaran
  `eventos_publicados_que_requieren_consumer[]`, y en nichos lo declaran **0 de 44**;
- es **pasivo**: informa, no forma parte del proceso ni bloquea nada.

## 7 · El freno convertido en empujón

Cuando el ensamblaje encuentra rotas o divergentes, **no se detiene**: el hallazgo
es el **trabajo que queda**. Cada conexión rota es una conexión que falta
(existe el emisor, falta el consumidor o el nombre); cada hoja divergente es un
módulo que no cumple su contrato. La fase se cierra cuando se corrige, y entonces
el proceso pasa a F8.

## 8 · Verificación (cómo se prueba)

```bash
node tests/unit/proceso-negocio__ensamblaje.test.js    # 8/8
```

Cubre: coincidencia plena → `ensamblado`; falta de subscribe/publica → DIVERGENTE;
conexión rota por evento huérfano; exclusión de `.request`/`.response`; hoja no
escrita; tolerancia a `{event, handler}`; y el **caso real** del plan de nichos.

## 9 · Anti-patrones

- Cablear a mano los 80 eventos: son consecuencia, no causa. La causa es que el
  proceso no recomponía; la fase lo hace para **toda** vertical.
- Confundir este ensamblaje con el de `ensamblador-solucion` (D1, otro dominio:
  compone la solución de UN nicho). Aquí se ensambla el SISTEMA contra su plan.
- Inventar consumidores para callar el informe: el informe dice la verdad; se
  arregla el módulo o se corrige el plan (F3b), no el número.
