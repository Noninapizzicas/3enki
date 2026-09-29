---
name: poner-en-servicio
description: >-
  PASO POSTERIOR a F8: poner una vertical de Enki EN SERVICIO — que el sistema
  empiece a OPERAR de verdad. F8 VERIFICA la entrega (módulo+skill+interfaz en
  disco); esto ARRANCA la operación: declarar los módulos en config.json en orden
  de la espina, sellar F8, aprovisionar la primera semilla, crear el job del
  scheduler que dispara el ciclo, lanzar el primer ciclo end-to-end y verificar
  que avanza, y dar de alta el canal de supervisión. El mapa de proceso-negocio
  TERMINA en 'verificado' — poner en servicio no está modelado, es material
  propio que se construye aquí. Caso testigo: vertical `nichos` (Radar de Nichos),
  2026-09-27.
when-to-use: >-
  El estado.json de un proyecto dice "vertical lista para deploy + puesta en
  servicio", o hay que arrancar por primera vez una vertical recién construida:
  sus 44 módulos existen y verifican, pero nadie los declaró en config, nadie
  dispara el ciclo, no hay semilla y no hay canal.
fuente: enki
dominio: proceso
tags: [enki, puesta-en-servicio, vertical, arranque, f8, config, scheduler, semilla, canal, deploy]
---

# Poner en servicio una vertical de Enki

> **F8 verifica la ENTREGA. Poner en servicio ARRANCA la OPERACIÓN.** No son lo mismo.
> `verificar-en-vivo` (F8) comprueba que cada hoja del plan tiene módulo, skill e
> interfaz operativa en disco. Eso NO enciende nada: los módulos pueden cargar y
> aun así el sistema estar muerto (sin orden de arranque, sin job que dispare el
> ciclo, sin semilla y sin canal). Poner en servicio es todo lo que va DESPUÉS.

## Regla 0 — antes de construir nada con nombre nuevo: buscar el nombre en TODOS los sitios

Antes de crear/inventar «poner en servicio», «deploy», «arranque» — buscarlo a la vez en:

```
/opt/enki/modules/cosecha/cantera/enki/     # cantera (el chat del proyecto descubre aquí)
~/.hermes/skills/enki/                      # arsenal (Hermes descubre aquí)
/home/admin/3enki/                          # repo (rama proyecto/<slug>)
/opt/enki/                                  # deploy (lo que corre de verdad)
/opt/enki/boveda/<proyecto>/proceso/estado.json   # el estado que lo declara
```

Si la única aparición es una FRASE de estado (p. ej. *"completada (vertical lista para
deploy + puesta en servicio)"*), es material NUEVO: hay que construirlo y DECIRLO así.
No inventar que existía ni fabricar un duplicado de algo que ya existe con otro nombre
(`verificar-en-vivo` ya cubre la parte de verificación de F8).

## Los seis pasos, en orden

### 1 · Escribir la skill en los TRES sitios (y hacer que la cantera la INDEXE)

Cantera (`/opt/enki/modules/cosecha/cantera/enki/<skill>/SKILL.md`), arsenal
(`~/.hermes/skills/enki/<skill>/SKILL.md`) y repo
(`/home/admin/3enki/modules/cosecha/cantera/enki/<skill>/SKILL.md`): el chat del proyecto
descubre por cantera, Hermes por arsenal, el repo es lo que viaja con el deploy.
Escribir con `chmod 664` + `chmod g+w` al directorio (el fichero nace 600 y el grupo www-data
no lo lee). Verificar que son el MISMO fichero y no tres versiones:

```bash
md5sum /opt/enki/modules/cosecha/cantera/enki/<skill>/SKILL.md \
       /home/admin/3enki/modules/cosecha/cantera/enki/<skill>/SKILL.md \
       ~/.hermes/skills/enki/<skill>/SKILL.md      # los 3 md5 IDÉNTICOS
```

