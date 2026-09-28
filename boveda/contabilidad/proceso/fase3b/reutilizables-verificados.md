# Reutilizables VERIFICADOS contra el contrato real

> **Quién:** el padre (Tot), trabajo determinista.
> **Cuándo:** 2026-09-28, antes de F3b.
> **Por qué:** la skill `enki-adaptador-disenos` documenta el pitfall de nichos —
> *el plan declaró `REUTILIZAR` módulos que no existían o cuyo contrato no encajaba*.
> Aquí se verifica **contra el `module.json` REAL**, no por el nombre.
>
> **Fuente:** `fase3b/inventario-modulos-enki.json` (248 módulos, regenerado con el
> contrato real: `events.subscribes` / `events.publishes` — la primera extracción los
> leía de la raíz y daba 0 falsos).
> **Nota:** `/tmp` se limpia → el inventario vive ahora en el repo (versionado).

---

## 🎯 EL HALLAZGO: YA EXISTE UN PIPELINE DE FACTURACIÓN

Tres módulos reales, encadenados por eventos, que cubren **la entrada de facturas** y
**la exportación al asesor**. Es el eslabón limitante en buena parte ya construido.

### La cadena real (verificada)
```
facturacion/fuentes          facturas                      facturacion/asesoria
  sub: telegram.photo.received   sub: factura.entrada          (lee facturas procesadas)
       telegram.document.received
  pub: factura.entrada    →      pub: factura.recibida    →    pub: asesoria.paquete.generado
                                      factura.procesada             asesoria.paquete.error
                                      factura.error
                                      factura.exportada
                                 tools: facturas.procesar (OCR+IA)
                                        facturas.listar
                                        facturas.estadisticas
```

---

## REUTILIZAR — verificado (contrato real encaja)

| Módulo | v | Contrato REAL | Cubre | Eje |
|---|---|---|---|---|
| **`facturas`** | 3.0.0 | sub `factura.entrada` · pub `factura.recibida/procesada/error/exportada` · tools `procesar` (OCR+IA), `listar`, `estadisticas` | **la admisión + extracción documento→dato** (A3, A4.1) y el estado del documento | `entrada` |
| **`facturacion/fuentes`** | 2.0.0 | sub `telegram.photo.received`, `telegram.document.received` · pub `factura.entrada` | **el puerto de documentos** (A5) — strategy-pattern de fuentes | `entrada` |
| **`facturacion/asesoria`** | 2.0.0 | pub `asesoria.paquete.generado/error` · tools `asesoria.generar-paquete`, `asesoria.historial` | **la exportación al asesor** (L1) — CSV español + ZIP con originales | `libro` |
| **`inventario`** | 1.0.0 | sub `pedido.completado`, `pedido.cancelado` · pub `inventario.reserva.*`, `inventario.confirmado` · tools `consultar`, `reservar`, `confirmar`, `liberar` | **el stock real por proyecto** (grupo H) — ya multi-proyecto | `analitica` |
| **`metricas`** | 2.0.0 | sub wildcards `*.creado`, `*.actualizado`, `*.eliminado`, `*.error` · pub `metricas.snapshot` | **la instrumentación pasiva** → base de la cobertura/observabilidad | `libro` |
| **`filesystem`** | 2.4.0 | 23 subs / 27 pubs · tools `fs.list/read/write/...` (17) | **infraestructura de storage** scopeada por `project_id` | (transversal) |
| **`project-manager`** | 4.2.0 | 11 subs / 13 pubs (`project.created/activated/...`) | **infraestructura de proyecto** (activación de vertical) | (transversal) |
| **`credential-manager`** | 2.2.0 | sub `credential.*.request` · pub `credential.*` · tools `credential.list` | **infraestructura de credenciales** (bancos, FACe, SII) | (transversal) |

## EVALUADOS Y DESCARTADOS (con motivo — no se adaptan, se toma su patrón)

| Módulo | Por qué NO | 
|---|---|
| **`pizzepos/escandallo`** | **mono-negocio** (vertical pizzepos, receta→coste). Ya verificado en F2: no sirve para un grupo (falta coste indirecto, multi-sociedad, periodos). **Se pone POR ENCIMA, no se toca.** Su patrón (híbrido blueprint+reflejo) sí se toma si hace falta juicio de coste. |
| **`marketing-budget`** | dominio marketing; declara *"custodia contable"* pero es presupuesto de marketing, no contabilidad. **Solape ya registrado** (pregunta abierta) → decisión: contabilidad **LEE**, no absorbe. |
| **`planes-y-tiers`** | dominio licencias de OTRO producto (Free/Pro/Agencias). Sirve de **patrón** para `modelo-licencia` (K8), no se adapta. |
| **`cuenta-recurrente`** | dominio despacho de pan (cliente + pedido base + día). Patrón de custodio, dominio ajeno. |
| **`agenda-operacion`** | dominio operación diaria de negocio (horarios, demanda). Ajeno. |
| **`lotes`** | ciclo de lotes de producción. Ajeno (útil a la operación, no a contabilidad). |
| **`entrega`** | estimación de reparto. Ajeno. |
| **`banco`** (v0.2.0) | ⚠️ **NOMBRE ENGAÑOSO**: no es banca, es *"Custodio del banco de nichos del radar"*. **NO confundir con el grupo E (tesorería/bancos).** Los bancos de contabilidad se CONSTRUYEN. |
| **`nichos/motor-cobro`, `prisma/cobro`, `pizzepos/cobros`, `pizzepos/pago-gateway`** | cobro de OTRO dominio. Patrón de puerto de pago reutilizable como **patrón**, pero contabilidad **observa** el cobro, no lo ejecuta (salvo pasarela declarada). |

---

## Consecuencia para el plan F3b

- **8 REUTILIZAR** verificados (contrato real encaja).
- La **entrada** (eslabón limitante) tiene ya 2 piezas reales: `facturas` + `facturacion/fuentes`.
- El **cierre con el asesor** tiene 1 pieza real: `facturacion/asesoria`.
- El resto se **CONSTRUYE**, justificando por qué no reutiliza lo existente.

## Lección de método registrada

1. **Los eventos viven en `events.subscribes` / `events.publishes`**, no en la raíz del `module.json`.
   Extraerlos mal da 0 y hace perder los candidatos reales.
2. **`/tmp` se limpia** entre sesiones: el inventario y los artefactos de trabajo van al repo.
3. **El nombre engaña**: `banco` = banco de nichos, no banca. Juzgar SIEMPRE por el `module.json`.
