---
id: sistema-nervioso/invitaciones
dominio: sistema
resumen: DISEÑO (v0, no construido) — la cadena de delegación de capacidades sobre la identidad: el admin del sistema invita a admins de proyecto (crear/entrar proyecto), y estos invitan a sus equipos con roles. Invitación = token firmado, verificable offline, monotónico (nadie otorga más de lo que tiene). Redimir = enrolar un cert scopeado a {project, role}. Reusa enki-token, el SAN con scope, project-manager y staff-manager.
fuentes:
  - modules/_shared/invitaciones.js
  - modules/invitaciones/**
  - frontend/src/lib/modules/invitaciones/**
  - frontend/src/lib/stores/invitaciones.ts
  - frontend/src/routes/redimir/**
  - frontend/src/lib/ui-core/enki-identity.ts
  - core/broker/enki-token.js
  - modules/certificate-authority/**
  - modules/security-core/**
  - modules/project-manager/**
  - modules/staff-manager/**
  - modules/device-registry/**
verificado: 2026-07-14
---

# Invitaciones — la cadena de delegación de capacidades

> **DISEÑO v0 — aún no construido.** Esta rebanada sella el modelo acordado; el código llega por el
> roadmap de abajo. La marca de nacimiento: una identidad no se auto-otorga — se **hereda** de quien
> ya la tiene, por una invitación firmada que nunca otorga más de lo que su emisor posee.

## La tesis

El `enroll` (paso 2) prueba QUÉ clave tienes, pero no QUIÉN te autoriza. La invitación es esa puerta:
un **token firmado** que un poseedor de autoridad reparte, y que al **redimirse** emite un cert scopeado.
La cadena solo baja — capacidades monotónicas.

```
Nivel 0 · Admin del sistema (raíz = cert auto-firmado de la CA en el bootstrap)
   │  invitación { accion: crear-proyecto, otorga: role=project-admin }
   ▼
Nivel 1 · Admin de proyecto  (redime → project-manager.create + cert client:<project>:admin)
   │  invitación { accion: unirse, project: <suyo>, role: <2-3 roles del proyecto> }
   ▼
Nivel 2 · Equipos / usuarios  (redimen → cert scopeado a {project, role})
```

## Contrato (JSON)

```json
{
  "esquema": "invitacion-v1",
  "invitacion": {
    "id": "inv_<hex>",
    "emisor":  { "cert_serial": "<serial>", "scope": "<project|system>", "role": "<role>" },
    "otorga":  {
      "accion": "crear-proyecto | unirse-proyecto",
      "project": "<id | null>",          // null en crear-proyecto (se fija al redimir)
      "role":    "<role otorgado>"
    },
    "limites": { "expira_at": "<iso>", "usos_max": 1, "usos": 0 },
    "firma":   "RS256(privada_del_emisor, canonical(otorga+limites+id))"
  },
  "verificacion_offline": "la invitación se prueba contra el cert del emisor — sin lookup (QR/código copiable)",
  "primitivo": "MISMO que enki-token (RS256) — no se inventa cripto nueva"
}
```

## La invariante — delegación monotónica (Specification)

```
VALIDA(invitacion) ⟺
    firma_valida(invitacion, cert_del_emisor)          // ¿de verdad la firmó él?
  ∧ otorga ⊆ autoridad(emisor)                          // no escala (LA invariante)
  ∧ no_expirada(invitacion) ∧ usos_disponibles(invitacion)

autoridad(emisor):
  system-admin (scope=system)  → { crear-proyecto, role=project-admin }
  project-admin (scope=P)      → { unirse-proyecto, project=P, role ∈ roles(P) \ {niveles superiores} }
  member                       → ∅  (no delega)

// el admin de nonina NUNCA otorga otro proyecto, NUNCA system, NUNCA un rol > el suyo
```

## Redención = enrolar con invitación (pseudocódigo)

```
FUNCION redimir(invitacion, miClavePublica): Cert
  PRE: VALIDA(invitacion)                                       // si no, 403 fértil (nombra por qué)
  SI invitacion.otorga.accion == 'crear-proyecto':
      project ← project-manager.create({ owner: portador })     // bootstrap del proyecto
      role    ← 'project-admin'
  SINO:
      project ← invitacion.otorga.project
      role    ← invitacion.otorga.role
  cert ← certificate-authority.issueFromPublicKey({
            publicKeyPem: miClavePublica, type, scope: project, role, identifier
         })
  invitacion.usos += 1                                          // consume un uso
  EMITE 'invitacion.redimida' { id, project, role, portador }
  RETORNA cert
```

## Modelo OOP

```
CLASE Invitacion (ValueObject inmutable)
  ├─ otorga: Grant { accion, project, role }
  ├─ limites: { expira_at, usos_max, usos }
  └─ firma  → verificable contra el cert del emisor

CLASE Autoridad (del cert del emisor: scope + role)
  └─ puedeOtorgar(grant): Boolean          // la invariante monotónica (Specification)

CLASE Invitador (Factory de invitaciones)
  └─ emitir(grant, limites): Invitacion    // rechaza si grant ⊄ this.autoridad

CLASE Redentor
  └─ redimir(invitacion, pubKey): Cert      // verifica + issueFromPublicKey + consume uso

PATRONES
  Specification → Autoridad.puedeOtorgar (la monotonía)
  Factory       → Invitador.emitir · Redentor produce el Cert
  Capability    → la invitación ES la capacidad portable (no una ACL central)
  Guard         → VALIDA como precondición; el 403 nace fértil (nombra la falta)
```

## Reusa lo que ya existe (no inventa roster)

| Necesidad | Lo resuelve | Estado |
|---|---|---|
| firmar/verificar la invitación | `core/broker/enki-token.js` (RS256) | ✅ vivo |
| emitir el cert desde una pubkey | `certificate-authority.issueFromPublicKey` | ✅ vivo |
| scope por proyecto en el cert | SAN de 4 partes `type:scope:identifier` | ✅ vivo |
| crear el proyecto (nivel 1) | `project-manager.create` | ✅ vivo |
| usuarios y su rol | `staff-manager` (employee.role ya existe) | ✅ vivo |
| equipos | `device-registry` (register/unregister) | ✅ vivo |
| rol → dominios permitidos (política) | `bus-guard` policy (por construir) | 🔜 fase 2 |

## Catálogo de roles — semilla + crecido por proyecto (decisión 1, RESUELTA)

> **El rol es del PROYECTO, no del sistema.** El sistema siembra un mínimo; cada proyecto crece los
> suyos según sus necesidades. Mismo patrón que agentes/cantera/arquetipos: `semilla ⊕ crecido`, el
> proyecto gana en conflicto. Se empieza SIMPLE (la semilla basta), pero la puerta queda abierta por diseño.

```json
{
  "esquema": "roles-proyecto-v1",
  "principio": "el sistema siembra el mínimo; el admin de proyecto define/edita los suyos",
  "rol": {
    "id": "caja",
    "dominios": ["pizzepos", "cobros"],     // qué puede TOCAR en el bus (alimenta la policy del guard)
    "hereda": "member"                        // opcional: base + extras
  },
  "resolucion": "roles(project) = SEMILLA_SISTEMA ⊕ roles_del_proyecto   (el proyecto pisa la semilla)",
  "semilla_minima": {
    "project-admin": "todos los dominios del proyecto (el que redime crear/entrar)",
    "member":        "dominios operativos — NO identidad ni sistema (credential/security/module/...)",
    "device":        "carril IoT — device-*, device-shadow, device-health, telemetría"
  },
  "almacen": "por proyecto (project-manager config) — el admin de proyecto CRUD-ea sus roles",
  "consumo_por_el_guard": "policy(identity, topic) ⟺ _dominioDeTopic(topic) ∈ dominios(identity.role, identity.scope)",
  "ligadura_con_invitacion": "una invitación solo otorga un role que EXISTE en el catálogo del proyecto (o en la semilla) y ⊆ la autoridad del emisor",
  "distincion": "rol-del-BUS (qué puede tocar) ≠ rol-de-RRHH de staff-manager (cocinero/camarero, descriptivo). No se mezclan."
}
```

**Lo simple ahora, la puerta abierta por diseño:** v0 usa solo la semilla (3 roles) — suficiente para
arrancar. La estructura (`roles(project) = semilla ⊕ crecido`) ya permite que mañana una tienda añada
`caja`, `cocina`, `repartidor` sin tocar el sistema. El guard resuelve el rol contra el catálogo del
proyecto del cert; si el proyecto no definió ninguno, cae a la semilla.

## Decisiones abiertas (cambian el código)

```json
{
  "1_catalogo_de_roles": "RESUELTA — roles por proyecto, semilla+crecido, v0 solo la semilla (ver sección arriba)",
  "2_revocacion_en_cascada": "revocar un admin de proyecto → ¿mueren los certs que repartió? (árbol: revocar nodo revoca subárbol). Potente; opcional en v0.",
  "3_usos": "invitación de 1 uso (un equipo) vs multiuso con cupo (N tablets de una tienda)."
}
```

## Roadmap de construcción (orden por foco — no adelantar peldaños)

```
FASE 0 · BASE DE IDENTIDAD ......................................... ✅ HECHO
  guard + escalera off/observe/enforce · token firmado · enroll ·
  peer-trust dinámico · SAN con scope · botón de pánico

FASE 1 · ENCENDER Y MEDIR (operativo, sin código nuevo) ........... 🔜 siguiente
  habilitar certificate-authority · correr 'observe' · leer
  security.bus.rejected{domain} · decidir si enforce grueso basta

FASE 2 · CATÁLOGO DE ROLES (decisión 1 RESUELTA: semilla+crecido) ..
  v0: sembrar los 3 roles mínimos (project-admin/member/device) +
  resolver role→dominios en la policy del guard, leyendo el catálogo
  del proyecto (⊕ semilla). Desbloquea el scope fino que hoy solo VIAJA.
  La estructura ya deja que cada proyecto crezca sus roles sin tocar el sistema.

FASE 3 · INVITACIONES (este subsistema) ...........................
  3a ✅ banco puro: construir/emitir/verificar + monotonía (modules/_shared/invitaciones.js)
  3b ✅ módulo invitaciones: emitir/listar/revocar + firma R1 (CA raíz, certificate-authority.
        sign-invitation) + persistencia + código copiable (modules/invitaciones/)
  3c ✅ redención: handleRedimir = verificar (firma vs CA + monotonía + usos) +
        project-manager.create (si crear) + certificate-authority.enroll (cert scope+role) +
        consume uso. El rol viaja en metadata del cert (graduará al SAN en Fase 2).
  3d ✅ UI de las DOS caras — (a) panel Invitaciones (admin: Emitir crear/unirse → código
        copiable + Gestionar listar/revocar, en /3333); (b) ruta /redimir (invitado: pega el
        código → genera su clave en el navegador → obtiene proyecto + cert scopeado, vía
        enki-identity.redimirInvitacion). FASE 3 COMPLETA de punta a punta (backend + UI).

FASE 4 · CICLO DE VIDA ............................................
  device-registry.unregister/staff.delete → certificate-authority.revoke
  revocación en cascada (decisión 2) · rotación

FASE 5 · ENFORCE REAL .............................................
  subir a 'enforce' con política scopeada por {role, project}, tras
  que 'observe' muestre el mapa real de tráfico
```

> **La disciplina del roadmap:** no construir invitaciones (fase 3) antes de los roles (fase 2), ni
> encender enforce (fase 5) antes de medir en observe (fase 1). Cada peldaño paga el siguiente; el
> botón de pánico (`bus-guard` OFF) siempre a un clic.
