---
id: sistema-nervioso/ejecutor
dominio: sistema
resumen: Ejecución guardada: kill-switch, hardline, allowlist, aprobación graduada, audit, aislamiento en contenedor con degradación honesta.
fuentes:
  - modules/ejecutor/**
verificado: 2026-07-06
---

# EJECUTOR — la puerta guardada de EJECUCIÓN (usar la skill · nace de auditar Hermes · vivo, 2026-07-02)

> La frontera que cierra: **USAR** una skill (defuddle y cualquier CLI → shell) con reja. El LLM llama
> `ejecutor.ejecutar`, NUNCA `shell.exec` crudo. Casa lo que Enki ya tenía —code-executor (crudo) +
> portal (patrón de guard)— y añade lo que Hermes enseña: **aprobación graduada + audit +
> aislamiento**. Lección literal de Hermes: *la única frontera de seguridad contra un LLM adversarial
> es el SO; la reja en-proceso es para errores COOPERATIVOS, no para contener input hostil*. Por eso
> DOS guardianes: la reja (mi error de buena fe) y el CONTENEDOR (input no-confiable). Skill = CONTEXTO
> (lente); EJECUCIÓN = herramienta guardada aparte (Hermes lo zanjó: no auto-correr el código de una skill).

## Contrato (JSON)

```json
{
  "esquema": "ejecutor-guardado-v1",
  "tesis": "conservador EN PROPORCIÓN A LA IRREVERSIBILIDAD — no en general (asimetría: comando malo = catastrófico e irreversible · comando bueno bloqueado = un reintento)",
  "puerta_unica": "ejecutor.ejecutar.request { command, project_id, cwd?, timeout_ms?, confirmado?, recordar?, aislamiento? }",
  "cadena_del_guard": [
    { "1": "KILL-SWITCH", "regla": "interruptor 'ejecutor' OFF por defecto → puerta_cerrada (503). Poder de ejecución = decisión consciente del humano" },
    { "2": "HARDLINE",    "regla": "blocklist dura (rm -rf /, mkfs, dd of=/dev/sd, fork bomb, shutdown) → 403. NINGUNA aprobación la anula" },
    { "3": "ALLOWLIST",   "regla": "globs de config (defuddle *, npx skills *, node *, cat *, ls *…) → auto permitido (sin fricción en lo rutinario)" },
    { "4": "YA-APROBADO", "regla": "cache `${project}::${patrón}` (session|always) → aprobado" },
    { "5": "PELIGROSO?",  "regla": "patrón (curl|sh, rm -r, sudo, chmod -R, dd, >/dev, git push, kill) → si !confirmado: 202 pendiente_aprobacion + emite ejecutor.aprobacion.pendiente. Humano dice sí → LLM reintenta confirmado:true (NO en bucle)" },
    { "6": "benigno",     "regla": "resto → permitido" }
  ],
  "aislamiento": {
    "local":      "child_process.exec en el workspace del proyecto (Fase 1)",
    "contenedor": "docker run --rm efímero, sin privilegios (Fase 2) — la contención REAL de input no-confiable",
    "honestidad": "aislamiento=contenedor ∧ !dockerOk → 503 'aislamiento_no_disponible'. JAMÁS cae a local en silencio (sería fingir un sandbox que no hay — Hermes)"
  },
  "audit": "ejecutor.invocado { project_id, command, veredicto, ok, exit_code?, duracion_ms?, aislamiento } → la propiocepción lo capta (ningún acto invisible)",
  "honestidad_del_veredicto": "el veredicto lo pone el GUARD (reflejo), no la prosa del LLM = peldaño 3 de la escalera de determinismo (el LLM no puede mentir sobre lo que ejecutó)"
}
```

## Pseudocódigo (clases tipadas)

```
CLASE EjecutorModule HEREDA ModuloHibridoReflejo {   // reflejo PURO — el chat entra por aquí
  ATRIBUTOS {
    activo            : Boolean = false        // interruptor 'ejecutor' — OFF por defecto (nace apagado)
    allowlist         : Array<RegExp>          // globs de config → auto
    aprobadas         : Map<`${project}::${patrón}`, 'session'|'always'>
    dockerOk          : Boolean                // probado UNA vez en onLoad (docker version)
    contenedorImagen  : 'node:20-slim' · contenedorMemoria : '512m' · contenedorPidsLimit : 256
  }
  CONSTANTES { HARDLINE : Array<RegExp> (catastrófico) · PELIGROSO : Array<RegExp> (pide visto bueno) }

  onLoad(ctx):
    activo ← config.enabled_default === true    // false
    allowlist ← config.allowlist.map(globToRe)
    dockerOk ← _probarDocker()                  // best-effort: ¿docker en este host?
    _registrarBoton()                           // interruptor 'ejecutor', grupo 'sistema', OFF

  onInterruptorCambiado(e): SI e.id=='ejecutor': activo ← !!e.enabled   // on/off EN CALIENTE
  onEjecutarRequest(e): _atender(e, 'ejecutar', 'ejecutor.ejecutar.response', d → _ejecutar(d))

  _ejecutar({ command, project_id, cwd, timeout_ms, confirmado, recordar, aislamiento }):
    v ← _guard(cmd, { project_id, confirmado, recordar })
    SI v.veredicto == 'puerta_cerrada'      : _audit(...) ; RETORNA 503
    SI v.veredicto == 'hardline'            : _audit(...) ; RETORNA 403
    SI v.veredicto == 'pendiente_aprobacion': _emitirPendiente(...) ; _audit(...) ; RETORNA 202
    modo ← aislamiento=='contenedor' ? 'contenedor' : 'local'
    SI modo=='contenedor' ∧ !dockerOk      : _audit(...,'aislamiento_no_disponible') ; RETORNA 503   // HONESTO
    res ← modo=='contenedor' ? _ejecutarContenedor(cmd,dir,timeout) : _ejecutarLocal(cmd,dir,timeout)
    _audit(project_id, cmd, v.veredicto, res.exit_code==0, res.exit_code, duracion_ms, modo)
    RETORNA 200 { ok, veredicto, stdout, stderr, exit_code, duracion_ms, aislamiento: modo }

  _guard(cmd, { project_id, confirmado, recordar }):   // DETERMINISTA — orden EXACTO de Hermes
    SI !activo: RETORNA 'puerta_cerrada'
    PARA re EN HARDLINE: SI re.test(cmd): RETORNA 'hardline'
    SI _matchAllowlist(cmd): RETORNA 'allowlist'
    key ← `${project_id}::${_patron(cmd)}`      // patrón = primeras 2 palabras (cache por patrón)
    SI aprobadas.has(key): RETORNA 'aprobado'
    SI _esPeligroso(cmd):
        SI confirmado: SI recordar∈{session,always}: aprobadas.set(key,recordar) ; RETORNA 'aprobado'
        RETORNA 'pendiente_aprobacion'
    RETORNA 'permitido'

  _ejecutarContenedor(cmd, cwd, timeout):        // la contención REAL — efímero, sin privilegios
    docker run --rm -i --cap-drop ALL --security-opt no-new-privileges
      --pids-limit N --memory 512m -v ${cwd}:/work -w /work node:20-slim bash -lc <cmd>
    // red ABIERTA (defuddle necesita fetch); contención = fs + caps + pids + memoria, no red

  _probarDocker(): TRY execFileSync('docker',['version'...]) → true ; CATCH → false
}
```

## Aprovisionamiento docker (VPS · opt-in, decisión consciente)

```
deployment/vps-setup.sh  flag --docker (NO env var: sudo limpia el entorno → ENKI_ENABLE_DOCKER no llega)
  sudo ./deployment/vps-setup.sh <dominio> --docker
  → apt install docker.io · systemctl enable --now docker · usermod -aG docker www-data · docker pull node:20-slim
GATE  dockerOk se prueba en onLoad → tras instalar hay que systemctl restart enki (toma el grupo docker + re-proba)
SANDBOX systemd  ProtectSystem=strict + NoNewPrivileges NO bloquean el CLI (solo se CONECTA al socket, sin escribir fs ni privilegios) — verificado en vivo
```

## Topics / eventos

```
ejecutor.ejecutar.request → .response   { ok, veredicto, stdout, stderr, exit_code, duracion_ms, aislamiento } (200) · puerta_cerrada (503) · hardline (403) · pendiente_aprobacion (202) · aislamiento_no_disponible (503)
ejecutor.aprobacion.pendiente { aprobacion_id, project_id, command, motivo }   (el nervio ai-gateway lo surfacea)
ejecutor.invocado { project_id, command, veredicto, ok, exit_code?, duracion_ms?, aislamiento }   (AUDIT → propiocepción)
interruptor.registrar {id:'ejecutor', grupo:'sistema', default:OFF} · interruptor.cambiado → onInterruptorCambiado
```

## Estado

```
✓ Fase 1 (v0.1.0) — puerta guardada: kill-switch·hardline·allowlist·aprobación graduada·audit. Ejecución local.
✓ Fase 2 (v0.2.0) — aislamiento en contenedor (docker run efímero) + degradación HONESTA a 503. Aprovisionamiento --docker.
✓ Fase 3         — cantera escribible en-turno (cosecha crear/patch, anti-wipe + FRENO-422).
TESTS  ejecutor__guard (15: kill-switch·hardline-incl-confirmado·allowlist·202·confirmado→corre·cache·benigno·audit·contenedor-no-docker→503-sin-fallback·contenedor-con-docker→corre·hardline-en-contenedor).
VERIFICADO EN VIVO (Pacoo · wss://enki-ai.online/mqtt)  batería del guard OK · Fase 2: local→hostname 'ubuntu' vs contenedor→hostname 'fc1237aa4a74' (id de contenedor efímero, aislamiento:'contenedor') → aislamiento real confirmado. ejecutor restaurado OFF.
PENDIENTE (opcional)  probar por el CHAT real (LLM de página llama ejecutor para correr defuddle end-to-end, con aprobación surfaceada).
```

> **Trade-off vivo.** Conservador de más = fricción (si cada defuddle pide aprobación, el asistente es
> inútil). Por eso la allowlist corre lo rutinario solo y la aprobación graduada cachea el "sí". La reja
> se GRADÚA: dura donde el daño es irreversible, suelta donde la operación es acotada. Leer es libre; conceder
> poder que no se retira cerrando una conexión (encender el interruptor) es la mano del humano.
