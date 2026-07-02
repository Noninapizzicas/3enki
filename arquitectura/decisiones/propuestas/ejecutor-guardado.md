# ejecutor — la puerta guardada para EJECUTAR (skill CLI → shell, con reja)

> Frontier que cierra: *usar* una skill (defuddle y cualquier CLI) desde un turno de chat, con
> reja. Nace de auditar Hermes (NousResearch/hermes-agent) y de la lección de la sesión: el LLM no
> debe tocar el ejecutor crudo; todo pasa por UNA puerta guardada. Enki ya tiene las dos mitades —
> `code-executor` (crudo) + `portal` (patrón de guard); el `ejecutor` las casa para shell y añade
> lo que Hermes enseña: aprobación graduada por bus + aislamiento enchufable. DISEÑO, no código.

## La tríada de Hermes, mapeada a Enki

```
Hermes:   terminal_tool()  →  check_all_command_guards()  →  BaseEnvironment.execute()
Enki:     ejecutor(reflejo) →  _guard() [portal-shape]     →  code-executor / aislamiento
          el LLM llama aquí     la reja, ANTES               el ejecutor crudo (nunca directo)
```

Lo que ya tenemos y reusamos (cero invención):
- **code-executor** (2.2.0): `shell.exec` + `_checkCommandSafe` (blockedCommands + blockedPatterns) = la hardline blocklist de Hermes, ya escrita. El ejecutor NO reimplementa exec: delega aquí (o en aislamiento).
- **portal** (guard-shape): interruptor OFF-por-defecto · scope · mode read/write · allowlist (Set) · `confirmation` · audit `portal.invocado` · `onInterruptorCambiado` en caliente. El `_guard` del ejecutor es este patrón.
- **interruptores**: el panel on/off (registrar/cambiado).
- **propiocepción**: capta `ejecutor.invocado` → audit gratis ("ningún acto sin testigo").
- **el nervio** (ai-gateway) + patrón conserje/empujón: surfacea la aprobación pendiente en el chat.

Lo NUEVO (lo que Hermes aporta y no teníamos):
1. **Aprobación GRADUADA humana-en-el-lazo, por bus** (`once/session/always/deny`) — vs. el on/off binario del portal.
2. **Aislamiento como estrategia enchufable** (`local` | `contenedor`) — Enki no tiene ninguna abstracción de aislamiento hoy.

## Contrato (JSON)

```json
{
  "esquema": "ejecutor-guardado-v1",
  "puerta_unica": "ejecutor.ejecutar.request → .response (el LLM llama AQUÍ, nunca shell.exec)",
  "request": {
    "command": "String (el comando; p.ej. 'defuddle parse <url> -m')",
    "project_id": "String (scope: corre en el workspace de ESE proyecto)",
    "cwd": "String? (relativo al proyecto)",
    "timeout_ms": "Int? (≤ maxTimeout)",
    "aislamiento": "'local' | 'contenedor' (default por politica: no-confiable→contenedor)",
    "motivo": "String? (por qué — para el humano que aprueba y para el audit)",
    "aprobacion_id": "String? (si reintenta tras aprobar, trae el veredicto ya concedido)",
    "correlation_id": "String"
  },
  "response_ok":       { "ok": true,  "stdout": "…", "stderr": "…", "exit_code": 0, "duracion_ms": 0, "veredicto": "permitido|allowlist|aprobado" },
  "response_bloqueo":  { "ok": false, "status": 403, "veredicto": "hardline",  "motivo": "…" },
  "response_pendiente":{ "ok": false, "status": 202, "veredicto": "pendiente_aprobacion", "aprobacion_id": "…", "motivo": "…" },
  "response_apagado":  { "ok": false, "status": 503, "veredicto": "puerta_cerrada", "motivo": "interruptor 'ejecutor' OFF" },
  "response_denegado": { "ok": false, "status": 403, "veredicto": "denegado", "motivo": "el humano denegó / timeout de aprobación (fail-closed)" }
}
```

## La cadena del guard (orden EXACTO — de Hermes)

```
_guard(command, project_id, aislamiento) → Veredicto:
  1. KILL-SWITCH   interruptor 'ejecutor' OFF → puerta_cerrada (503)          [como portal-mcp]
  2. HARDLINE      _checkCommandSafe del code-executor lo bloquea → hardline   NINGUNA aprobación anula
                   (rm -rf /, mkfs, dd a /dev/sd*, fork bomb, shutdown…)
  3. ALLOWLIST     command casa un glob de config.allowlist ('defuddle *', 'npx skills *') → allowlist (auto)
  4. YA-APROBADO   aprobacion_id válido, o (project,patrón) en cache session/always → aprobado
  5. PELIGROSO?    _esPeligroso(command) (curl|sh, rm -r, > /dev, sudo…) O no-allowlisted →
                   pendiente_aprobacion (202): abre aprobación por bus (paso siguiente)
  6. resto trivial → permitido
```

## Aprobación graduada por bus (el `publishAndWait` que ya dominamos)

```
Hermes bloquea el worker en un threading.Event; en el bus es NATIVO:

  ejecutor  →  publish 'ejecutor.aprobacion.request' { aprobacion_id, project_id, command, motivo }
  nervio    →  lee la aprobación pendiente y la SURFACEA en el chat (patrón conserje.empujon):
               "Para <tarea> quiero ejecutar: `defuddle parse …`. ¿Lo autorizas? (una vez / esta sesión / siempre / no)"
  humano    →  publish 'ejecutor.aprobacion.response' { aprobacion_id, veredicto: once|session|always|deny }
  ejecutor  →  el publishAndWait interno resuelve; cachea si session/always (por project+patrón)

  TIMEOUT (sin respuesta humana en N) → deny (FAIL-CLOSED, seguro).
```

