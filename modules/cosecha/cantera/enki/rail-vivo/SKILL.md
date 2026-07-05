---
name: rail-vivo
description: Cuando una conversación o un trabajo tiene VARIOS PASOS y hay que sostener el rumbo entre turnos — una lista de tareas, la compra, notas sueltas, un pedido con proceso (recibe→prepara→cobra), o "vamos por partes: 1º, 2º, 3º". En vez de llevar el plan en la memoria del hilo (que deriva), lo escribes como ESTADO en la cúpula de estados: el nervio inyecta la lista ACTIVA cada turno y el asistente lleva el rumbo leyéndolo, no recordándolo. Un chef's list continuo: fichas entrando (falta) y saliendo (hecho).
fuente: enki
dominio: estados
tags: [rail, estado, lista, tareas, compras, notas, proceso, rumbo, timon, cupula, chef-list, orden]
---

# Rail vivo — el estado es el timón

Da a una conversación o a un trabajo un RAIL: una lista ordenada de pasos que vive como
ESTADO (no en tu memoria del hilo). **El reflejo `estados` es el custodio** (single-writer,
guarda la verdad); **tú (LLM) solo decides cuándo crear/avanzar/tachar**. El nervio inyecta
la lista ACTIVA cada turno → el rumbo lo lees, no lo reconstruyes. Timón con una mano.

## Cuándo usar
- El usuario tiene un trabajo de **varios pasos** y el rumbo se pierde entre turnos.
- Una **lista** de cualquier cara: tareas, compra (se tacha), notas, o un **proceso definido**
  con orden (recibe→prepara→valida→cobra).
- El usuario dice "vamos por partes", "apunta esto", "¿por dónde íbamos?", "1º… 2º… 3º".

NO lo uses para un hecho suelto de un turno (eso no es un rail). NO recites la lista en cada
respuesta: es contexto de fondo, la usas para no perder el norte y saber el siguiente paso.

## Contrato
```json
{
  "primitivo": "ListaOrdenada { pasos:[{ id, texto, pos, estado }], orden: 'libre'|'estricto', actual }",
  "estado_paso": "pendiente | hecho | atascado | descartado",
  "ops (RPC estados.<op>.request → .response)": {
    "crear":      "{ project_id, nombre, tipo?, orden?, pasos?, activar? } → { lista_id }",
    "instanciar": "{ project_id, arquetipo, nombre?, activar? } → lista desde plantilla de proceso (PRISMA)",
    "anadir":     "{ project_id, lista_id, texto, freno? } → añade un paso pendiente",
    "avanzar":    "{ project_id, lista_id, entrega? } → ESTRICTO: valida el paso actual → hecho+siguiente, o atasco",
    "marcar":     "{ project_id, lista_id, paso_id, estado } → LIBRE: tacha/descarta por id",
    "estado":     "{ project_id, lista_id? } → una lista, o la ACTIVA (lo que ve el nervio)",
    "listar · activar · borrar": "…"
  }
}
```

## Mecanismo
1. **Crea el rail** cuando el trabajo tenga pasos:
   `bus.publishAndWait('estados.crear.request', { project_id, nombre:'Compra', tipo:'compras', pasos:['leche','pan'], activar:true })`
   - `orden:'libre'` (default) = tareas/notas/compra: se tachan en cualquier orden.
   - `orden:'estricto'` = proceso 1º→2º→3º: los pasos no saltan; cada uno valida antes de soltar al siguiente.
2. **Actívala** (`activar:true` al crear, o `estados.activar`) — SOLO la activa la inyecta el nervio.
3. **Refleja los avances** según el usuario vaya cerrando pasos:
   - libre: `estados.marcar { lista_id, paso_id, estado:'hecho' }` (tachar) o `'descartado'`.
   - estricto: `estados.avanzar { lista_id, entrega:{...} }` — si el paso tiene freno (`requiere:[campos]`),
     la entrega debe traer esos campos o el paso se **atasca** (no arrastra basura al siguiente).
4. **Añade** lo que surja: `estados.anadir { lista_id, texto }`.
5. **No recites la lista**: el nervio ya te la inyecta cada turno como "# EL RAIL — lista activa".
   Úsala para saber qué falta y cuál es el siguiente; refléjala en el estado, no en tu memoria.

## Proceso definido (PRISMA hereda)
Un trabajo con proceso conocido se instancia desde la plantilla de su arquetipo, sin escribir los pasos:
`bus.publishAndWait('estados.instanciar.request', { project_id, arquetipo:'servicio', nombre:'Corte de pelo', activar:true })`
→ da el rail `recibe → realiza[freno:hecho] → entrega → cobra[freno:pagado]`, orden estricto.
Arquetipos con plantilla: `comestible · servicio · uso_temporal · pieza` (`_shared/procesos-semilla.js`).

## Filosofía
El rumbo deja de vivir en la memoria frágil del hilo y pasa a la cúpula, escrito. El reflejo es
single-writer → el timón no tiembla (nadie más escribe la lista). Mano ligera porque el estado ya
marca el norte: lo lees, no lo recuerdas.
