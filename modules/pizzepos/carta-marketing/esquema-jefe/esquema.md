# ESQUEMA — cara del JEFE del módulo `carta-marketing` (pizzepos, reflejo-2.1.0)

> Árbol maestro consolidado (pasadas 1-2 + anatomía). Alimenta al agente de UI
> que escribe el panel. Ley de agnosticismo: cero tecnología de sistema ambiente.
> El análisis es de la CARA DEL JEFE — la utilización (consumo de la marca en
> otros paneles) quedó fuera.

## 1. Quién es el jefe y qué decide

Dueño de la IDENTIDAD DE MARCA del proyecto (la voz, el visual y el público que
beben carta-digital, carta-design, copy y canales). La identidad es BASE
compartida (`/pizzepos/marca.json`) con contrato mecánico (marca.schema.json).
Decide:
- **D1 — la VOZ** (`voz`): tono[], registro, referencias[], si[], no[] — cómo
  suena TODO el copy.
- **D2 — el VISUAL** (`visual`): colores{}, tipografias{}, estilo, logo (ruta) —
  cómo se ve. Dueño COMPARTIDO: el jefe capta el inicial; carta-design lo REFINA.
- **D3 — el PÚBLICO** (`publico`): quien, actitud — a quién.
- **D0 — la ESENCIA** (`esencia`): nombre (mínimo para arrancar), lema,
  proposito, valores[] — el ADN.

Lo que NO decide: qué carta se publica (carta-manager), el diseño final de la
carta (carta-design refina el visual), ni el copy redactado (lo redacta el LLM
de página en la voz declarada).

## 2. Invariantes (restricciones honestas, verificadas en código)

- INV1 — **single-writer**: el reflejo escribe `/pizzepos/marca.json` (fs.write
  atómico). update_perfil es la ÚNICA escritura; deep-merge por sección (los
  campos ausentes se preservan).
- INV2 — **sin 404 de lectura**: get_perfil SIEMPRE responde la estructura
  completa (secciones vacías si falta). La falta de marca es estado NOMBRADO
  (secciones vacías), no error.
- INV3 — **EL FRENO (contrato mecánico)**: la marca SÍ tiene schema
  (marca.schema.json). update_perfil RE-VALIDA la marca resultante del merge
  contra el schema ANTES de escribir; un parche que la rompe → 422, NO persiste.
  El COPY no tiene freno mecánico (texto libre).
- INV4 — **el dictamen viene en la respuesta** de update_perfil (200 { marca
  fusionada }) y la señal `marketing.perfil.actualizado` re-asienta la vista.
- INV5 — **estado 'vacío' = "por declarar"**: la vista lo nombra en claro
  (nunca lo pinta como fallo).
- INV6 — **sin moneda**: la identidad de marca no tiene cifras (voz + visual +
  público). Cero euros.
- INV7 — **multi-tenant**: todo RPC lleva project_id (lo inyecta la capa de
  request de la UI); el store JSON vive por proyecto.

## 3. Señales pareadas (verificadas en index.js)

| Declaración | Señal de confirmación | Payload |
|---|---|---|
| update_perfil (sección esencia) | `marketing.perfil.actualizado` | { project_id, campos_modificados, correlation_id, timestamp } |
| update_perfil (sección voz) | `marketing.perfil.actualizado` | idem |
| update_perfil (sección visual) | `marketing.perfil.actualizado` | idem |
| update_perfil (sección publico) | `marketing.perfil.actualizado` | idem |

UNA sola señal para todo el módulo (granularidad de módulo, no de sección; el
payload lleva `campos_modificados` — hueco menor, anotado en la anatomía).
Cadena verificada: reflejo (L145) → eventBus core (bus.js: emit → MQTT
core/*/events/...) → frontend (suscripción dot notation). carta-digital la
escucha como fuente.

## 4. Veredicto del árbitro (2/2) y composición de la vista

```
¿ESCRIBE en la identidad de marca (via update_perfil)?  → JEFE
¿SE EJECUTA en el momento de la venta/atencion?        → UTILIZACION
¿SOLO LEE estado o calcula?                            → NEUTRO
```

- **jefe (1)**: `update_perfil` — LA DECLARACIÓN de la identidad (único escritor).
- **utilizacion (0)**: NADA — la marca se consume en otros paneles (carta-digital,
  carta-design, copy), no se vende aquí.
- **neutro (1)**: `get_perfil` — informe que alimenta la decisión.

Composición 3 capas del panel del jefe:

```
1. INFORMARSE   informe get_perfil: la identidad vigente en claro, por secciones
                (esencia/voz/visual/publico), distinguiendo lo declarado de lo
                "por declarar" (secciones vacías)
2. DECLARAR     editor-bloque ESENCIA (J0) + VOZ (J1) + VISUAL (J2) + PÚBLICO (J3),
                cada uno 1 llamada update_perfil { soloSuSeccion }
3. CONFIRMAR    dictamen de la respuesta + señal marketing.perfil.actualizado
                re-lee el informe (debounce). Nunca recarga.
```

(R1 frecuencia: esencia primero, voz frecuente, visual con carta-design,
público set-once. R2 sin estado asumido. R3 la señal manda + dictamen RPC.
R4 transparencia de origen.)

**Diferencia con otros módulos declarados "sin señal":** aquí la señal SÍ
existe, verificada hasta el MQTT del core; el dictamen RPC inmediato y la
señal conviven (respuesta = dictamen puntual; señal = re-lectura de la vista).

## 5. Formas UI asignadas

| Hoja | Forma | RPC | Señal |
|---|---|---|---|
| Informe de identidad | cinta-estado + bloque de lectura por secciones | get_perfil | re-leída por la señal |
| Esencia (mínimo) | editor-bloque (nombre req + lema/proposito/valores) | update_perfil { esencia } | marketing.perfil.actualizado |
| Voz | editor-bloque (tono/registro/referencias/si/no) | update_perfil { voz } | marketing.perfil.actualizado |
| Visual | editor-bloque (colores/tipografias/estilo/logo) | update_perfil { visual } | marketing.perfil.actualizado |
| Público | editor-bloque (quien/actitud) | update_perfil { publico } | marketing.perfil.actualizado |

Hojas de utilización: NINGUNA (la marca se consume en otros paneles, no se
vende). Anotado en el blueprint con su veredicto.

## 6. Huecos [ABIERTO] — decisiones del dueño, se NOMBRAN (pasada-1 §5)

1. Arquetipo de marca (héroe, rebelde, sabio…) — no es campo canónico del schema.
2. Manifiesto (titulo/texto/cierre) — el copy lo redacta el LLM de página, no se
   declara aquí.
3. Extracción automática de paleta desde el logo — hoy se pregunta/confirma.
4. Eventos granulares por sección (marketing.voz.actualizada, etc.) — la señal
   es de módulo con campos_modificados.

Huecos de CONTRATO (faltan campos/señales), no de CAPTURA: la UI no pide nada
que el módulo no soporte.
