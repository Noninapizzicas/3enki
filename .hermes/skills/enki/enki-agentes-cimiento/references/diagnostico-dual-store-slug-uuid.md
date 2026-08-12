# Diagnóstico dual-store (slug vs UUID) y persistencia partida — sesión 2026-08

Síntoma real que disparó el diagnóstico: en un proyecto recién creado el usuario
preguntó "¿dónde está el esquema?" — las bitácoras del pipeline `esquematizador-negocio`
decían `verificado:true` con "escrito en storage/esquemas/esquema.md", pero el
archivo no aparecía en el storage del proyecto por slug.

## El hallazgo

Un proyecto Enki tiene DOS raíces físicas simultáneas:

```
/opt/enki/data/projects/<slug>/      ← base_path de la BD (dir por slug)
   storage/
     prisma/pos/project-profile.json   ← lo que escribe project-profile (F0 identidad)
     esquema-obrador-pan.md            ← lo que el CHAT persiste a mano (fs scopeado)
     _destilador/ _propiocepcion.json  ← propiocepción/destilador

/opt/enki/data/projects/<uuid>/      ← fallback del filesystem + MOTOR de agentes
   storage/
     esquemas/esquema.md               ← el esquema F2 verificado por el JEFE
     agentes/bitacoras/<req>.json      ← bitácoras
```

El chat y el motor NO ven el storage del otro.

## Causa raíz (con código)

- `modules/project-manager/index.js` (comentario literal): *"Hay DOS verdades de
  dónde vive el proyecto: base_path (BD, dir por slug — puede ser NULL o quedar
  desfasado tras un rename) y data/projects/<uuid>, el fallback donde filesystem
  escribe cuando la activación no trae base_path."*
- `project.activated` lleva `project_id: realId (UUID)` + `base_path: project.base_path`.
- `modules/filesystem/index.js` `onProjectActivated`: si `base_path` → usa
  `path.join(base_path, 'storage')`; si no → fallback `projects/<project_id>`.
- `modules/conversacion/ai-agent-framework-v3/index.js` `_resolver`:
  `path.join(this.dataDir, 'projects', project_id || 'system', 'storage', ...)` —
  usa el `project_id` que recibe el pipeline (UUID si el invocador pasa el UUID).
- Puente slug↔UUID: `modules/whatsapp-bot/index.js` — `pidPorSlug`/`slugPorPid`
  desde `project.activated` con `slug = basename(base_path)`.

## Receta de diagnóstico (orden)

1. Listar proyectos y resolver slug → UUID:
   `node .claude/skills/conexion-mqtt/enki-rpc.js projects`
2. Buscar el archivo en AMBAS raíces:
   `find /opt/enki/data/projects/<slug> /opt/enki/data/projects/<uuid> -type f | sort`
3. Leer la bitácora del pipeline (imprime el path ABSOLUTO de escritura — fuente
   de verdad de dónde fue el reflejo):
   `find <proyecto>/storage/agentes/bitacoras -name '*.json' -mmin -600`
4. Cruce: bitácora dice "escrito en X" → comprobar `ls X` literal.
5. Ver el evento de activación: `grep project.activated <log>` (qué base_path trae).

## Notas

- La identidad (F0) vía `project-profile.update` quedó en el dir del SLUG
  (`prisma/pos/project-profile.json`), mientras el esquema F2 del pipeline quedó
  en el dir del UUID. Ambos "verificados" — pero en stores distintos.
- Un proyecto con `sqlite` vacío (`db/<slug>.sqlite` sin tablas) + storage partido
  = el proceso está funcionando pero la persistencia no converge.
- Los smokes del motor con `dataDir=/home/admin/3enki/data` reproducen el mismo
  split en desarrollo — revisar también ahí al depurar.

## La cadena de IDs (qué project_id viaja, con código)

1. Frontend: `project.activate` → guarda `activeProjectId = realId` (el UUID real
   devuelto por el backend — `frontend/src/lib/stores/projects.ts:251`, comentario
   "Usar el UUID real devuelto por el backend (puede diferir si 'id' era un slug)").
2. `conversation.send` manda ese UUID en `project_id` (`chat.ts:151`).
3. `prompt-builder` lo inyecta en el system prompt: "CONTEXTO ACTIVO:
   { project_id: <UUID> }" (`modules/conversacion/prompt-builder/index.js:269`).
4. El LLM del chat lo usa al llamar `invoke_agent` (chat-io reenvía `...d` tal
   cual, `onInvokeAgentBridge`) → el motor escribe en `projects/<UUID>/`.

## Punto ABIERTO (sin resolver, sesión 2026-08)

Paco afirma que "los agentes también persisten en slug, que es donde la cúpula de
proyecto está funcionando" — contradice la lectura del código (el frontend manda
UUID) y las bitácoras de "f" (motor escribió en `.../c3c89429.../storage/`).
Hipótesis plausible: el LLM del chat improvisa el slug legible en vez del UUID
del contexto al construir la llamada `invoke_agent`. Verificar en vivo: leer el
path ABSOLUTO de escritura en la bitácora más reciente de un proyecto activo y
comparar con el `project_id` que aparece en el evento `invoke_agent` del log.
