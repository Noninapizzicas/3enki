# Caso testigo — filesystem vs device-health (FASE 6 · decidir-interfaz)

> Segundo corte: dos módulos del tipo `system_panel` con forma interna distinta.
> Validan que la FASE 6 clasifica por ROL: los dos son gestión/sistema bajo
> demanda → los dos `system_panel`, aunque uno es un CUSTODIO con 15 handlers
> SIN_TIPO (filesystem) y el otro un OBSERVADOR con 3 (device-health).

---

## 📦 filesystem — prisma sobre su interfaz

**1 · IDENTIDAD** — Operaciones de filesystem para todo el sistema, scopeado por
project_id (multi-tenant). Trabajo que resuelve: el operador (humano o agente)
lista, lee, escribe, edita, borra y mueve archivos del proyecto sin salir del
frame.

**2 · RESTRICCIONES (duras)** — Multi-tenant estricto: el acceso se scopea por el
project_id de la PETICIÓN, no por sesión global. Cero cache de contenidos. El
contrato frontend: 4 tipos canónicos, zone ∈ 5 zonas + lateral, sin modales.

**3 · CONTRATO** — 15 acciones (list · read · write · edit · delete · mkdir ·
move · copy · search · info · cleanup · stats · set/get_work_dir). Es el
CUSTODIO del fs: 21 subscribes (fs.*.request, archivo.*.solicitado) y 27
publishes (fs.file.created/updated/deleted, fs.escritura.ajena).

**4 · NO-OBJETIVOS** — No es un gestor de documentos de negocio (facturas tiene
su propia UI), no es el editor de texto (`text-editor`), no expone el árbol del
sistema (solo el scope del proyecto activo).

**5 · PREGUNTAS ABIERTAS** — ¿El operador humano necesita ver el árbol completo
en el panel, o el panel es solo para operaciones puntuales? ¿Los
fs.*.request internos (los consume el motor de agentes) necesitan superficie o
son solo bus?

**Disección → 1 pieza `system_panel`**: gestión/sistema bajo demanda, lateral
derecha. El humano NO trabaja en el fs a diario — lo consulta/opera cuando
falla algo o hay que tocar archivos. Forma: árbol del proyecto activo (reflejo:
list/read/search) + operaciones (write/edit/delete/move) + stats.

## 📦 device-health — prisma sobre su interfaz

**1 · IDENTIDAD** — Observador puro de la flota IoT: uptime, alertas (offline
prolongado, reconnect-loops, OTA fallidos) y reportes periódicos. NO toma
acciones correctivas.

**2 · RESTRICCIONES (duras)** — Observador puro: jamás muta, solo observa. Las
alertas cruzan proyectos (health.report agrega across-projects, sin project_id).
Contrato frontend igual.

**3 · CONTRATO** — 3 acciones (dashboard · device-history · alerts). 4 subscribes
(device.online/offline, firmware.ota_failed/completed) → 4 publishes
(health.alert.*, health.report). Su estado ES el bus: alertas + historial.

**4 · NO-OBJETIVOS** — No gestiona dispositivos (device-registry), no flashea
(esp32-flasher), no toma acciones correctivas (eso lo haría otro módulo). Es
SOLO la vista de salud.

**5 · PREGUNTAS ABIERTAS** — ¿Las alertas activas deben destacarse (badge en el
lateral) o el panel se consulta bajo demanda? ¿El historial por dispositivo
necesita búsqueda o basta con la lista cronológica?

**Disección → 1 pieza `system_panel`**: gestión/sistema bajo demanda, lateral
derecha. El humano lo consulta cuando algo falla: resumen de flota (dashboard),
historial por dispositivo (device-history), alertas (alerts). Forma: panel de
diagnóstico vivo, suscrito a health.*.

---

## La respuesta a la pregunta "¿qué interfaz nos beneficia?"

A ambos les beneficia un `system_panel` — gestión/sistema bajo demanda, no
trabajo diario (workspace_module), no acción puntual desde el chat (chat_tool),
no contenido en el flujo (inline_render). La diferencia de forma interna (15
handlers de custodio vs 3 de observador) NO cambia el tipo: cambia la densidad
del panel — filesystem es un panel con árbol + operaciones; device-health es un
panel de diagnóstico.

**Hallazgo fino del prisma**: los 18 handlers de ambos (15+3) están SIN_TIPO.
El drift no distingue "custodio grande" de "observador pequeño" — los pilla a
los dos. La FASE 6 no solo asigna tipo: liquida el drift con la misma pasada.

## Datos crudos (module.json real)

- filesystem: 15 ui_handlers SIN_TIPO · 15 tools · 21 subscribes · 27 publishes
  (fs.*) — CUSTODIO multi-tenant
- device-health: 3 ui_handlers SIN_TIPO · 3 tools · 4 subscribes · 4 publishes
  (health.*) — OBSERVADOR puro