## Aislamiento como estrategia (interfaz mínima de Hermes: 2 métodos)

```
INTERFAZ Aislamiento {
  ejecutar(command, cwd, timeout): { stdout, stderr, exit_code }
  limpiar(): void
}
  ├─ AislamientoLocal      → delega en code-executor.shell.exec (corre en el host)
  └─ AislamientoContenedor → `docker run --rm --network … -v <workspace>:/w -w /w <img> bash -c <cmd>`
                             (cap-drop, no-new-privileges, límites — como DockerEnvironment de Hermes)

POLÍTICA por defecto: command no-confiable (input externo, URL) → contenedor ; tool confiable → local.
```

## Audit → propiocepción (ningún acto invisible)

```
tras ejecutar (o bloquear/denegar): publish 'ejecutor.invocado'
  { project_id, command, veredicto, ok, exit_code?, duracion_ms, aislamiento }
→ la propiocepción lo capta → el LLM queda CONSCIENTE de lo que se ejecutó, sin haberlo controlado.
```

## El nervio (ai-gateway): el LLM usa `ejecutor`, no `shell.exec`

```
Sección de la cantera (ya existe) + una línea: "Para EJECUTAR el comando que una skill te indica
(p.ej. una CLI), usa bus.publishAndWait('ejecutor.ejecutar.request', {command, project_id, motivo}).
NUNCA shell.exec directo. Si vuelve status 202 (pendiente), el usuario debe aprobar; NO reintentes
en bucle. El veredicto/salida es del reflejo — no inventes que ejecutaste."
```
Y el split que Hermes zanja: **la skill (lente) dice el QUÉ/CUÁNDO; el ejecutor guardado hace el CÓMO.**
La skill NO auto-ejecuta código (evitamos el `expand_inline_shell` de Hermes: todo por la única puerta).

## Modelo OOP

```
CLASE Ejecutor HEREDA ModuloHibridoReflejo {
  activo: Boolean                    // interruptor 'ejecutor' (OFF por defecto)
  allowlist: Set<glob>               // config
  aprobadas: Map<`${project}::${patrón}`, 'session'|'always'>   // cache de veredictos
  pendientes: Map<aprobacion_id, {resolver, project_id, command, ts}>
  aislamientos: { local: AislamientoLocal, contenedor: AislamientoContenedor }

  onEjecutarRequest → _atender → _ejecutar(d):
    v ← _guard(command, project_id, aislamiento)
    SEGÚN v:
      puerta_cerrada|hardline|denegado → responde el bloqueo + audit
      pendiente_aprobacion → _pedirAprobacion (publishAndWait bus, timeout→deny) ; si aprueba → sigue
      permitido|allowlist|aprobado → aislamiento[tipo].ejecutar(...) → audit → response_ok
  onAprobacionResponse → resuelve el pendiente + cachea session/always
  onInterruptorCambiado(id='ejecutor') → this.activo   (en caliente, como portal)
  _guard / _esPeligroso / _matchAllowlist   (reflejo puro, determinista)
}
```

## Guardas / invariantes (P0, en positivo)

```
- UNA PUERTA: el chat entra por ejecutor.ejecutar; shell.exec queda para uso interno de reflejos.
- HARDLINE MANDA: ni allowlist ni aprobación anulan la blocklist dura (rm -rf /, etc.).
- FAIL-CLOSED: sin aprobación (timeout/deny) → no se ejecuta. El silencio no autoriza.
- TESTIGO SIEMPRE: todo intento (ok, bloqueo, denegado) emite ejecutor.invocado → propiocepción.
- HONESTIDAD (de Hermes, literal): la reja para ERRORES COOPERATIVOS, no output adversarial.
  La contención real de input no-confiable = aislamiento='contenedor'. La reja NO se disfraza de sandbox.
- SCOPE: corre en el workspace del project_id; no sale de él (como scope=project del portal).
```

## Edge-cases pertinentes

```
- interruptor OFF a mitad de una aprobación pendiente → se cancela (deny).
- comando de fondo / largo → v1 síncrono con timeout; background reusa code-executor.background (follow-up).
- aislamiento='contenedor' pero docker no está en el VPS → degrada HONESTO (503 'aislamiento no disponible'),
  NO cae a local en silencio (sería saltarse la contención pedida).
- aprobación 'always' de un patrón peligroso → se guarda por project (no global); revisable/olvidable.
- el LLM ignora el 202 y reintenta en bucle → el nervio le dice "no reintentes; espera aprobación".
```

## Orden de construcción (el riesgo se abre de a poco — como el Portal)

```
FASE 1  ejecutor + _guard + allowlist + audit + AislamientoLocal + aprobación por bus.
        interruptor 'ejecutor' OFF por defecto. Aislamiento SOLO local (la reja = protección de
        errores cooperativos, honesta). Nervio apunta al ejecutor. → desbloquea usar skills CLI.
FASE 2  AislamientoContenedor (docker) para input no-confiable — la contención real.
FASE 3  cantera escribible en-turno (cantera.crear/patch con read-before-write + freno) — la
        auto-generación/mejora que hoy solo DETECTAMOS (destilador) pasa a poder escribirse con freno.
```

## Decisiones abiertas (para cerrar antes de código)

```
1. ¿Fase 1 solo local (recomendado: sí — la reja+aprobación+audit ya es el salto; contenedor = fase 2)?
2. Timeout de aprobación → deny (recomendado: sí, fail-closed).
3. ¿La aprobación se surfacea por el canal del conserje (empujón) o un canal propio (recomendado: propio,
   'ejecutor.aprobacion.pendiente', para no competir con los empujones del conserje)?
```