**TRAMPA PAGADA EN VIVO: escribir el SKILL.md en la cantera NO la pone viva.** El índice de
`cosecha` es **in-memory** y solo se reconstruye en `onLoad` (`_descubrir()`) y tras
`cosecha.importar/crear/promover/traer/olvidar`. Un fichero recién escrito ahí NO lo ve el
módulo vivo (ni su búsqueda BM25, ni el índice semántico):

```bash
TOKEN=$(cat /opt/enki/data/.hermes-bridge-token)
curl -s http://localhost:8130/execute -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
  "event":"cosecha.obtener.request","payload":{"request_id":"ps-1","nombres":["<skill>"]}},"timeout_ms":15000}'
# status 200 con faltan:["<skill>"]  =  escrita en disco pero NO indexada (no es fallo del fichero)
```

Dos caminos a «viva»: (a) `cosecha.importar.request {fuente, skills:[{nombre,contenido}]}` —
escribe en `data/cosecha/cantera/` (la cantera CRECIDA) **y re-indexa en el acto**;
(b) reiniciar `enki.service` (re-ejecuta `onLoad`). Con (a) quedan DOS copias (semilla en
`modules/cosecha/cantera/` + crecida en `data/`) — elegir a conciencia, no por descuido.
Probar el canal MQTT UNA vez y quedarse con ese resultado; no re-verificar por bus + MCP + curl.

**MEDIDO 28-sep-2026 — re-indexar la SEMILLA exige restart.** Todas las ops que re-indexan
(`importar`, `crear`, `promover`, `traer`, `olvidar`) reescriben/borran en `data/cosecha/cantera/`
(la CRECIDA); `_descubrir()` re-escanea semilla + crecido, pero al editar **in-place** un
`SKILL.md` de la semilla (`modules/cosecha/cantera/enki/<skill>/`) el índice in-memory queda
sirviendo la versión VIEJA — y `cosecha.patch` la rechaza (409 «es semilla, no se parchea en
caliente»). Discriminador: tras corregir la semilla, `cosecha.obtener` sigue devolviendo el texto
viejo mientras el fichero en disco ya es el nuevo. Cierre: reiniciar `enki.service` (dueño).

**Tras CUALQUIER edición posterior de la skill** (una corrección, un pitfall nuevo de otra
sesión), el arsenal queda por delante: hay que **re-copiar a los 3 sitios y re-verificar el
md5**. Editar solo `~/.hermes/skills/` deja cantera y repo con la versión vieja — y el chat del
proyecto lee por CANTERA, así que seguiría aplicando el texto obsoleto sin enterarse.

### 2 · Declarar los módulos en `config.json → modules.enabled` (en orden de la espina)

Sin declarar cargan igual (el loader escanea el nivel de la vertical: `modules/<vertical>/`
sube un nivel), pero **sin orden** → sin la garantía del reloj suizo. Declarar en el orden
del `fase4.tracking.orden` del `estado.json`.

```python
import json, os
vertical = 'nichos'
orden = json.load(open(f'/opt/enki/boveda/{vertical}/proceso/estado.json'))['fase4']['tracking']['orden']
for cfg in ('/opt/enki/config.json', '/home/admin/3enki/config.json'):   # DEPLOY + REPO, los dos
    c = json.load(open(cfg))
    en = c['modules']['enabled']
    en = [s for s in en if s not in set(orden)]          # idempotente: sin duplicados
    en += [s for s in orden if os.path.isdir(f'/opt/enki/modules/{vertical}/{s}')]
    c['modules']['enabled'] = en
    json.dump(c, open(cfg, 'w'), indent=2, ensure_ascii=False)
```

Los `REUTILIZAR` del plan (scheduler, crawl4rs, filesystem, project-manager,
telegram-bridge…) **ya suelen estar** en `enabled` — no re-añadirlos.

### 3 · F8 en vivo + sellar `fase8-verificar-en-vivo`

Vea disco, no el reporte del LLM. Por slug: `module.json` + `index.js` en deploy **Y**
espejo en repo, `SKILL.md` en cantera, y coherente con su `ui_handlers`. (Ver
`verificar-en-vivo`.) Al terminar, sellar la fase:

