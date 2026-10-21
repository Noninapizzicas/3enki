# PASADA 1 — prisma de 5 huecos con LENTE DE ROL JEFE sobre `entrega`

> Sujeto correcto (no el módulo entero): **la capacidad de entrega de servir las
> DECISIONES del rol JEFE** — qué puede DECLARAR el dueño de la política de
> reparto y tiempos, de qué necesita INFORMARSE y qué SEÑAL confirma.
> Ley de agnosticismo: cero tecnología de sistema ambiente.
> Fuente: modules/entrega/index.js (reflejo-0.1.0, 131 líneas) + module.json
> + modules/_shared/config-custodio.js (la custodia compartida, 125 líneas).

## Hueco 1 — IDENTIDAD: ¿qué DECIDE el jefe aquí?

El jefe declara POLÍTICA (el futuro del servicio de entrega), no operaciones
(ahora). Dos decisiones, y solo dos, porque el CONTRATO entrega-v1 solo abre
esas palancas:

- **D1 — El servicio de reparto propio y sus condiciones** (`reparto`):
  activo on/off, radio_km, coste (EUR), minutos_por_km.
  Declarar esto = definir QUÉ reparte, A QUÉ DISTANCIA y A QUÉ PRECIO.
- **D2 — La estimación de tiempos de preparación** (`estimacion`):
  minutos_preparacion_base + minutos_por_item.
  Declarar esto = definir cómo el POS/PWA estiman el tiempo al elegir delivery.

Los nulls del contrato son política por declarar: el módulo nace vacío y el
dueño lo puebla. `reglas.actualizar` es LA DECLARACIÓN (1 op de escritura).

## Hueco 2 — RESTRICCIONES: ¿qué NO depende de él?

- **Single-writer absoluto**: la custodia es ConfigCustodio (leer → validar
  solo lo presente → merge profundo por bloques → persistir → evento). Una
  sola vía de escritura: reglas.actualizar. La UI nunca escribe ficheros y
  ninguna otra op persiste.
- **Los campos ausentes se preservan** (merge profundo de reparto/estimación):
  el jefe edita por bloque sin riesgo de pisar el otro bloque.
- **El juez de los valores es el módulo**: validadores declarativos (números
  >= 0 o null; activo boolean). La "política incompleta" es estado legítimo
  (nulls), no error — el módulo la nombra, no la rechaza.
- No decide: a qué pedido se reparte (pedidos/cuentas), el cobro (caja/cobro),
  ni el reparto ajeno (glovo/llevadoo ya lo cubren aparte).

## Hueco 3 — CONTRATO: ¿qué VER antes de decidir y qué SEÑAL confirma?

- VER: `reglas.leer` → { reglas, fuente }. **fuente distingue 'persistida'
  (política declarada) de 'default' (sin política, defaults con nulls)** —
  el informe distingue origen: lo que el jefe declaró vs lo que el sistema
  pone por defecto.
- VER parcial: `reparto.obtener` → la política de reparto tal cual se la
  servirá al cliente.
- SEÑAL de confirmación: `entrega.reglas.actualizadas` — publicada por la
  custodia al persistir (config-custodio.js L119), emitida por el eventBus
  del core al broker (topic core/*/events/entrega/reglas/actualizadas).
  Cadena verificada completa: custodio → bus local → MQTT → frontend
  suscribe en dot notation (mismo patrón del custodio hermano masa).

## Hueco 4 — NO-OBJETIVOS: ¿qué caras NO son del jefe?

- **UTILIZACIÓN (fuera del panel-jefe)**: `tiempo.estimar` — el POS/PWA
  estiman al elegir delivery (cara pedido/cliente: decisión AHORA, no futura).
  `reparto.obtener` — el cliente consulta la política; en el panel-jefe no
  abre captura: es el MISMO dato que el informe ya muestra.
- SISTEMA: fs store (entrega.json del proyecto), métricas del reflejo.

## Hueco 5 — PREGUNTAS_ABIERTAS (decisiones SUYAS, se nombran, no se cierran)

- [ABIERTO] **Horario de reparto**: el contrato no abre día/hora. "Reparto solo
  de 19h a 23h" hoy no es declarable.
- [ABIERTO] **Zonas múltiples**: radio_km plano único vs zonas por barrios con
  coste propio. El contrato solo abre un radio.
- [ABIERTO] **Pedido mínimo / envío gratis a partir de**: condiciones
  comerciales de reparto ausentes del contrato entrega-v1.
- [ABIERTO] **Quién reparte** (propio vs mixto con glovo/llevadoo por franja):
  decisión de negocio que hoy vive fuera del sistema.

Huecos de CONTRATO (faltan campos), no de CAPTURA (la UI no pide nada que el
módulo no soporte). Se listan como onboarding del dueño, no como defectos.