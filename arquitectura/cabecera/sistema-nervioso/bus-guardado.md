---
id: sistema-nervioso/bus-guardado
dominio: sistema
resumen: El bus como PUERTA GUARDADA — la identidad por certificado (certificate-authority) rige el broker MQTT entero, no solo el gateway HTTP. Guard en el broker (authenticate/authorizePublish/authorizeSubscribe) con escalera off→observe→enforce, mandada por el dueño desde el panel de interruptores. Cierra la restricción del prisma: el broker anónimo.
fuentes:
  - core/broker/bus-guard.js
  - core/broker/enki-token.js
  - core/broker/embedded.js
  - modules/security-core/**
  - modules/certificate-authority/**
  - frontend/src/lib/ui-core/enki-identity.ts
  - tests/unit/security-core__bus-guard.test.js
  - tests/unit/security-core__enrollment.test.js
verificado: 2026-07-13
---

# El bus como puerta guardada

> **La restricción que cierra.** El prisma cantó que el broker MQTT WSS es anónimo
> (`core/broker/embedded.js` — Aedes sin `authenticate`): cualquiera que alcance
> `wss://host/mqtt` publica `ui/request/{dominio}/{acción}` saltándose el guard del Portal
> y del Ejecutor. Este subsistema hace que `certificate-authority` —que ya acuña identidades
> X.509 con `urn:eventcore:<type>:<identifier>`— **rija la puerta grande**: el broker consulta
> la identidad en CONNECT y autoriza PUBLISH/SUBSCRIBE por scope. Los guards laterales dejan de
> ser teatro.

## El mandato

```json
{
  "esquema": "bus-guardado-v1",
  "tesis": "un guard protege la puerta por donde entra el mundo (el bus), y nace CERRADO por peldaños, no de golpe",
  "identidad": "el certificado X.509 de certificate-authority ES la identidad — su SAN urn:eventcore:<type>:<identifier> viaja en el CONNECT",
  "escalera": {
    "off":     "el guard no se cablea — broker abierto (comportamiento de hoy, cero riesgo de brickeo)",
    "observe": "verifica + sella identidad + audita, pero PERMITE todo — aprende quién sería bloqueado sin romper a nadie",
    "enforce": "bloquea: anónimo fuera de los dominios sensibles, credencial inválida rechazada en CONNECT"
  },
  "mando": "el DUEÑO sube el peldaño desde el panel (interruptores bus-guard · bus-guard-enforce) — degradación honesta, jamás un puenteo",
  "transporte_credencial": "MQTT CONNECT password = 'enki:token:<jws>' — token FIRMADO que prueba posesión de la clave. El cert desnudo (enki:cert:) es público→replayable y NO da identidad válida.",
  "veredicto": "certificate-authority.verify (node-forge, ya real) — el guard NO re-implementa cripto, la consulta"
}
```

## Paso 2 — el cliente porta su identidad sin que su clave salga jamás

> El cert es PÚBLICO: enseñarlo no prueba nada (replayable). La credencial fuerte es el **token
> firmado** — el cliente firma `{cert, iat, jti}` con su clave privada y el guard verifica **4 cosas**:

```json
{
  "1_CA":       "certificate-authority.verify: el cert lo firmó nuestra CA (identidad + SAN type/identifier)",
  "2_posesion": "la firma del token valida contra la clave pública DEL cert ⇒ el cliente POSEE la privada",
  "3_frescura": "iat dentro de ±tokenWindowSec (60s) — un token viejo no vale",
  "4_no_replay":"jti único dentro de la ventana (cache en el guard) — el mismo token no entra dos veces"
}
```

**Formato** (`core/broker/enki-token.js`, RS256 = RSASSA-PKCS1-v1_5+SHA256): `enki:token:` +
`b64url(header).b64url(payload).b64url(sig)`. Un solo formato para browser (WebCrypto), device y peer core.

**Enrolamiento sin exfiltrar la clave** (`certificate-authority.issueFromPublicKey`, `enki-identity.ts`):
el cliente genera su par en WebCrypto (privada **no-extraíble** en IndexedDB), manda solo su clave
**pública** a `certificate-authority/enroll`, y recibe un cert firmado. La privada NUNCA sale del
dispositivo; el servidor no guarda `key.pem` ni `.p12`.

**Orden de migración**: enrolar durante `observe` (bus abierto) → el front mintea el token en cada
CONNECT → subir a `enforce` cuando los clientes ya portan cert. El front es inerte hasta enrolar
(sin cert → conecta anónimo, funciona en off/observe).

## El motor (pseudocódigo)

```
CLASE BusGuard {                                  // vive en el core (el broker lo necesita en CONNECT)
  verifier : (pem) -> { valid, type, identifier } // inyectado — envuelve caManager.verifyCertificate
  policy   : (identidad, topic, accion) -> { allow, reason }
  getMode  : () -> 'off' | 'observe' | 'enforce'  // lee el estado VIVO del interruptor

  authenticate(client, username, password, cb):
    modo ← getMode()
    identidad ← _extraerIdentidad(password)       // anonymous si no hay credencial
    client.enkiIdentity ← identidad               // SELLA la identidad en el cliente
    SI modo == 'enforce' Y identidad.credencialPresente Y NO identidad.valid:
        RETORNA cb(errorNotAuthorized, false)     // credencial inválida no entra
    RETORNA cb(null, true)                         // observe/enforce-sin-credencial: pasa (la política de PUBLISH decide)

  authorizePublish(client, packet, cb):
    veredicto ← policy(client.enkiIdentity, packet.topic, 'publish')
    _auditar(veredicto, client, packet)
    SI getMode() == 'enforce' Y NO veredicto.allow: RETORNA cb(errorNotAuthorized)
    RETORNA cb(null)                               // observe: permite y aprende

  authorizeSubscribe(client, sub, cb): // simétrico
}

// Política por defecto (enforce): el anónimo NO toca dominios sensibles
POLICY_DEFECTO(identidad, topic, accion):
    dominio ← _dominioDe(topic)                    // ui/request/<dominio>/<accion>
    SI identidad.anonymous Y dominio ∈ DOMINIOS_SENSIBLES:
        RETORNA { allow:false, reason:'anonymous-sensitive-domain' }
    RETORNA { allow:true }

DOMINIOS_SENSIBLES = { credential, security-core, certificate-authority, interruptor,
                       interruptores, module, plugin, code, db, database, portal, ejecutor,
                       project (delete), filesystem (write) }   // espejo de la lista del Portal
```

## OOP + patrones

```
core/broker/embedded.js  (EmbeddedBroker)
  └─ opts.guard? → cablea aedes.authenticate/authorizePublish/authorizeSubscribe
       (sin guard → abierto: RETROCOMPATIBLE, es el peldaño 'off')

core/broker/bus-guard.js (BusGuard)
  ├─ verifier   (Strategy — inyectado; prod = wrap de certificate-authority.verify)
  ├─ policy     (Strategy — inyectado; default = POLICY_DEFECTO)
  └─ getMode    (lee el interruptor vivo — el dueño manda)

modules/security-core (SecurityCore, BaseModule)
  ├─ registra interruptores bus-guard (OFF) + bus-guard-enforce (OFF)
  ├─ puente verifier ↔ certificate-authority (bus RPC certificate-authority.verify)
  ├─ mantiene getMode() desde interruptor.cambiado (Observer)
  └─ emite security.bus.rejected / security.bus.authenticated (auditoría)

PATRONES
  Strategy   → verifier + policy (la cripto y la política se inyectan, no se cablean)
  State      → escalera off→observe→enforce (el modo es estado vivo, no flag de arranque)
  Observer   → getMode escucha interruptor.cambiado; el guard audita al bus
  NullObject → sin guard, el broker es abierto (peldaño off sin código especial)
  Guard      → fail-closed SOLO en enforce; observe y off nunca rompen (degradación honesta)
```

## Multi-core: cuatro identidades, no una

> **El sistema es multi-core.** El tráfico interno REAL viaja por `core/<coreId>/events/<dominio>/...`
> (no por `ui/request/...`, que es solo el frente del navegador). La política guarda esa puerta:
> `_dominioDeTopic` extrae el dominio del segmento `events/<DOMINIO>`. Las identidades que el guard
> distingue:

```json
{
  "core-peer":  "otro core del mesh — se autentica por security-p2p (handshake X25519, emite security.peer.trusted). Necesita subscribe amplio (core/+/events/#) para federar.",
  "device":     "cert X.509 type=device (certificate-authority) — scope por SAN urn:eventcore:device:<id>",
  "client":     "cert X.509 type=client (el front/portal facturación) — scope por SAN urn:eventcore:client:<id>",
  "anonymous":  "sin credencial — en enforce no toca dominios sensibles NI cosecha por comodín (firehose cerrado)"
}
```

**Trabajo pendiente (la política aún es plana, no scopeada):** el peer-trust debe venir de
`security.peer.trusted`/`security.peer.revoked` (no del crutch `trustedClientIds=[coreId]`, spoofeable);
y un cert válido aún da acceso a todo — falta acotar por `type`/`identifier` del SAN. Ver la sección
de bordes.

## Resiliencia y bordes

- **Broker arranca antes que los módulos**: el guard nace en modo `off` (verifier nulo) y sube a `observe/enforce` cuando `security-core` cablea el verifier y el dueño lo enciende. Nunca bloquea durante el arranque.
- **certificate-authority caído**: en `enforce`, si el verifier no responde → el guard degrada a `observe` (audita 'verifier-unavailable') en vez de cerrar el bus entero — la seguridad no se paga con una caída total.
- **El propio broker publica** (`client == null`): siempre permitido (es el núcleo, no un cliente externo).
- **Migración del front**: hoy el front conecta sin credencial → en `observe` es `anonymous` y todo sigue igual; el paso a `enforce` se hace DESPUÉS de que el front porte su cert (fase siguiente, documentada — no se enciende enforce antes).

## Observabilidad

Contadores: `security.bus.authenticated`, `security.bus.anonymous`, `security.bus.rejected{domain}`, `security.bus.verifier_unavailable`. El modo `observe` es el instrumento: mide cuánto tráfico anónimo tocaría dominios sensibles ANTES de encender `enforce`.