```
proceso-negocio.completar_fase { fase: "verificado", resumen: { modulos: [...] } }
```

**DOS FRENOS REALES del gate de F8 (pagados en vivo, `nichos`, 27-sep-2026).** Ninguno es
«no está hecho» — los dos son de CONTEXTO de lectura:

**(a) El gate lee el plan del STORAGE del proyecto, no de la bóveda.** `_progresoPlan()` hace
`fs.read.request` de `esquemas/plan-construccion.md` **scopeado al `project_id`** → cae en
`data/projects/<slug>/storage/esquemas/`. El plan de F3b, en cambio, vive en la **bóveda**
(`boveda/<proyecto>/proceso/fase3b/plan-construccion.md`, la escribe el escribano) y su dir
está **plano** (`fase3b/`, `fase3/`, `fase2/`), sin la carpeta `esquemas/` que el gate espera.
Sin plan en storage → `_progresoPlan` devuelve `total:0` → **409 «No hay plan de construcción
con hojas»** aunque el plan exista y las 44 hojas estén construidas. Puente: copiar el plan a
`storage/esquemas/plan-construccion.md` **por el canal del proyecto** (no a pelo en disco):

```bash
TOKEN=$(cat /opt/enki/data/.hermes-bridge-token)
python3 - <<'PY'
import json, subprocess, re
plan=open('/opt/enki/boveda/<proyecto>/proceso/fase3b/plan-construccion.md').read()
payload={"tool_name":"bus.publishAndWait","args":{"event":"fs.write.request",
  "payload":{"project_id":"<UUID_REAL>","path":"esquemas/plan-construccion.md","content":plan},
  "timeout_ms":30000}}
t=open('/opt/enki/data/.hermes-bridge-token').read().strip()
print(subprocess.run(['curl','-s','http://localhost:8130/execute','-H',f'Authorization: Bearer ***',
  '-H','Content-Type: application/json','-d',json.dumps(payload)],capture_output=True,text=True).stdout)
PY
```

**CUIDADO — MEDIDO 28-sep-2026 (texto corregido): `project_id` en `fs.*` exige el
identificador con el que el proyecto fue ACTIVADO (el UUID), NO el slug.** `validatePath`
resuelve contra `this.projectPaths.get(project_id)` (`_projectRootFor`, `filesystem/index.js:498`),
un Map que SOLO tiene la clave de activación. Con el slug no hay entrada → `null` → cae al
`activeProjectPath` global. Consecuencia silenciosa: un `fs.write` con `project_id:"nichos"`
NO escribe en `data/projects/nichos/` sino en el proyecto ACTIVO (p.ej. `data/projects/futuro/`)
— sin error, cross-project. Discriminador limpio (solo lectura): `fs.read` del plan con el UUID
devuelve el contenido; con el slug devuelve `RESOURCE_NOT_FOUND`.

**(b) F8 exige SKILL.md en cantera para TODAS las hojas — incluidas las REUTILIZAR.** La espina
del plan lleva 49 hojas = 44 CONSTRUIR + 5 REUTILIZAR (`scheduler`, `crawl4rs`, `filesystem`,
`project-manager`, `telegram-bridge`). `_progresoPlan` recorre las 49 y `_skillEnCantera()` solo
mira `cosecha/cantera/enki/<slug>/SKILL.md` (y los prefijos `pizzepos-`/`prisma-`) → los 5
genéricos de sistema **no tienen skill en cantera** (ningún módulo de sistema genérico la tiene:
`productos`, `admin-panel`, `credential-manager`… tampoco) → `faltan_por_skill:5` → **409
«todas las hojas construidas + skill»**. Discriminar antes de tocar nada:

```bash
# ¿qué hojas de la espina NO tienen módulo y cuáles NO tienen skill en cantera?
#   sin módulo  → falta construir (de verdad)
#   sin skill   → si es REUTILIZAR genérico, es el freno (b), no deuda del vertical
```

