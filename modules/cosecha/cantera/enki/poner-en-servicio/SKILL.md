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
curl -s http://localhost:8130/execute -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
  "event":"cosecha.obtener.request","payload":{"request_id":"ps-1","nombres":["<skill>"]}},"timeout_ms":15000}'
# status 200 con faltan:["<skill>"]  =  escrita en disco pero NO indexada (no es fallo del fichero)
```

Dos caminos a «viva»: (a) `cosecha.importar.request {fuente, skills:[{nombre,contenido}]}` —
escribe en `data/cosecha/cantera/` (la cantera CRECIDA) **y re-indexa en el acto**;
(b) reiniciar `enki.service` (re-ejecuta `onLoad`). Con (a) quedan DOS copias (semilla en
`modules/cosecha/cantera/` + crecida en `data/`) — elegir a conciencia, no por descuido.
Probar el canal MQTT UNA vez y quedarse con ese resultado; no re-verificar por bus + MCP + curl.

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

**Pitfall:** `data/projects/<slug>/storage/proceso-negocio/` puede tener solo
`fase0-...json`. Eso NO significa que F2-F7 no estén hechas — viven en la bóveda del repo
y en el rail. No confundir «no hay archivo de fase» con «no está hecho».

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
curl -s http://localhost:8130/execute -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
  "event":"credential.create.request","payload":{"provider":"TELEGRAM","level":"CUSTOM",
  "identifier":"<botName>","api_key":"<TOKEN_BOTFATHER>"},"timeout_ms":15000}}'
# (b) vínculo → el bridge escribe su registro él mismo (www-data, tempfile+rename)
curl -s http://localhost:8130/execute -H "Authorization: Bearer $TOKEN" \
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
- **Sin storage no hay estado.** `prisma/<vertical>/*.json` no existe hasta el primer ciclo;
  que no exista NO es un fallo previo — se crea al arrancar.
