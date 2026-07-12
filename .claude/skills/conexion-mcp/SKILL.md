---
name: conexion-mcp
description: Conectar a un Enki vivo por la PUERTA GUARDADA — el Portal MCP — vía MQTT sobre WebSocket Secure (443). RPC ui/request/portal/{health|list_tools|call} contra modules/portal, que aplica el guard (interruptor, scope, mode, allowlist, confirmación, audit). Los dos interruptores del portal los manda el DUEÑO desde la UI de Enki (panel Interruptores); la skill los lee y obedece — degrada honesto, jamás los puentea.
when-to-use: Cuando hace falta operar el Enki vivo desde fuera del VPS entrando por la puerta auditada — ejecutar tools del sistema (fs.read, productos.carta_completa, …) con scope/mode vigilados y cada acceso registrado (portal.invocado). Preferir SIEMPRE esta puerta sobre conexion-mqtt cuando la tool que necesitas está expuesta tras el guard; la puerta directa queda para lo que el portal no expone (dominios ui/request como project/conversation) o para diagnóstico.
---

# conexion-mcp

Hablar con un Enki **vivo** por la **puerta guardada**: el Portal MCP. La skill hermana
`conexion-mqtt` entra por el camino directo del frontend (sin guard, poder total);
esta entra por `modules/portal`, donde vive el GUARD — cada llamada pasa interruptor,
scope, mode, allowlist y confirmación, y queda **auditada** (`portal.invocado` →
propiocepción). El poder es el mismo (`executeTool` sobre el registry); lo que cambia
es que aquí hay llave, testigo y freno.

## Los botones los manda el dueño (UI de Enki → Interruptores)

Dos interruptores gobiernan la puerta — **se encienden y apagan desde el panel de
Interruptores de la UI de Enki**, no desde esta skill. La skill los LEE (`health`)
y obedece lo que digan:

```
Portal MCP (puerta de entrada externa)   ON  → la puerta existe: list_tools + call responden
                                         OFF → puerta CERRADA: catálogo vacío + call 503 PORTAL_CERRADO
Portal MCP · escritura                   ON  → mode=write: se exponen y ejecutan mutaciones (dentro del scope)
                                         OFF → mode=read: solo tools de LECTURA (mutación → 403)
```

Si una llamada devuelve 503/403, la respuesta correcta es **decirle al humano qué
botón está apagado** — nunca buscar otro camino para hacer lo mismo sin guard.

## El gotcha del transporte (heredado de conexion-mqtt)

Desde un contenedor cloud aislado solo sale **HTTPS/443** → el broker es
**`wss://<host>/mqtt`** (MQTT sobre WebSocket Secure). `mqtt://host:1883` NO conecta.

```bash
timeout 5 bash -c 'echo > /dev/tcp/enki-ai.online/443' && echo "443 SALE" || echo "443 bloqueado"
```

## Contrato (JSON)

```json
{
  "transporte": "wss://enki-ai.online/mqtt (override: ENKI_BROKER, p.ej. wss://pizzepos.es/mqtt)",
  "rpc": {
    "health":     { "req": "ui/request/portal/health {}", "resp": "{activo, write, mode, scope, project_id, allowlist}" },
    "list_tools": { "req": "ui/request/portal/list_tools {project_id?}", "resp": "{tools:[{name,description}], total, mode, scope} | {tools:[], cerrado:true}" },
    "call":       { "req": "ui/request/portal/call {tool, args?, project_id?, confirmado?}", "resp": "{tool, result}" }
  },
  "guard_errores_canonicos": {
    "503 PORTAL_CERRADO":     "interruptor 'Portal MCP' OFF → pedir al dueño que lo encienda (UI → Interruptores)",
    "403 PERMISSION_DENIED":  "tool fuera de scope/mode → si es mutación con escritura OFF, pedir el botón 'Portal MCP · escritura'",
    "409 NEEDS_CONFIRMATION": "tool con confirmation:true → reintentar con confirmado:true SOLO tras visto bueno humano",
    "400 write_sin_proyecto": "mutación en scope=project exige project_id resuelto",
    "404 RESOURCE_NOT_FOUND": "la tool no existe en el registry (list_tools para ver el catálogo permitido)"
  },
  "identidad_de_la_skill": "SOLO la puerta guardada — resolver nombre→UUID de proyecto o dominios ui/request (project/conversation/…) es oficio de conexion-mqtt",
  "una_conexion": "withConnection() conecta 1 vez → N llamadas → cierra"
}
```

## Cómo se usa (helper incluido)

`enki-portal.js` (en esta carpeta) abre UNA conexión y cierra al terminar. Requiere
la dep `mqtt` del repo — exporta `NODE_PATH` si no resuelve:

```bash
cd <repo>                        # 2enki
export NODE_PATH="$PWD/node_modules"
S=.claude/skills/conexion-mcp/enki-portal.js
export ENKI_BROKER=wss://pizzepos.es/mqtt        # o el host que toque

node "$S" health                                   # estado del guard (¿qué botones están ON?)
node "$S" tools                                    # catálogo permitido tras el guard
node "$S" tools carta                              # …filtrado por regex
node "$S" call productos.carta_completa '{}' --project <uuid>     # tool de lectura
node "$S" call fs.read '{"path":"/pizzepos/marca.json"}' --project <uuid>
node "$S" call fs.delete '{"path":"/tmp/x"}' --project <uuid> --confirmado   # tras visto bueno humano
```

Los logs van a **stderr**; la respuesta JSON a **stdout** (pipeable). `--project`
inyecta `project_id` (UUID — para resolver un nombre usa `conexion-mqtt: project <nombre>`).
`--confirmado` añade `confirmado:true` (solo con permiso explícito del humano).

ENV: `ENKI_BROKER`/`AUDIT_BROKER` (default `wss://enki-ai.online/mqtt`) ·
`ENKI_RPC_TIMEOUT` (ms por RPC, default 15000).

## Pseudocódigo (el núcleo)

```
FUNCION operar(tarea):
  h ← rpc('portal','health',{})                        // SIEMPRE primero: leer los botones
  SI !h.activo:      RETORNA avisar("interruptor 'Portal MCP' OFF — pídelo al dueño")
  SI tarea.muta Y h.mode != 'write':
                     RETORNA avisar("'Portal MCP · escritura' OFF — pídelo al dueño")

  catalogo ← rpc('portal','list_tools',{project_id})   // lo que el guard deja ver
  tool     ← catalogo.match(tarea)                     // elegir del catálogo, no adivinar

  r ← rpc('portal','call',{tool, args, project_id})
  SI r.status == 409:                                  // confirmación: el freno humano
      SI humano.confirma(): r ← rpc('portal','call',{tool, args, project_id, confirmado:true})
      SINO: RETORNA abortar
  RETORNA r.data.result                                // cada llamada quedó auditada (portal.invocado)
```

## Garantías y límites

- **El guard vive en el servidor** (`modules/portal`), no en esta skill: aunque el
  helper se use mal, la puerta no deja pasar lo que los botones prohíben.
- **Cada acceso deja huella**: `portal.invocado {tool, ok, duracion_ms, scope, mode}`
  — ningún acto-puerta invisible.
- **Scope=project**: el portal inyecta/valida `project_id` y no expone tools de
  sistema (db·module·interruptor·plugin·code·security·…). Cross-project = scope
  system, que se abre desde el servidor, no desde aquí.
- **Best-effort de red**: si 443 no sale o el broker calla, falla limpio (timeout).
- **No sustituye a `conexion-mqtt`**: los dominios ui/request (project, conversation,
  carta-marketing, …) no son tools del registry — siguen entrando por la hermana.