Sellar F8 ANTES de resolver (a)+(b) es imposible: el gate rechaza con 409 y **no sella nada**
(`FASE_INCOMPLETA`). Reportar el bloqueo con el progreso exacto (`total/construidos/con_skill`)
en vez de declarar «F8 hecha».

**(b) las DOS salidas — es DECISIÓN DEL DUEÑO, no la tomes solo.** Cuando el único freno es
`faltan_por_skill` sobre hojas REUTILIZAR genéricas, hay dos caminos y NO son equivalentes:

1. **Escribir SKILL.md a los genéricos** en la cantera (~4-5 ficheros). Barato, sin tocar
   código, deja el gate contento. Contra: es material que el plan NO pidió (el módulo ya
   existía antes del vertical) y ensancha la cantera con skills de módulos de sistema que
   nadie más tiene — no resuelve la incoherencia, la tapa.
2. **Corregir el gate** en `modules/proceso-negocio/index.js`: que `_progresoPlan` exija skill
   solo a las hojas con `accion == 'CONSTRUIR'` (las `ACCIONES_CANONICAS` ya vienen en el
   bloque `enki-plan` de `_hojasDelPlan`/`extraerEspina`). Es la raíz — un módulo reutilizado
   no se construye aquí, luego no debe tener skill del vertical. Contra: toca el core.

Preséntalas las dos con su contra y **espera la orden**; no elijas por el dueño (rechaza el
«no vale» de las soluciones que tapan). Ver `references/caso-nichos.md` para el caso medido.

**RESUELTO POR LA RAÍZ (28-sep-2026 — el dueño eligió la opción 2 y se ejecutó).** El gate ya
NO exige skill a las hojas REUTILIZAR. Forma exacta del fix en
`modules/proceso-negocio/index.js` (respétala si vuelves a tocarlo):

- `_hojasDelPlan(contenido)` **sigue devolviendo un array de SLUGS (strings)** — su contrato lo
  fijan los tests de `modules/_shared/motor/test.js` (3 casos). NO devolver objetos: se rompe la
  suite. La acción va en un método NUEVO aparte:
  `_accionesDelPlan(contenido)` → `Map slug → 'CONSTRUIR'|'ADAPTAR'|'REUTILIZAR'` (leído del
  bloque `enki-plan` con `extraerEspina`; sin espina o sin `accion` → `''`).
- En `_progresoPlan`: si `accion === 'REUTILIZAR'` → `satisfecha = !!_buscarModulo(slug)` y cuenta
  `construidos++` + `con_skill++` (sin mirar la cantera). El resto (CONSTRUIR/ADAPTAR) igual que
  antes. Un REUTILIZAR sin módulo en disco es fantasma del plano, no hoja a construir.

Medido tras el fix sobre el plan de `nichos`: `total 49 · construidos 49 · con_skill 49 ·
faltan_por_construir 0 · faltan_por_skill 0`; las 5 REUTILIZAR OK; gate F8 `ok=true`
(«49 hojas verificadas en disco»). Verificación sin tocar prod:
`node ~/.hermes/skills/enki/enki-agentes-proceso/scripts/probe-gate-f8.js nichos`.

### 4 · Aprovisionar la semilla + crear el job que dispara el ciclo

**Semilla** por RPC del bus (el módulo `captura-semilla` la acepta y arranca el pipeline):

```
nichos.semilla.aceptar.request  { project_id, mensaje }   → nichos.semilla.capturada
                                                            (par de fallo: nichos.semilla.aceptar.failed, SEMILLA_VACIA)
```

Si la F0 dejó `primer_nicho` como pregunta abierta, resolverla ANTES: sin semilla el
pipeline arranca vacío (`vista-portafolio/leer` → `total_nichos: 0`).

