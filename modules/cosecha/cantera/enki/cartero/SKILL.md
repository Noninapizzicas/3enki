---
name: cartero
description: Puente reflejo con el Gmail del dueño — verifica el canal y entrega la newsletter de nichos (M7) con ack explícito del proveedor. Es el eslabón de salida del radar.
when-to-use: El reloj va a entregar el borrador semanal (cartero.enviar.request) o hay que comprobar que el canal de correo sigue operativo (cartero.verificar.request). También para consultar el historial de envíos.
tags: [radar, newsletter, gmail, egress, M7]
lente_dominio: null
---

# cartero — el puente con el correo del dueño (reflejo puro)

Módulo REFLEJO (determinista, sin blueprint) que conecta el radar con el Gmail del
dueño. **Regla de oro (M7/M11, honestidad): `ok:true` jamás sin confirmación
explícita del proveedor.** El transporte real es el provider `local.gmail`
(Gmail API OAuth2, el mismo puente que usa facturacion) vía ServiceExecutor —
nodemailer NO existe en el sistema.

## Contrato

- entrada: borrador de newsletter (lo produce el redactor) + destino `para` (M7: el Gmail del dueño)
- salida: `cartero.envio_resultado { ok:true }` SOLO con ack · `cartero.enviar.failed` (par de fallo) · `cartero.verificado` (estado del canal)
- no hace: no redacta (redactor), no decide qué se envía (reloj/dueño)
- persistencia: historial de envíos por proyecto en `/radar/cartero.json` (PosPersistencia, hidratación por `project.activated`)

## RPCs (subscribes → handlers)

| evento | handler | respuesta |
|---|---|---|
| `cartero.verificar.request` | onVerificarRequest | `cartero.verificar.response` → { estado, detalle, ts } |
| `cartero.enviar.request` | onEnviarRequest | `cartero.enviar.response` → { ok, envio } |
| `cartero.envios.listar.request` | onEnviosListarRequest | `cartero.envios.listar.response` → { envios, total } |
| `project.activated` | onProjectActivated | restaura la persistencia del proyecto |

## Eventos que emite

- `cartero.verificado` — { estado, detalle, ts, project_id } tras verificarCanal
- `cartero.envio_resultado` — { ok:true, envio } SOLO con ack del proveedor
- `cartero.enviar.failed` — { motivo:'proveedor_sin_ack', detalle, envio } si el proveedor no confirmó

## verificarCanal (M7)

Llamada autenticada barata: `local.gmail list { maxResults:1 }` (timeout 15s) →
estado `disponible` | `error_autenticacion` (auth/oauth/token/invalid_grant/401)
| `suspendido` (suspended/disabled/forbidden/403) | `error` (no clasificable).
El estado NO es binario: el reloj aborta con cualquier estado ≠ disponible.

## enviar — la honestidad del ack

- valida: project_id, `borrador.newsletter` (string no vacía — la produce el redactor), `para`
- `local.gmail send` (timeout 30s) → **`ok:true` SOLO si `res.messageId` está presente**; sin messageId → Error('Proveedor respondió sin messageId') → envío FALLIDO + `cartero.enviar.failed`
- el RPC responde siempre 200 con `data.ok` true/false — nunca cuelga el bus
- id de envío: `envio_<ts>_<hex3>` (único aunque dos envíos caigan en el mismo ms)

## Interruptor

`cartero` (grupo radar, default **false**): egress consciente al correo del dueño.
Apagarlo detiene el envío sin tocar el historial. El reloj aborta si el canal no
está disponible — un cartero sin interruptor encendido no entrega.

## Errores canónicos

- 400 INVALID_INPUT: `project_id` faltante · `borrador` sin newsletter · `para` faltante

## Pitfalls (verificados en vivo)

- El transporte real es `local.gmail` vía ServiceExecutor — no existe módulo nodemailer.
- Verificar el canal por `cartero.verificado` (evento) o por el historial en disco
  (`/radar/cartero.json`), no por el RPC solo.
- La hidratación de `envios` depende de `project.activated` — tras restart, el
  historial aparece cuando el proyecto se activa (hidratación lazy).