**Job del scheduler** (`/opt/enki/data/scheduler/jobs.json`, forma `{version, savedAt, jobs[]}`).
Oblligatorios: `name` + `trigger.type` + `action.type`. Triggers: `cron`(`expression`),
`interval`(`value`), `event`(`topic`), `condition`(`check`), `datetime`, `composite`.
Para arrancar el ciclo a mano, `trigger.type='event'` suscribe el scheduler a un topic real.

### 5 · Lanzar el primer ciclo end-to-end y verificar que AVANZA

No basta con que el RPC devuelva 200. Hay que ver el nicho moverse de estado:
`SEMILLA→BUSCADO→VALIDANDO→VALIDADO→CONSTRUIDO→OPERANDO→COBRANDO→EN_CAJA|SANGRA`
(+`CORTADO`, +`OPERANDO_EN_ESPERA`). El dueño del agregado es `pipeline-por-nicho`
(único escritor); publica `nichos.pipeline.avanzado` / `ciclo_iniciado` / `ciclo_completado`.
Verificar en su storage persistido (`prisma/<vertical>/*.json`), no en la respuesta RPC.

### 6 · Canal de supervisión (decisión del dueño)

`canal-supervision` define el PUERTO; `telegram-bridge` es UNA implementación a cablear en
el sitio de despliegue (`data/bots/`, `telegram-bridge/registro.json`). Dar de alta el bot
de la vertical es decisión del dueño, no se asume.

**Camino VIVO y sin sudo, verificado 27-sep-2026 (bot `Enki_nichos_bot`):** las dos piezas se
dan de alta por el bus, y ninguna de las dos exige editar ficheros ni reiniciar `enki`:

```bash
TOKEN=$(cat /opt/enki/data/.hermes-bridge-token)
# (a) credencial → el telegram-service arranca el polling en caliente (onCredentialSaved)
curl -s http://localhost:8130/execute -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
  "event":"credential.create.request","payload":{"provider":"TELEGRAM","level":"CUSTOM",
  "identifier":"<botName>","api_key":"<TOKEN_BOTFATHER>"},"timeout_ms":15000}}'
# (b) vínculo → el bridge escribe su registro él mismo (www-data, tempfile+rename)
curl -s http://localhost:8130/execute -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
  "event":"telegram.bridge.vincular.request","payload":{"request_id":"vinc-1",
  "botName":"<botName>","project_id":"<UUID_REAL>"},"timeout_ms":15000}}'
```

Verificar en DISCO y en el bus, no en el curl: `.env` con `TELEGRAM_API_KEY_CUSTOM_<botName>`,
`registro.json` con `total vinculos` +1, y `telegram.list_bots.request` → el bot con
`polling: true`. El `project_id` es el **UUID**, jamás el slug. El primer envío fallará con
`Bad Request: chat not found` hasta que el dueño abra el bot y le escriba — eso NO es fallo del
alta. Detalle fino en la skill `telegram-por-proyecto`.

## Verificación de cierre (lo que hay que poder enseñar)

Sonda determinista lista para correr (hace los 5 bloques de una vez y devuelve exit 1 si
falta algo — declaración, hojas o job):

```bash
python3 ~/.hermes/skills/enki/poner-en-servicio/scripts/verificar-servicio.py <vertical>
python3 ~/.hermes/skills/enki/poner-en-servicio/scripts/verificar-servicio.py <vertical> --json
```

Y a mano, el resumen mínimo:

```bash
python3 - <<'EOF'
import json, os
V='nichos'
c=json.load(open('/opt/enki/config.json'))
slugs=sorted(os.listdir(f'/opt/enki/modules/{V}'))
en=set(c['modules']['enabled'])
print('declarados:', len([s for s in slugs if s in en]), '/', len(slugs))
print('jobs:', json.load(open('/opt/enki/data/scheduler/jobs.json'))['jobs'])
EOF
```

Y el primer ciclo: un `nichos.pipeline.avanzado` real observado en el bus.

Detalle medido del caso testigo (estado de partida, cifras exactas de cada paso, los dos frenos
de F8 con su salida literal y la corrección de raíz pendiente): `references/caso-nichos.md`.

## Pitfalls (pagados en vivo, vertical `nichos` 2026-09-27)

- **«Carga» ≠ «en servicio».** Los 44 módulos cargaban sin estar en `enabled` (el loader
  escanea el nivel de la vertical). Cargar sin orden no es operar.
- **`config.json` vive DOS veces** — repo (`admin:www-data 664`, hermes escribe por grupo)
  y deploy (`www-data:www-data`). Un cambio en solo uno se desincroniza en el próximo deploy.
- **F8 no arranca nada.** El mapa `proceso-negocio` termina en `'verificado'`;
  `'completado'` solo se acepta con el plan COMPLETO en disco (cuenta módulos, no cree al LLM).
- **REUTILIZAR en el plan ≠ REUTILIZAR existente.** De los 7 declarados, 2 estaban
  absorbidos por otros módulos del propio vertical (`memoria-nicho`→`historial-nicho`,
  `gestor-credenciales-nicho`→`puerto-fuente-datos`). Contar contra disco, no contra el plan.
- **Sin job, nadie dispara el ciclo.** `scheduler.jobs.json` vacío = pipeline quieto
  aunque todos los módulos estén cargados y los tests pasen.
- **Si el nicho se QUEDA en VALIDANDO (o en cualquier estado del embudo), NO es «falta un
  driver de pasadas».** La cadena se orquesta SOLA: el pipeline (`_consumir` → `_dispararSiguiente`)
  invoca la etapa siguiente de cada estado con `_rpcEtapa`. El corte real medido 28-sep-2026:
  los **módulos de la 2ª mitad del embudo** (`estudio-demanda`, `veredicto-viabilidad`,
  `camino-encontrar-construir`, `ensamblador-solucion`, `gate-decision-operar`, `motor-cobro`)
  publicaban su evento de dominio con `res.data` **SIN `nicho_id`** → el pipeline lo recibía sin
  identidad → `_transicion(pid, null, ...)` → `mapa.get(null)` → 404 `RESOURCE_NOT_FOUND` →
  `nichos.pipeline.avanzar.failed`. Solo `sondeo-territorio` propagaba bien `nicho_id`; por eso la
  cadena llegaba hasta él y ahí moría. **Discriminador (sin tocar código):** el storage del nicho
  queda `VALIDANDO` con `datos` = {semilla, territorio, candidato} y SIN `estudio`; el historial
  muestra decenas de `candidato.encontrado` repetido (cada candidato del sondeo entra a VALIDANDO
  y se queda). Prueba de vida: publicar `nichos.estudio.medido` **con `nicho_id`** → el nicho
  transiciona a VALIDADO. Fix (commit `bc1dd4ee`, 7 ficheros): `nicho_id` viaja entrada
  (`_medir`/`_evaluar`/`_decidir`/`_construir`/`_solicitar`/`_ejecutar`) → `data` → evento, y el
  pipeline lo pasa en cada `_rpcEtapa`. **OJO:** el fix puede estar COMMITEADO en el repo y el
  DEPLOY tener la versión vieja (`diff -rq repo/modules/nichos /opt/enki/modules/nichos`); propagar
  `cp` repo→deploy los 7 ficheros + `node --check` + reiniciar (sin recarga en caliente: el core
  en memoria sigue con lo viejo).
- **Sin storage no hay estado.** `prisma/<vertical>/*.json` no existe hasta el primer ciclo;
  que no exista NO es un fallo previo — se crea al arrancar.
- **La bóveda NO es el storage del proyecto.** El plan de F3b vive en
  `boveda/<proyecto>/proceso/fase3b/` (dir plano, lo escribe el escribano); el gate de F8 lo
  lee de `data/projects/<slug>/storage/esquemas/`. Dos árboles distintos: «el fichero existe»
  no significa «el gate lo ve». Copiar por `fs.write.request` con `project_id: <UUID_REAL>`.
- **`project_id` en `fs.*` exige el UUID (id de ACTIVACIÓN), NO el slug.** Medido 28-sep-2026:
  `_projectRootFor` (`filesystem/index.js:498`) mira un Map que solo tiene la clave con la que se
  activó el proyecto; un slug desconocido → `null` → fallback al `activeProjectPath` (proyecto
  ACTIVO) → **escritura cross-project silenciosa**. Discriminador: `fs.read` con el UUID devuelve
  el fichero; con el slug, `RESOURCE_NOT_FOUND`. (`telegram.bridge.vincular` también exige UUID.)
- **F8 exige skill para las hojas REUTILIZAR.** La espina incluye los genéricos de sistema
  (`scheduler`, `crawl4rs`, `filesystem`, `project-manager`, `telegram-bridge`); `_skillEnCantera`
  los busca en `cosecha/cantera/enki/` y no están (ningún módulo de sistema genérico tiene
  SKILL.md). El gate da `faltan_por_skill:N` y 409. No es deuda del vertical — es el gate
  contando hojas que no se construyen aquí.
- **El 409 de F8 no sella nada.** No hay «parcialmente verificado»: o pasa el gate (200) o
  queda en `FASE_INCOMPLETA` con el progreso exacto. Reportar `total/construidos/con_skill`.
- **El arsenal puede FALTAR aunque cantera y repo tengan el SKILL.md.** Los tres sitios NO son
  tres por defecto: una skill nacida del chat suele existir en cantera (deploy+repo) y NO en
  `~/.hermes/skills/enki/<skill>/` — y entonces Hermes NO la carga (no sale en `skills_list` ni
  `skill_view`). Comprobarlo literal (`ls ~/.hermes/skills/enki/<skill>`) antes de dar el paso 1
  por hecho; si falta, copiar `SKILL.md` + `references/` + `scripts/` a los tres y `chmod 664`
  (dirs `775`). Medido 28-sep-2026: el vertical `nichos` tenía cantera+repo con md5 idéntico pero
  el arsenal AUSENTE.
- **Resolver slug→UUID con `project.list.request`.** Devuelve `projects[]` con
  `{name, id, is_active}`; ese `id` es el UUID de ACTIVACIÓN que exigen `fs.*` y
  `telegram.bridge.vincular`. No inventarlo ni derivarlo del slug.
- **Si el nicho se queda en `CONSTRUIDO` (`nichos.solucion.construir.failed` / `SIN_ESPECIFICACION`), TAMPOCO es un driver.** Medido 28-sep-2026 tras el restart: con el fix del `nicho_id` el embudo corre entero SOLO hasta `VALIDADO→CONSTRUIDO` y ahí muere. Causa: el pipeline (`_rpcEtapa`, caso `construir`) manda `nicho` SIN `capacidades`; `ensamblador-solucion` (D1) recibe `[]`, su `_decidirQueConstruir`/`Reflejo` devuelven null → 502. Y el ensamblador NUNCA consulta `catalogo-capacidades` (D3) —aunque su propio `_doc` y el plan D1 lo dicen (`nichos.capacidad.consultar.request`)—; ni nadie puebla el catálogo con capacidades `existente` (no hay emisor de `nichos.capacidad.declarar.request`), así que nace y vive vacío. **Discriminador:** `datos` del nicho con `estudio`+`veredicto`+`camino` y estado `CONSTRUIDO`, sin `solucion`. Dos huecos de las hojas D1/D3, no del pipeline. Sonda: `grep -rn "capacidad.consultar.request" modules/nichos/*/index.js` → 0 emisores.
- **Borrar residuos por el canal, con el UUID.** `fs.delete.request {project_id, path}` borra el
  fichero (`deleted:true`) — y sufre el MISMO fallback que `fs.write`: con slug cae al proyecto
  ACTIVO y borra en el sitio equivocado (cross-project silencioso). Al barrer un arranque fallido,
  borrar en los DOS sitios (la vertical y el proyecto activo) y dejar los `.versions/` como
  respaldo (no hace falta tocarlos).
