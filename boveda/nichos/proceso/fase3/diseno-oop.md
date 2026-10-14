# Diseño OOP — Nichos Autónomos (Fase 3 · PLASMA)

> **Qué es este documento.** El sistema entero —el que detecta un nicho real,
> valida la demanda, construye la solución, la opera hasta cobrar y acumula salud
> financiera por proyecto— expresado en pseudocódigo OOP tipado. SIN tecnología
> concreta: ni canales de mensajería nombrados, ni plataformas de cobro, ni
> fuentes de datos de marca, ni frameworks. Todo lo que roza el exterior va por
> **puerto abierto** cableado en el sitio de despliegue (la traducción al stack
> real la hace la FASE 3b).
>
> **Fuente única del árbol.** Las 42 hojas atómicas del árbol maestro de la
> FASE 2 (`esquema.md` + `pasada-diseccion.md`), cada una con su FORMA —
> REFLEJO · MICRO-AGENTE · CUSTODIO · CONVERSOR · PUENTE. Aquí cada hoja se
> materializa como UNA clase con su contrato. Donde el flujo exige un eslabón
> adicional (orquestador, value object compartido) se añade como clase propia
> y se nombra.
>
> **Invariantes del diseño (desde la cabecera de persona):**
>
> - *Expresión en positivo (P0):* toda regla toma forma de Mandato — "haz Y
>   para que exista Z"; donde en el F2 hay un "no viable → no pasa", aquí es
>   "al cruzar `veredicto == no_viable`, el `CortadorTempranoSangria` sella el
>   proyecto en estado `cortado_pre_construccion` y el `PipelinePorNicho` lo
>   congela antes del gasto de F3".
> - *Cero juicio automático:* ninguna clase decide por el dueño. Donde haga
>   falta juicio humano, el sistema emite un `SolicitudDecision` que se encola
>   en `ColaDecisionesGate` y espera `RespuestaDecision` por el puerto de canal.
> - *Dato ausente = `[ABIERTO]`:* nunca se interpola, se declara abierto y la
>   clase marca `estado = esperando_declaracion`.
> - *IllegalStatesUnrepresentable:* los estados del nicho son un enum cerrado;
>   el `PipelinePorNicho` solo deja transitar al estado si la precondición
>   tipada se cumple, no hay "estado por descuido".
>
> **Cantidad.** 42 clases por hoja atómica (M1/M2/M3 refuerzan I1/I2/I3 — mismo
> cuerpo, no se duplica) + 2 eslabones del flujo (`OrquestadorNicho`,
> `SolicitudDecision` como value object compartido). Total: **44 clases**.

---

## 0 · Objetivo del sistema (una tirada)

El sistema recibe una semilla del dueño por su canal elegido y la convierte en
un **ciclo autónomo supervisado**: busca candidatos de nicho, valida demanda y
disposición a pagar, construye la solución operable + modelo de cobro, pasa el
paquete al dueño en los dos únicos tapones humanos (puente-humano del
constructor y gate-decision-operar del operador), opera hasta cobrar y mantiene
el cuadro de salud financiera por proyecto. El indicador maestro es financiero
y se sigue por proyecto, no por sensación: el sistema entrega el estado
`genera | sangra | neutro` y el flujo real a caja, y alerta cuando un proyecto
cruza el techo de pérdida declarado. Autonomía plena entre los gates; el dueño
decide solo en los puntos explícitos.

**Cuándo interrumpe al dueño (los únicos `SolicitudDecision` del sistema):**

1. `seed_normalizada_dudosa` — la normalización de la semilla cae por debajo
   del umbral de nitidez declarado por `H2.PerfilSupervision` → se pide
   confirmación del encuadre.
2. `veredicto_puente` — el `VeredictoViabilidad` no puede concluir viable/
   no-viable con el dato hidratado (señal fuzzy ambigua) → paquete al dueño.
3. `camino_construir_requiere_vb_previo` — el `CaminoEncontrarConstruir`
   decide "construir" (riesgo alto) y la política declarada por `H2` exige vb
   previo del dueño (campo `exige_vb_previo_construir`).
4. `puente_humano` — `D2.PuenteHumano`: el constructor detecta bloqueo sin
   alternativa (invariante "si no existe, se crea" quedó sin camino declarable).
5. `gate_decision_operar` — paquete cerrado (competencia + modelo + proyección)
   al dueño antes de operar.
6. `alerta_sangria` — cruce de techo de pérdida acumulada en un proyecto.
7. `ajuste_umbral_sugerido` — `C7.ReglasAprendidasValidacion` propone un
   recalibrado del `CriterioViabilidad` tras N proyectos cerrados.
8. `declaracion_abierta` — cualquier `[ABIERTO]` que el sistema necesite para
   seguir avanzando (puertos sin cablear, umbrales no declarados).

Ningún otro juicio automático existe en el sistema. Todo lo demás es cálculo
determinista o transformación fuzzy que **hidrata** al dueño, no decide por él.

---

## 1 · Lenguaje común — value objects transversales

> Los value objects son **inmutables** (reemplazo por copia-con-cambio), afirman
> su invariante en el constructor y se consumen por valor entre clases.

### 1.1 · Identidad y tiempo

```
VALUE_OBJECT IdNicho {
  valor : String                              // ULID del nicho; nace en captura-semilla
  INVARIANTE: valor.formato == ULID
}

VALUE_OBJECT IdProyecto {
  valor : String                              // ULID del proyecto (nicho validado + viable)
  INVARIANTE: valor.formato == ULID
}

VALUE_OBJECT IdCorrelacion {
  valor : String                              // propagada por toda la cadena del nicho
}

VALUE_OBJECT Instante {
  epoch_ms : Entero                           // monotónico creciente
}

VALUE_OBJECT Intervalo {
  desde : Instante
  hasta : Instante
  INVARIANTE: desde <= hasta
}
```

### 1.2 · Dinero y moneda

```
VALUE_OBJECT Moneda {
  codigo : String                             // ISO 4217 — "EUR", "USD", "GBP"
}

VALUE_OBJECT Dinero {
  cantidad : DecimalExacto                    // nunca float
  moneda   : Moneda
  mas(d: Dinero): Dinero                      // precondicion: mismaMoneda(d)
  menos(d: Dinero): Dinero                    // puede ser negativo (sangría)
  comparar(d: Dinero): Orden
  INVARIANTE: cantidad.escala == 4            // 4 decimales para precisión fiscal
}

VALUE_OBJECT FlujoCaja {
  intervalo    : Intervalo
  ingreso_neto : Dinero                       // + cobros, - devoluciones
  coste_neto   : Dinero                       // construcción + operación + fuentes
  neto()       : Dinero                       // ingreso - coste
}
```

### 1.3 · Estados del nicho — enum cerrado (IllegalStatesUnrepresentable)

```
ENUM EstadoNicho {
  SEMILLA_CAPTURADA,          // A1 selló la semilla
  SEMILLA_NORMALIZADA,        // A2 desambiguó a intenciones
  BUSCANDO,                   // B1 explorando
  CANDIDATO_DETECTADO,        // B1 devolvió al menos uno
  EN_COLA_VALIDACION,         // L2 lo encoló
  VALIDANDO,                  // C1 estudiando demanda
  VEREDICTO_VIABLE,           // C3 declaró viable
  VEREDICTO_NO_VIABLE,        // C3 declaró no-viable
  VEREDICTO_PUENTE,           // C3 pidió juicio humano
  CORTADO_PRE_CONSTRUCCION,   // C6 cortó por no-viable (protege salud)
  ESPERANDO_DECISION_DUENO,   // SolicitudDecision abierta
  CONSTRUYENDO,               // D1 ensamblando
  CONSTRUIDO,                 // D1 entregó solución operable
  ESPERANDO_GATE_OPERAR,      // E2 enviado al dueño
  OPERANDO,                   // E3/E4 cobrando y distribuyendo
  COBRADO_PRIMER_HITO,        // F1 registró primer cobro efectivo
  EN_SANGRIA,                 // F3 marcó sangra
  SANGRADO_CORTADO,           // dueño mató el proyecto
  CERRADO_EXITO               // operación cerrada en positivo
}
```

### 1.4 · Transición tipada

```
VALUE_OBJECT Transicion {
  desde       : EstadoNicho
  hasta       : EstadoNicho
  causa       : Causa                         // referencia a evento o decisión
  instante    : Instante
  autor       : Autor                         // Sistema | Dueño | PuenteHumano
  INVARIANTE: Transicion.esLegal(desde, hasta)   // tabla declarada en PipelinePorNicho
}
```

### 1.5 · Decisión humana — único canal de juicio

```
VALUE_OBJECT TipoDecision {                   // enum cerrado
  SEED_NORMALIZADA_DUDOSA,
  VEREDICTO_PUENTE,
  CAMINO_CONSTRUIR_VB,
  PUENTE_HUMANO,
  GATE_OPERAR,
  ALERTA_SANGRIA,
  AJUSTE_UMBRAL_SUGERIDO,
  DECLARACION_ABIERTA
}

VALUE_OBJECT SolicitudDecision {
  id              : IdCorrelacion
  tipo            : TipoDecision
  contexto        : PaqueteContexto           // nicho + evidencia + riesgo + alternativa
  opciones        : Array<OpcionDecision>     // cerradas por tipo; el dueño elige una
  caducidad       : Instante                  // cadencia declarada por H2
  INVARIANTE: opciones.tam >= 2 Y opciones.todas(o -> o.esConstruible)
}

VALUE_OBJECT RespuestaDecision {
  solicitud_id    : IdCorrelacion
  opcion_elegida  : OpcionDecision
  dueño           : Autor
  instante        : Instante
  nota_libre      : Opt<String>
}
```

### 1.6 · Puertos abiertos — contrato genérico

```
INTERFAZ PuertoAbierto<Entrada, Salida> {     // cualquier conexión al exterior
  nombre()      : String                      // "canal", "fuente-datos", "cobro"
  cablear(cfg)  : Void                        // lo hace el despliegue, no el diseño
  estaCableado(): Boolean
  enviar(e: Entrada) : Resultado<Salida>
}
```

Cualquier `[ABIERTO]` que exija cablear algo del exterior se declara como
puerto con contrato tipado — nunca con nombre de marca.

---

## 2 · Entidades y clases — las 42 hojas con FORMA + eslabones

### HUECO A · SEMILLA-BUSCADOR

#### A1 · `CapturadorSemilla` — REFLEJO puro

```
CLASE CapturadorSemilla {
  ATRIBUTOS {
    puerto_canal : PuertoCanal                  // inyectado (DI)
    reloj        : RelojInyectado
  }
  METODO capturar(mensaje: MensajeEntrante): Resultado<SemillaCapturada> {
    PRECONDICION mensaje.cuerpo.noVacio()
    SI mensaje.cuerpo.vacio() ENTONCES
        RETORNAR Rechazo("semilla_vacia", formato_esperado)
    FIN_SI
    semilla ← new SemillaCapturada(
      id        = IdNicho.generar(),
      texto     = mensaje.cuerpo.recortar(),
      autor     = mensaje.autor,
      canal     = puerto_canal.nombre(),
      instante  = reloj.ahora()
    )
    RETORNAR Ok(semilla)
  }
  REGLA: "cero juicio sobre la calidad de la semilla; solo acepta/formatea; A2 juzga"
}

VALUE_OBJECT SemillaCapturada { id · texto · autor · canal · instante }
VALUE_OBJECT MensajeEntrante { cuerpo · autor · canal · instante · meta }
```

#### A2 · `NormalizadorSemilla` — MICRO-AGENTE fuzzy (reflejo hidrata)

```
CLASE NormalizadorSemilla {
  ATRIBUTOS {
    hidratador : HidratadorNormalizacion       // REFLEJO que trae léxico/sector
    perfil_sup : PerfilSupervisionLector       // H2 — umbral de nitidez declarado
  }
  METODO normalizar(semilla: SemillaCapturada): Resultado<SemillaNormalizada | SolicitudDecision> {
    contexto     ← hidratador.contextoFor(semilla.texto)       // determinista
    intenciones  ← transformar(semilla, contexto)              // fuzzy — el agente
    nitidez      ← medirNitidez(intenciones)                   // 0..1
    SI nitidez < perfil_sup.umbralNitidezSemilla() ENTONCES
        RETORNAR SolicitudDecision(
          tipo     = SEED_NORMALIZADA_DUDOSA,
          contexto = contexto.resumen(),
          opciones = [adoptar(intenciones), reformular(semilla)]
        )
    FIN_SI
    RETORNAR Ok(SemillaNormalizada(semilla.id, intenciones, nitidez))
  }
  REGLA: "el agente desambigua palabras a intenciones; el reflejo trae el léxico; sin
         nitidez suficiente, no fuerza — pregunta por SolicitudDecision"
}

VALUE_OBJECT SemillaNormalizada {
  id          : IdNicho
  intenciones : Array<IntencionBusqueda>       // {palabra_clave, sector, publico, verbo}
  nitidez     : Decimal                        // 0..1
}
```

### HUECO B · BUSCADOR (F1)

#### B1 · `SondeadorTerritorio` — MICRO-AGENTE + reflejos

```
CLASE SondeadorTerritorio {
  ATRIBUTOS {
    puertos_fuente : Array<PuertoFuenteDatos>  // J1 — cableadas en despliegue
    conversor      : ConversorFuente           // J2
    gestor_limites : GestorLimitesFuente       // J3
    reglas_excl    : LectorReglasExclusion     // B2
    perfil_limite  : LectorPerfilLimite        // B3
  }
  METODO sondear(semilla: SemillaNormalizada): Resultado<Array<CandidatoNicho>> {
    PRECONDICION puertos_fuente.alguno(p -> p.estaCableado())
    SI puertos_fuente.ninguno(p -> p.estaCableado()) ENTONCES
        RETORNAR SolicitudDecision(tipo = DECLARACION_ABIERTA,
                                   contexto = "fuentes_de_datos_sin_cablear")
    FIN_SI
    barrido_crudo ← []
    PARA intencion EN semilla.intenciones:
        PARA puerto EN puertos_fuente.filtradas(perfil_limite.lee()):
            SI gestor_limites.puedeConsumir(puerto):
                hit ← puerto.enviar(intencion)
                barrido_crudo.añadir(conversor.aNormalForma(hit, puerto))
            FIN_SI
        FIN_PARA
    FIN_PARA
    filtrado     ← barrido_crudo.menos(reglas_excl.conjuntoAplicable(semilla))
    candidatos   ← juzgarTerritorio(filtrado, semilla)       // fuzzy — el agente
    RETORNAR Ok(candidatos.ordenarPorSenalDesc())
  }
  REGLA: "explora amplio pero limitable; el agente juzga qué territorio merece seguir,
         el reflejo barre y parsea; si no hay fuentes cableadas, SolicitudDecision"
}

VALUE_OBJECT IntencionBusqueda { palabra_clave · sector · publico · verbo }
VALUE_OBJECT CandidatoNicho {
  id_nicho          : IdNicho
  titulo_nicho      : String
  territorio        : String                   // dónde vive la demanda
  evidencia_inicial : Array<EvidenciaInicial>  // los hits normalizados
  senal             : Decimal                  // 0..1 — fuerza del indicio
  instante          : Instante
}
```

#### B2 · `ReglasExclusionAprendidas` — MICRO-AGENTE

```
CLASE ReglasExclusionAprendidas {
  ATRIBUTOS {
    historial_lector : LectorHistorial         // L4 — resultados de corridas previas
    cache_reglas     : Map<Semilla, ConjuntoReglas>
  }
  METODO conjuntoAplicable(semilla: SemillaNormalizada): ConjuntoReglas {
    SI cache_reglas.contiene(semilla.firma()) : RETORNAR cache_reglas[semilla.firma()]
    corridas    ← historial_lector.filtrarPorAfinidad(semilla)
    falsos_pos  ← corridas.filtrar(c -> c.cerradaComo == NO_VIABLE_Y_SIN_SENAL)
    reglas      ← inducir(falsos_pos)                        // fuzzy — el agente
    cache_reglas[semilla.firma()] ← reglas
    RETORNAR reglas
  }
  METODO reportarResultado(nicho: ResultadoNichoCerrado): Void {
    cache_reglas.invalidarAfines(nicho.semilla)
  }
  REGLA: "aprende SOLO de corridas cerradas; nunca inventa reglas sin evidencia"
}

VALUE_OBJECT ConjuntoReglas { patrones_excluir : Array<Patron> }
```

#### B3 · `PerfilLimiteBusqueda` — CUSTODIO (único escritor)

```
CLASE PerfilLimiteBusqueda {                   // CUSTODIO del store de límites
  ATRIBUTOS {
    store : AlmacenInmutable<PerfilLimite>     // snapshot por versión
    autor : AutorAutorizado = Dueño
  }
  METODO lee(): PerfilLimite { RETORNAR store.ultimo() }
  METODO declara(cambio: CambioPerfilLimite, por: Autor): Resultado<PerfilLimite> {
    PRECONDICION por == autor
    SI por != autor ENTONCES RETORNAR Rechazo("escritor_no_autorizado")
    nueva ← store.ultimo().aplicar(cambio).sellar(por, Instante.ahora())
    store.guardar(nueva)
    RETORNAR Ok(nueva)
  }
  REGLA: "un solo escritor (el dueño por el canal). Lectores: libres."
}

VALUE_OBJECT PerfilLimite {
  max_candidatos_por_semilla  : Entero | ABIERTO
  presupuesto_fuentes_por_hr  : Dinero | ABIERTO
  territorios_vetados         : Array<String>
  fuentes_autorizadas         : Array<NombrePuerto> | ABIERTO
}
```

### HUECO C · VALIDADOR (F2 — ESLABÓN LIMITANTE)

#### C1 · `EstudioDemanda` — MICRO-AGENTE + reflejos

```
CLASE EstudioDemanda {
  ATRIBUTOS {
    puertos_fuente : Array<PuertoFuenteDatos>
    conversor      : ConversorFuente
    gestor_limites : GestorLimitesFuente
    imputador      : ImputadorCosteFuente       // J4
  }
  METODO estudiar(candidato: CandidatoNicho, correlacion: IdCorrelacion): EstudioDemandaInforme {
    PRECONDICION puertos_fuente.alguno(p -> p.estaCableado())
    senal_1er_orden     ← medirDemandaReal(candidato)         // reflejo
    disposicion_a_pagar ← medirDisposicionPagar(candidato)    // reflejo
    hilo_conclusion     ← interpretarCuantitativo(            // fuzzy — el agente
                           senal_1er_orden, disposicion_a_pagar)
    imputador.registrarConsumo(candidato.id_nicho, correlacion)
    RETORNAR EstudioDemandaInforme(
      candidato, senal_1er_orden, disposicion_a_pagar, hilo_conclusion
    )
  }
  REGLA: "los números los miden fuentes declaradas (reflejo); la conclusión redactada
         la emite el agente — SIN juzgar viable/no-viable (eso es C3)"
}

VALUE_OBJECT EstudioDemandaInforme {
  candidato             : CandidatoNicho
  demanda_1er_orden     : SenalCuantificada     // {valor, unidad, confianza}
  disposicion_a_pagar   : Dinero | ABIERTO      // por unidad servida
  hilo_conclusion       : String                // texto del agente
  fuentes_usadas        : Array<NombrePuerto>
  coste_estudio         : Dinero
  instante              : Instante
}
```

#### C2 · `CriterioViabilidad` — CUSTODIO (umbral declarable)

```
CLASE CriterioViabilidad {
  ATRIBUTOS {
    store : AlmacenInmutable<UmbralViabilidad>
    autor : AutorAutorizado = Dueño | Jefe       // K3 ajustador también escribe
  }
  METODO lee(): UmbralViabilidad { RETORNAR store.ultimo() }
  METODO declara(cambio: CambioUmbral, por: Autor): Resultado<UmbralViabilidad> {
    PRECONDICION por en autor
    nueva ← store.ultimo().aplicar(cambio).sellar(por, Instante.ahora())
    store.guardar(nueva)
    RETORNAR Ok(nueva)
  }
  REGLA: "umbral base 50-300 €/sem (F0.F1); refinable; dato ausente = ABIERTO,
         jamás se asume"
}

VALUE_OBJECT UmbralViabilidad {
  ingresos_semana_min      : Dinero | ABIERTO
  ingresos_semana_objetivo : Dinero | ABIERTO
  disposicion_pagar_min    : Dinero | ABIERTO
  por_tipo_nicho           : Map<TipoNicho, UmbralEspecifico> | ABIERTO
  exige_vb_previo_construir: Boolean | ABIERTO
}
```

#### C3 · `VeredictoViabilidad` — MICRO-AGENTE

```
CLASE VeredictoViabilidad {
  ATRIBUTOS { criterio : LectorCriterioViabilidad }
  METODO emitir(informe: EstudioDemandaInforme): Veredicto {
    umbral ← criterio.lee()
    SI umbral.algunoABIERTO() ENTONCES
        RETORNAR Veredicto.PUENTE("umbral_sin_declarar")
    FIN_SI
    señal_dura ← mide(informe)                                // reflejo
    SI señal_dura.insuficientePara(umbral): RETORNAR Veredicto.NO_VIABLE(razon = ...)
    SI señal_dura.cumplePara(umbral):       RETORNAR Veredicto.VIABLE(razon = ...)
    RETORNAR Veredicto.PUENTE("señal ambigua, requiere juicio")  // fuzzy
  }
  REGLA: "corte DURO (viable|no-viable) solo si el reflejo lo resuelve con el
         criterio custodio; ambigüedad → PUENTE (nunca invento intermedio)"
}

ENUM Decision { VIABLE, NO_VIABLE, PUENTE }
VALUE_OBJECT Veredicto {
  decision   : Decision
  razon      : String
  evidencia  : EstudioDemandaInforme
  instante   : Instante
}
```

#### C4 · `CaminoEncontrarConstruir` — MICRO-AGENTE

```
CLASE CaminoEncontrarConstruir {
  ATRIBUTOS { criterio : LectorCriterioViabilidad }
  METODO decidir(informe: EstudioDemandaInforme, veredicto: Veredicto):
    Resultado<Camino | SolicitudDecision>
  {
    PRECONDICION veredicto.decision == VIABLE
    riesgo    ← estimarRiesgo(informe)                        // fuzzy
    atajo     ← buscaCaminoRapidoACaja(informe)               // fuzzy
    SI atajo.existe Y riesgo.esBajo: RETORNAR Ok(Camino.ENCONTRAR(atajo))
    SI criterio.lee().exige_vb_previo_construir == true Y riesgo.esAlto ENTONCES
        RETORNAR SolicitudDecision(
          tipo     = CAMINO_CONSTRUIR_VB,
          contexto = {informe, riesgo, atajo_posible}
        )
    FIN_SI
    RETORNAR Ok(Camino.CONSTRUIR(riesgo))
  }
  REGLA: "decide carácter de D1; si la política exige vb humano para construir
         (riesgo alto), emite SolicitudDecision — no se arroga el riesgo"
}

ENUM TipoCamino { ENCONTRAR, CONSTRUIR }
VALUE_OBJECT Camino { tipo : TipoCamino · detalle : Opt<Atajo | Riesgo> }
```

#### C5 · `BatchValidacion` — REFLEJO (desacople del cuello)

```
CLASE BatchValidacion {
  ATRIBUTOS {
    cola    : ColaCandidatosValidacion         // L2
    tamaño  : Entero | ABIERTO                 // declarado por B3 o H2
    worker  : Pool<Validador>                  // tantos como tamaño
  }
  METODO correr(): Void {
    PRECONDICION tamaño >= 1
    lote ← cola.sacarHasta(tamaño)
    PARA candidato EN lote EN PARALELO: worker.lanzar(c -> validarCompleto(c))
  }
  METODO validarCompleto(candidato: CandidatoNicho): Resultado<Veredicto> {
    informe   ← EstudioDemanda.estudiar(candidato, candidato.id_nicho)
    veredicto ← VeredictoViabilidad.emitir(informe)
    RETORNAR Ok(veredicto)                     // el OrquestadorNicho continúa
  }
  REGLA: "no juzga; solo desacopla al cuello para que N nichos avancen a la vez"
}
```

#### C6 · `CortadorTempranoSangria` — REFLEJO (positivo: sella el estado)

```
CLASE CortadorTempranoSangria {
  METODO procesar(nicho: IdNicho, veredicto: Veredicto):
    Resultado<Transicion>
  {
    PRECONDICION veredicto.decision == NO_VIABLE
    RETORNAR Ok(Transicion(
      desde    = VALIDANDO,
      hasta    = CORTADO_PRE_CONSTRUCCION,
      causa    = Causa.VEREDICTO_NO_VIABLE(veredicto),
      instante = Instante.ahora(),
      autor    = Autor.SISTEMA
    ))
  }
  REGLA: "al cruzar NO_VIABLE, sella 'cortado_pre_construcción' — así NO cuesta
         construcción (protege el cuadro de salud)"
}
```

#### C7 · `ReglasAprendidasValidacion` — MICRO-AGENTE

```
CLASE ReglasAprendidasValidacion {
  ATRIBUTOS {
    historial  : LectorHistorial                // L4
    cuadro     : LectorCuadroSalud              // F3
    umbral_min_corridas : Entero = 10           // ABIERTO declarable
  }
  METODO proponerAjuste(): Opt<SolicitudDecision> {
    cerrados ← historial.proyectosCerrados()
    SI cerrados.tam < umbral_min_corridas: RETORNAR vacio
    patron   ← correlar(cerrados, cuadro.estadoActual())      // fuzzy
    SI patron.indicaAjusteUmbral ENTONCES
        RETORNAR SolicitudDecision(
          tipo     = AJUSTE_UMBRAL_SUGERIDO,
          contexto = {patron, umbral_actual, umbral_sugerido},
          opciones = [adoptar(nuevo), mantener(actual), parcial(delta)]
        )
    FIN_SI
    RETORNAR vacio
  }
  REGLA: "nunca ajusta el umbral directo; propone al dueño con evidencia — el
         CriterioViabilidad lo integra solo tras RespuestaDecision"
}
```

### HUECO D · CONSTRUCTOR (F3)

#### D1 · `EnsambladorSolucion` — MICRO-AGENTE + reflejos

```
CLASE EnsambladorSolucion {
  ATRIBUTOS {
    catalogo    : CatalogoCapacidadesFaltantes  // D3
    puerto_cob  : PuertoAbierto                 // E3 — para que D4 enganche el modelo
  }
  METODO ensamblar(nicho: IdNicho, veredicto: Veredicto, camino: Camino):
    Resultado<SolucionOperable | SolicitudDecision | PuenteHumanoAviso>
  {
    PRECONDICION veredicto.decision == VIABLE
    plan        ← disenarSolucion(nicho, veredicto, camino)   // fuzzy — el agente
    necesarios  ← plan.capacidadesNecesarias()
    faltantes   ← necesarios.menos(catalogo.disponibles())
    SI faltantes.alguna(f -> f.sinAlternativa) ENTONCES
        RETORNAR PuenteHumanoAviso(nicho, faltantes.sinAlternativa())
    FIN_SI
    PARA f EN faltantes:
        catalogo.encargarCreacion(f)                          // invariante "se crea"
    FIN_PARA
    pieza_ejecutable ← ejecutarPlan(plan)                     // reflejo determinista
    RETORNAR Ok(SolucionOperable(nicho, pieza_ejecutable, plan))
  }
  REGLA: "el agente decide QUÉ construir y traza el plan; el reflejo ejecuta el
         plan; si falta algo sin alternativa, es el único momento donde emerge
         el PuenteHumano — no antes, no después"
}

VALUE_OBJECT SolucionOperable {
  id_proyecto     : IdProyecto                 // promocionado desde IdNicho tras aprobar
  pieza           : PiezaEjecutable
  plan            : PlanSolucion
  modelo_cobro    : ModeloCobro | ABIERTO      // relleno por D4
  canal_entrega   : Opt<CanalDistribucion>
  instante        : Instante
}
```

#### D2 · `PuenteHumano` — PUENTE (evento)

```
CLASE PuenteHumano {
  ATRIBUTOS {
    puerto_canal : PuertoCanal                  // G1
    cola_gate    : ColaDecisionesGate           // K2
  }
  METODO alzar(nicho: IdNicho, bloqueo: BloqueoSinAlternativa):
    Resultado<SolicitudDecision>
  {
    paquete ← PaqueteContexto(
      titulo    = "Enki no sabe — bloqueo sin alternativa",
      nicho_id  = nicho,
      problema  = bloqueo.descripcion,
      evidencia = bloqueo.rastro_de_intentos,
      alternativas_exploradas = bloqueo.alternativas_descartadas
    )
    solicitud ← SolicitudDecision(
      tipo     = PUENTE_HUMANO,
      contexto = paquete,
      opciones = [sugerir_recurso, descartar_nicho, posponer_con_contexto]
    )
    cola_gate.encolar(solicitud)
    puerto_canal.enviar(Mensaje.decision(solicitud))
    RETORNAR Ok(solicitud)
  }
  REGLA: "excepción, no flujo normal; empaqueta nicho+problema+alternativas
         exploradas para que el dueño decida con contexto, no de cero"
}

VALUE_OBJECT BloqueoSinAlternativa {
  descripcion              : String
  rastro_de_intentos       : Array<Intento>
  alternativas_descartadas : Array<Alternativa>
}
```

#### D3 · `CatalogoCapacidadesFaltantes` — CUSTODIO

```
CLASE CatalogoCapacidadesFaltantes {
  ATRIBUTOS {
    store : AlmacenInmutable<EstadoCatalogo>
    autor : AutorAutorizado = Sistema          // el único que escribe es el ensamblador
  }
  METODO disponibles(): Array<Capacidad> { RETORNAR store.ultimo().disponibles }
  METODO encargarCreacion(c: Capacidad): Resultado<EncargoCapacidad> {
    e      ← EncargoCapacidad.nuevo(c, Instante.ahora())
    nueva  ← store.ultimo().añadirEncargo(e)
    store.guardar(nueva)
    RETORNAR Ok(e)
  }
  METODO marcarDisponible(c: Capacidad): Void {
    nueva ← store.ultimo().promover(c)
    store.guardar(nueva)
  }
  REGLA: "invariante 'si no existe, se crea' aterriza aquí: cada falta se encola
         como encargo; cuando se cubre, pasa a disponibles. Nada se asume."
}

VALUE_OBJECT EstadoCatalogo {
  disponibles : Array<Capacidad>
  encargos    : Array<EncargoCapacidad>
}
```

#### D4 · `ProponedorModeloCobro` — MICRO-AGENTE

```
CLASE ProponedorModeloCobro {
  ATRIBUTOS { perfil_cobro : LectorPerfilCobroPorNicho }   // I1
  METODO proponer(nicho: IdNicho, solucion: SolucionOperable):
    ModeloCobro
  {
    tipo_nicho   ← clasificar(nicho, solucion)                 // fuzzy
    perfil_base  ← perfil_cobro.plantillaPara(tipo_nicho)      // reflejo
    propuesta    ← afinar(perfil_base, solucion.plan)          // fuzzy
    RETORNAR propuesta                                         // el gate E2 la confirma
  }
  REGLA: "propone un modelo con base en lo declarado por el dueño en I1; nunca
         ejecuta cobro — eso es E3 tras E2"
}

VALUE_OBJECT ModeloCobro {
  esquema     : EsquemaCobro                   // {una_vez, suscripcion, uso, mixto}
  precio_base : Dinero | ABIERTO
  cadencia    : Cadencia | ABIERTO
  condiciones : Array<Condicion>
  canal_cobro : NombrePuerto | ABIERTO
}
```

### HUECO E · OPERADOR-COBRO (F4)

#### E1 · `EstudioCompetencia` — MICRO-AGENTE + reflejos

```
CLASE EstudioCompetencia {
  ATRIBUTOS { puertos_fuente · conversor · gestor_limites · imputador }
  METODO estudiar(solucion: SolucionOperable): EstudioCompetenciaInforme {
    hits         ← barrerCompetidores(solucion)                // reflejo
    panorama     ← normalizar(hits)                            // reflejo
    diferencial  ← juzgarQueOfrecemosDistinto(panorama,        // fuzzy
                                               solucion)
    imputador.registrarConsumo(solucion.id_proyecto, correlacion)
    RETORNAR EstudioCompetenciaInforme(solucion, panorama, diferencial)
  }
  REGLA: "antes del gate; nunca decide operar — hidrata el paquete que E2 envía"
}

VALUE_OBJECT EstudioCompetenciaInforme {
  solucion        : SolucionOperable
  panorama        : PanoramaCompetitivo
  diferencial     : HiloDiferencial                             // texto del agente
  fuentes_usadas  : Array<NombrePuerto>
  coste_estudio   : Dinero
  instante        : Instante
}
```

#### E2 · `GateDecisionOperar` — PUENTE

```
CLASE GateDecisionOperar {
  ATRIBUTOS {
    puerto_canal     : PuertoCanal
    cola_gate        : ColaDecisionesGate
    paquetador       : PaquetadorDecisionAutoexplicado      // H1
    cuadro_salud     : LectorCuadroSalud                    // F3 — para proyeccion
  }
  METODO abrir(solucion: SolucionOperable,
               competencia: EstudioCompetenciaInforme,
               modelo: ModeloCobro): Resultado<SolicitudDecision>
  {
    proyeccion ← estimarFlujo(modelo, competencia, cuadro_salud)   // reflejo
    paquete    ← paquetador.empaquetar(
                   nicho_id     = solucion.id_proyecto,
                   evidencia    = {solucion, competencia, modelo},
                   riesgo       = proyeccion.riesgo,
                   alternativa  = proyeccion.alternativaBreve()
                 )
    solicitud  ← SolicitudDecision(
      tipo     = GATE_OPERAR,
      contexto = paquete,
      opciones = [aprobar_operar, pedir_ajuste(modelo), rechazar]
    )
    cola_gate.encolar(solicitud)
    puerto_canal.enviar(Mensaje.decision(solicitud))
    RETORNAR Ok(solicitud)
  }
  REGLA: "paquete cerrado al dueño por evento — competencia + modelo + proyección;
         nunca reunión síncrona; el resto del sistema sigue autónomo esperando"
}
```

#### E3 · `MotorCobro` — REFLEJO puro

```
CLASE MotorCobro {
  ATRIBUTOS { puertos_cobro : Array<PuertoCobro> }   // declarados en despliegue
  METODO ejecutar(proyecto: IdProyecto, modelo: ModeloCobro, venta: Venta):
    Resultado<Cobro | PromesaCobro>
  {
    PRECONDICION puertos_cobro.alguno(p -> p.estaCableado())
    puerto ← puertos_cobro.elegir(modelo.canal_cobro)
    r      ← puerto.enviar(Peticion.cobrar(venta, modelo))
    SI r.esEfectivo: RETORNAR Ok(Cobro(efectivo, r.detalle, Instante.ahora()))
    SI r.esPromesa : RETORNAR Ok(PromesaCobro(r.detalle, r.vencimiento))
    RETORNAR Rechazo(r.motivo)
  }
  METODO registrar(c: Cobro | PromesaCobro): Void {
    // emite al RegistroCobros (F1) por contrato — ver §4
  }
  REGLA: "cero juicio; ejecuta y distingue cobro efectivo de promesa — el reflejo
         es LA regla, no una interpretación"
}

VALUE_OBJECT Venta { id_proyecto · comprador_opaco · unidades · total }
VALUE_OBJECT Cobro { tipo = EFECTIVO · detalle · instante · importe }
VALUE_OBJECT PromesaCobro { tipo = COMPROMETIDO · detalle · vencimiento · importe }
```

#### E4 · `CanalDistribucion` — PUENTE

```
CLASE CanalDistribucion {
  ATRIBUTOS { puertos_distribucion : Array<PuertoDistribucion> }
  METODO llevar(solucion: SolucionOperable, modelo: ModeloCobro):
    Resultado<EnvioAPagador>
  {
    PRECONDICION puertos_distribucion.alguno(p -> p.estaCableado())
    puerto ← elegirCanal(modelo.canal_cobro, solucion.plan.tipo_nicho)
    envio  ← puerto.enviar(Paquete(solucion, modelo))
    RETORNAR Ok(envio)
  }
  REGLA: "conecta la solución con el pagador del nicho por el canal declarado;
         si no hay canal cableado, SolicitudDecision(DECLARACION_ABIERTA)"
}
```

### HUECO F · MONITOR SALUD FINANCIERA (medida maestra)

#### F1 · `RegistroCobros` — CUSTODIO (append-only)

```
CLASE RegistroCobros {
  ATRIBUTOS {
    store : LogInmutable<EntradaCobro>         // append-only, nunca se borra
    autor : AutorAutorizado = MotorCobro | AdminFinanciero
  }
  METODO registrar(e: EntradaCobro, por: Autor): Resultado<RefCobro> {
    PRECONDICION por en autor
    ref ← store.append(e.sellar(por, Instante.ahora()))
    RETORNAR Ok(ref)
  }
  METODO consultar(filtro: Filtro): Array<EntradaCobro> {
    RETORNAR store.filtrar(filtro)
  }
  REGLA: "append-only; distingue cobro efectivo de promesa; un solo escritor
         con permiso tipado"
}

VALUE_OBJECT EntradaCobro {
  id_proyecto : IdProyecto
  tipo        : TipoCobro                      // EFECTIVO | COMPROMETIDO | DEVUELTO
  importe     : Dinero
  cobro_ref   : String
  instante    : Instante
}
```

#### F2 · `ImputacionCostesProyecto` — REFLEJO

```
CLASE ImputacionCostesProyecto {
  ATRIBUTOS { imputador_fuente : ImputadorCosteFuente }      // J4
  METODO costeAcumulado(proyecto: IdProyecto, hasta: Instante): Dinero {
    coste_construccion ← medirConstruccion(proyecto, hasta)   // reflejo
    coste_operacion    ← medirOperacion(proyecto, hasta)      // reflejo
    coste_fuentes      ← imputador_fuente.coste(proyecto, hasta)
    RETORNAR coste_construccion + coste_operacion + coste_fuentes
  }
  REGLA: "cálculo agregado determinista; no inventa coste donde no hay registro"
}
```

#### F3 · `CuadroSaludFinanciera` — CUSTODIO + REFLEJO

```
CLASE CuadroSaludFinanciera {
  ATRIBUTOS {
    store_vistas       : AlmacenInmutable<VistaProyecto>
    lector_cobros      : LectorRegistroCobros                 // F1
    imputador_costes   : ImputacionCostesProyecto             // F2
    lector_criterio    : LectorCriterioViabilidad             // C2 — techo pérdida
  }
  METODO recalcular(proyecto: IdProyecto, hasta: Instante): VistaProyecto {
    cobros   ← lector_cobros.consultar(filtroProyecto(proyecto, hasta))
    efectivo ← cobros.filtrar(c -> c.tipo == EFECTIVO).sumar()
    costes   ← imputador_costes.costeAcumulado(proyecto, hasta)
    flujo    ← FlujoCaja(Intervalo(primer_cobro, hasta), efectivo, costes)
    estado   ← decidirEstado(flujo, lector_criterio.lee())    // reflejo determinista
    vista    ← VistaProyecto(proyecto, flujo, estado, hasta)
    store_vistas.guardar(vista)
    RETORNAR vista
  }
  METODO estadoActual(proyecto: IdProyecto): VistaProyecto {
    RETORNAR store_vistas.ultimaDe(proyecto)
  }
  REGLA: "estado genera|sangra|neutro surge del cálculo con el criterio custodio;
         el cuadro NO decide corte — el F4 alerta, el dueño/jefe deciden"
}

ENUM EstadoSalud { GENERA, SANGRA, NEUTRO }
VALUE_OBJECT VistaProyecto { id_proyecto · flujo · estado : EstadoSalud · hasta }
```

#### F4 · `AlertaSangria` — PUENTE

```
CLASE AlertaSangria {
  ATRIBUTOS {
    cuadro       : LectorCuadroSalud
    criterio     : LectorCriterioViabilidad
    puerto_canal : PuertoCanal
    cola_gate    : ColaDecisionesGate
    perfil_sup   : LectorPerfilSupervision                   // H2 — cadencia
  }
  METODO barrer(ahora: Instante): Array<SolicitudDecision> {
    emitidas ← []
    PARA p EN cuadro.todosProyectosActivos():
        vista ← cuadro.estadoActual(p)
        SI cruzaTechoPerdida(vista, criterio.lee()) ENTONCES
            s ← SolicitudDecision(
              tipo     = ALERTA_SANGRIA,
              contexto = {vista, criterio.lee()},
              opciones = [matar, reencuadrar, posponer_con_contexto]
            )
            cola_gate.encolar(s)
            puerto_canal.enviar(Mensaje.alerta(s))
            emitidas.añadir(s)
        FIN_SI
    FIN_PARA
    RETORNAR emitidas
  }
  REGLA: "notifica cuando cruza el techo declarado; nunca mata el proyecto por
         sí misma — el dueño decide con la opción tipada"
}
```

### HUECO G · CANAL SUPERVISIÓN

#### G1 · `PuertoCanal` — PUENTE

```
INTERFAZ PuertoCanal EXTIENDE PuertoAbierto<Mensaje, Confirmacion> {
  nombre()                   : String
  recibir()                  : Flujo<MensajeEntrante>
  enviar(m: Mensaje)         : Resultado<Confirmacion>
  estaCableado()             : Boolean
}

CLASE RegistroCanales {                        // multi-canal: declarable
  ATRIBUTOS { canales : Map<String, PuertoCanal> }
  METODO registrar(nombre, impl: PuertoCanal): Void
  METODO despacharEntrante(m: MensajeEntrante): Void
  METODO despacharSaliente(m: Mensaje, destino: Opt<String>): Void
  REGLA: "varios canales coexisten; si uno cae, los demás siguen; cambiar canal
         no toca lógica de dominio — se añade otro cableado"
}

VALUE_OBJECT Mensaje {
  escalon         : EscalonMensaje              // PULSO | ALERTA | DECISION
  cuerpo          : String | Paquete
  solicitud_ref   : Opt<IdCorrelacion>
}
```

#### G2 · `EscalonesMensaje` — REFLEJO

```
CLASE EscalonesMensaje {
  ATRIBUTOS {
    perfil_sup   : LectorPerfilSupervision
  }
  METODO clasificar(evento: EventoDominio): EscalonMensaje {
    SI evento.esSolicitudDecision          : RETORNAR EscalonMensaje.DECISION
    SI evento.esAlertaSangriaOrDesviacion  : RETORNAR EscalonMensaje.ALERTA
    SI perfil_sup.lee().aceptaPulsoDe(evento): RETORNAR EscalonMensaje.PULSO
    RETORNAR EscalonMensaje.SILENCIO
  }
  METODO cadenciaDe(e: EscalonMensaje): Cadencia {
    RETORNAR perfil_sup.lee().cadenciaPara(e)
  }
  REGLA: "regla declarada, no aprendida; el dueño en H2 fija qué merece pulso,
         qué merece alerta y qué merece decisión"
}

ENUM EscalonMensaje { PULSO, ALERTA, DECISION, SILENCIO }
```

#### G3 · `ClasificadorIntencion` — MICRO-AGENTE

```
CLASE ClasificadorIntencion {
  METODO clasificar(m: MensajeEntrante): IntencionEntrante {
    PRECONDICION m.cuerpo.noVacio()
    tipo ← juzgar(m.cuerpo, m.autor, m.meta)   // fuzzy — es lenguaje
    RETORNAR IntencionEntrante(tipo, m)
  }
  REGLA: "distingue semilla | respuesta_decision | consulta | ajuste; nunca
         confunde una respuesta de decisión con una semilla nueva"
}

ENUM TipoIntencion { SEMILLA, RESPUESTA_DECISION, CONSULTA, AJUSTE_CONFIG, DESCONOCIDO }
VALUE_OBJECT IntencionEntrante { tipo : TipoIntencion · mensaje : MensajeEntrante }
```

### HUECO H · INTERLOCUTOR DUEÑO

#### H1 · `PaquetadorDecisionAutoexplicado` — MICRO-AGENTE

```
CLASE PaquetadorDecisionAutoexplicado {
  ATRIBUTOS {
    historial : LectorHistorial                 // L4
    cuadro    : LectorCuadroSalud               // F3
  }
  METODO empaquetar(nicho_id, evidencia, riesgo, alternativa): PaqueteContexto {
    contexto_historico ← historial.contextoDe(nicho_id)
    estado_financiero  ← cuadro.estadoActual(nicho_id)
    narrativa          ← redactarAutoexplicada(                 // fuzzy
                           nicho_id, evidencia, riesgo,
                           alternativa, contexto_historico, estado_financiero
                         )
    RETORNAR PaqueteContexto(
      nicho_id, narrativa, evidencia, riesgo,
      alternativa, contexto_historico, estado_financiero
    )
  }
  REGLA: "el dueño nunca ve un ticket desnudo — ve nicho+evidencia+riesgo+
         alternativa+historia+situación financiera en un paquete legible"
}

VALUE_OBJECT PaqueteContexto {
  nicho_id            : IdNicho | IdProyecto
  narrativa           : String
  evidencia           : Array<Dato>
  riesgo              : NivelRiesgo
  alternativa         : Opt<Alternativa>
  contexto_historico  : Opt<CronologiaResumida>
  estado_financiero   : Opt<VistaProyecto>
}
```

#### H2 · `PerfilSupervision` — CUSTODIO

```
CLASE PerfilSupervision {
  ATRIBUTOS {
    store : AlmacenInmutable<PerfilSup>
    autor : AutorAutorizado = Dueño
  }
  METODO lee(): PerfilSup { RETORNAR store.ultimo() }
  METODO declara(cambio: CambioPerfil, por: Autor): Resultado<PerfilSup>
  REGLA: "cadencia y qué exige respuesta sí-o-sí vienen del dueño; el canal y
         el monitor consumen esta vista para no inundar"
}

VALUE_OBJECT PerfilSup {
  cadencia_pulso         : Cadencia | ABIERTO    // diario | semanal | ...
  decide_siempre         : Array<TipoDecision>   // GATE_OPERAR, PUENTE_HUMANO, ALERTA_SANGRIA ⊂
  umbral_nitidez_semilla : Decimal | ABIERTO     // debajo → SolicitudDecision
  canales_elegidos       : Array<NombrePuerto> | ABIERTO
  techo_perdida_proyecto : Dinero | ABIERTO
  cadencia_cuadro        : Cadencia | ABIERTO
}
```

### HUECO I · INTERLOCUTOR CLIENTE (M1·M2·M3 refuerzan — mismo cuerpo)

#### I1 · `PerfilCobroEntregaPorNicho` — CUSTODIO

```
CLASE PerfilCobroEntregaPorNicho {
  ATRIBUTOS {
    store : AlmacenInmutable<PerfilCobroEntrega>
    autor : AutorAutorizado = Constructor | Dueño
  }
  METODO plantillaPara(tipo: TipoNicho): PerfilCobroEntrega
  METODO declara(cambio, por): Resultado<PerfilCobroEntrega>
  REGLA: "contrato de pago/entrega por tipo de pagador declarado — no vendor-
         acoplado"
}

VALUE_OBJECT PerfilCobroEntrega {
  tipo_nicho          : TipoNicho              // empresa | persona | organismo
  esquema             : EsquemaCobro
  frecuencia          : Cadencia | ABIERTO
  canal_cobro_default : NombrePuerto | ABIERTO
  canal_entrega       : NombrePuerto | ABIERTO
  tiempo_entrega_max  : Duracion | ABIERTO
}
```

#### I2 · `PropuestaValorCanal` — MICRO-AGENTE

```
CLASE PropuestaValorCanal {
  METODO proponer(nicho: IdNicho, panorama: PanoramaCompetitivo,
                   canal_entrega: NombrePuerto): PropuestaValor
  {
    tono       ← inferirTono(nicho, canal_entrega)             // fuzzy
    gancho     ← redactarGancho(nicho, panorama)               // fuzzy
    RETORNAR PropuestaValor(nicho, canal_entrega, tono, gancho)
  }
  REGLA: "redacta cómo ganar confianza/compra en el territorio; sin ejecutar"
}
```

#### I3 · `ConfirmacionValorRecibido` — CUSTODIO + REFLEJO

```
CLASE ConfirmacionValorRecibido {
  ATRIBUTOS {
    store         : AlmacenInmutable<EntradaFeedback>
    puerto_canal  : PuertoCanal                 // ingesta via canal del pagador
    autor         : AutorAutorizado = Sistema | Pagador
  }
  METODO ingerir(feedback: FeedbackCrudo): Resultado<EntradaFeedback> {
    normal ← normalizar(feedback)                              // reflejo
    e      ← EntradaFeedback(normal).sellar(Autor.PAGADOR, Instante.ahora())
    store.guardar(e)
    RETORNAR Ok(e)
  }
  METODO consultar(proyecto): Array<EntradaFeedback>
  REGLA: "ingesta normalizada; un solo store; el feedback no decide reparto —
         alimenta al PaquetadorDecisionAutoexplicado"
}
```

### HUECO J · INTERLOCUTOR PROVEEDOR

#### J1 · `PuertoFuenteDatos` — PUENTE

```
INTERFAZ PuertoFuenteDatos EXTIENDE PuertoAbierto<Peticion, ResultadoCrudo> {
  nombre()           : String
  tipo()             : TipoFuente              // buscador, api, scraper, comunidad
  cuota()            : Cuota | ABIERTO
  autorizar(cfg)     : Void                    // despliegue
  enviar(p: Peticion): Resultado<ResultadoCrudo>
  REGLA: "cualquier fuente externa aterriza aquí; se reemplaza por EVENTO;
         si falta una, se declara abierta y se crea (invariante)"
}
```

#### J2 · `ConversorFuente` — CONVERSOR

```
CLASE ConversorFuente {
  METODO aNormalForma(crudo: ResultadoCrudo, origen: PuertoFuenteDatos):
    DatoHomogeneo
  {
    PRECONDICION origen.estaCableado()
    estrategia ← estrategiaParaTipo(origen.tipo())             // reflejo
    RETORNAR estrategia.convertir(crudo, origen.nombre())
  }
  REGLA: "la única frontera de formatos; cualquier dato que viene del exterior
         pasa por aquí para quedar homogéneo"
}

VALUE_OBJECT DatoHomogeneo {
  tipo        : TipoDato
  campos      : Map<String, ValorTipado>
  fuente      : NombrePuerto
  instante    : Instante
  trazabilidad: TrazaCrudo
}
```

#### J3 · `GestionLimitesFuente` — REFLEJO

```
CLASE GestionLimitesFuente {
  ATRIBUTOS {
    estado : Map<NombrePuerto, EstadoCuota>
  }
  METODO puedeConsumir(puerto: PuertoFuenteDatos): Boolean {
    PRECONDICION puerto.cuota().noAbierta()
    estado_actual ← estado[puerto.nombre()] ?: EstadoCuota.inicial(puerto.cuota())
    RETORNAR estado_actual.margen() > 0
  }
  METODO registrarConsumo(puerto: PuertoFuenteDatos, importe: UnidadCuota): Void {
    estado[puerto.nombre()] ← estado[puerto.nombre()].descontar(importe)
  }
  METODO ventana(puerto: PuertoFuenteDatos): Opt<Reset> {
    RETORNAR puerto.cuota().proximaVentana()
  }
  REGLA: "no quema recursos; cola de rate declarado; si la cuota es ABIERTA,
         emite SolicitudDecision(DECLARACION_ABIERTA) por el canal"
}
```

#### J4 · `ImputadorCosteFuente` — REFLEJO

```
CLASE ImputadorCosteFuente {
  ATRIBUTOS {
    tarifario : Map<NombrePuerto, Tarifa>      // declarado en despliegue
    log       : LogInmutable<ConsumoFuente>
  }
  METODO registrarConsumo(proyecto: IdProyecto, correlacion: IdCorrelacion): Void
  METODO coste(proyecto: IdProyecto, hasta: Instante): Dinero {
    consumos ← log.filtrar(c -> c.id_proyecto == proyecto Y c.instante <= hasta)
    RETORNAR consumos.map(c -> tarifario[c.fuente].aplicar(c.importe)).sumar()
  }
  REGLA: "coste por fuente → por proyecto; agrega a F2; sin tarifa, se declara
         [ABIERTO] y no se adivina"
}
```

### HUECO K · ROL JEFE

#### K1 · `VistaAgregadaPortafolio` — REFLEJO + CUSTODIO

```
CLASE VistaAgregadaPortafolio {
  ATRIBUTOS {
    cuadro : LectorCuadroSalud
    store  : AlmacenInmutable<VistaPortafolio>
    autor  : AutorAutorizado = Sistema
  }
  METODO recalcular(ahora: Instante): VistaPortafolio {
    por_proyecto ← cuadro.todos().map(p -> cuadro.estadoActual(p))
    agregada     ← VistaPortafolio(
      por_proyecto,
      resumen_generan  = contarEstado(por_proyecto, GENERA),
      resumen_sangran  = contarEstado(por_proyecto, SANGRA),
      flujo_total      = sumarFlujo(por_proyecto),
      instante         = ahora
    )
    store.guardar(agregada)
    RETORNAR agregada
  }
  REGLA: "una sola función de agregación determinista; el jefe la mira — no
         juzga por sensación"
}

VALUE_OBJECT VistaPortafolio {
  por_proyecto     : Array<VistaProyecto>
  resumen_generan  : Entero
  resumen_sangran  : Entero
  flujo_total      : FlujoCaja
  instante         : Instante
}
```

#### K2 · `ColaDecisionesGate` — CUSTODIO

```
CLASE ColaDecisionesGate {
  ATRIBUTOS {
    store : AlmacenOrdenado<SolicitudDecision>
    autor : AutorAutorizado = Sistema
  }
  METODO encolar(s: SolicitudDecision): Resultado<Void> {
    store.añadir(s.ordenarPor(prioridad, s.caducidad))
  }
  METODO siguientes(dueño: Autor): Array<SolicitudDecision> {
    RETORNAR store.pendientesPara(dueño).ordenadas()
  }
  METODO cerrar(s_id, r: RespuestaDecision): Resultado<Void> {
    PRECONDICION store.contiene(s_id)
    store.marcarCerrada(s_id, r)
  }
  REGLA: "una sola cola; el jefe/dueño resuelve en orden declarado por H2
         (gates críticos primero)"
}
```

#### K3 · `AjustadorUmbrales` — REFLEJO + CUSTODIO

```
CLASE AjustadorUmbrales {
  ATRIBUTOS {
    criterio    : CriterioViabilidad           // escritor también aquí
    perfil_lim  : PerfilLimiteBusqueda
    perfil_sup  : PerfilSupervision
  }
  METODO aplicar(r: RespuestaDecision, por: Autor): Resultado<Void> {
    PRECONDICION por == Dueño | Jefe
    PARA cambio EN r.cambios_sugeridos:
        SEGUN cambio.destino:
            CRITERIO    : criterio.declara(cambio.payload, por)
            PERFIL_LIM  : perfil_lim.declara(cambio.payload, por)
            PERFIL_SUP  : perfil_sup.declara(cambio.payload, por)
    FIN_PARA
  }
  REGLA: "retunea en caliente, siempre con autor tipado; nunca cambia un umbral
         sin RespuestaDecision asociada"
}
```

### HUECO L · ROL TRABAJADOR

#### L1 · `PipelinePorNicho` — CUSTODIO (máquina de estados)

```
CLASE PipelinePorNicho {
  ATRIBUTOS {
    store_estado : AlmacenInmutable<Map<IdNicho, EstadoNicho>>
    historial    : HistorialPorNicho            // L4
    tabla_leyes  : Map<EstadoNicho, Set<EstadoNicho>>   // transiciones legales
    autor        : AutorAutorizado = Sistema
  }
  METODO transitar(id: IdNicho | IdProyecto, t: Transicion): Resultado<EstadoNicho> {
    PRECONDICION t.desde == store_estado.estadoDe(id)
    SI tabla_leyes[t.desde].noContiene(t.hasta) ENTONCES
        RETORNAR Rechazo("transicion_ilegal", t.desde, t.hasta)
    FIN_SI
    nuevo ← store_estado.aplicar(id, t.hasta)
    historial.registrar(id, t)
    RETORNAR Ok(t.hasta)
  }
  METODO estadoDe(id): EstadoNicho { RETORNAR store_estado.estadoDe(id) }
  REGLA: "la máquina de estados central; sin t.desde correcto, se rechaza —
         no hay 'estado por descuido' (IllegalStatesUnrepresentable)"
}

/*
  tabla_leyes (resumen):
  SEMILLA_CAPTURADA        → { SEMILLA_NORMALIZADA, ESPERANDO_DECISION_DUENO }
  SEMILLA_NORMALIZADA      → { BUSCANDO, ESPERANDO_DECISION_DUENO }
  BUSCANDO                 → { CANDIDATO_DETECTADO, CORTADO_PRE_CONSTRUCCION }
  CANDIDATO_DETECTADO      → { EN_COLA_VALIDACION }
  EN_COLA_VALIDACION       → { VALIDANDO }
  VALIDANDO                → { VEREDICTO_VIABLE, VEREDICTO_NO_VIABLE, VEREDICTO_PUENTE }
  VEREDICTO_PUENTE         → { ESPERANDO_DECISION_DUENO }
  VEREDICTO_NO_VIABLE      → { CORTADO_PRE_CONSTRUCCION }
  VEREDICTO_VIABLE         → { CONSTRUYENDO, ESPERANDO_DECISION_DUENO }
  CONSTRUYENDO             → { CONSTRUIDO, ESPERANDO_DECISION_DUENO }   // puente-humano
  CONSTRUIDO               → { ESPERANDO_GATE_OPERAR }
  ESPERANDO_GATE_OPERAR    → { ESPERANDO_DECISION_DUENO, OPERANDO }
  OPERANDO                 → { COBRADO_PRIMER_HITO, EN_SANGRIA }
  COBRADO_PRIMER_HITO      → { OPERANDO, EN_SANGRIA, CERRADO_EXITO }
  EN_SANGRIA               → { SANGRADO_CORTADO, OPERANDO }   // dueño decide
  ESPERANDO_DECISION_DUENO → { lo que la decisión indique legalmente }
*/
```

#### L2 · `ColaCandidatosValidacion` — CUSTODIO

```
CLASE ColaCandidatosValidacion {
  ATRIBUTOS {
    store : AlmacenOrdenado<CandidatoNicho>
    autor : AutorAutorizado = Buscador(B1)
  }
  METODO encolar(c: CandidatoNicho): Resultado<Void> {
    store.añadir(c.ordenarPor(senal_desc, instante_asc))
  }
  METODO sacarHasta(n: Entero): Array<CandidatoNicho> {
    RETORNAR store.extraerPrimeros(n)
  }
  METODO pendientes(): Entero { RETORNAR store.tam() }
  REGLA: "buffer del cuello; el batch bebe de aquí; sin lectores concurrentes
         cruzados (un escritor, los lectores no bloquean)"
}
```

#### L3 · `ManejoFalloReintento` — REFLEJO + PUENTE

```
CLASE ManejoFalloReintento {
  ATRIBUTOS {
    politica       : PoliticaReintento | ABIERTO
    puente_humano  : PuenteHumano
  }
  METODO manejar(fallo: FalloOperacion): Resultado<AccionTomada> {
    SI politica.aplicableA(fallo) Y politica.quedaReintento(fallo) ENTONCES
        RETORNAR Ok(AccionTomada.REINTENTO(politica.proximoDelay(fallo)))
    FIN_SI
    SI fallo.tieneAlternativaMecanica() ENTONCES
        RETORNAR Ok(AccionTomada.ALTERNATIVA(fallo.alternativaMecanica()))
    FIN_SI
    bloqueo ← BloqueoSinAlternativa.desde(fallo)
    puente_humano.alzar(fallo.id_nicho, bloqueo)
    RETORNAR Ok(AccionTomada.PUENTE_HUMANO)
  }
  REGLA: "reintenta mecánicamente mientras la política lo permita; sin alternativa,
         emerge el puente — jamás pierde el fallo en silencio"
}
```

#### L4 · `HistorialPorNicho` — CUSTODIO (append-only)

```
CLASE HistorialPorNicho {
  ATRIBUTOS {
    log   : LogInmutable<EventoHistorial>
    autor : AutorAutorizado = Pipeline
  }
  METODO registrar(id: IdNicho, t: Transicion): Resultado<Void> {
    log.append(EventoHistorial.transicion(id, t))
  }
  METODO registrarDecision(id, s: SolicitudDecision, r: RespuestaDecision): Void {
    log.append(EventoHistorial.decision(id, s, r))
  }
  METODO cronologia(id: IdNicho): Array<EventoHistorial> {
    RETORNAR log.filtrar(e -> e.id == id).ordenadosPorInstante()
  }
  METODO filtrarPorAfinidad(semilla): Array<CronologiaResumida> // consumido por B2/C7
  REGLA: "append-only; único dueño es el pipeline; sin él, no hay memoria del
         ciclo semilla→caja"
}
```

#### L5 · `PulsoAvanceEtapa` — REFLEJO

```
CLASE PulsoAvanceEtapa {
  ATRIBUTOS {
    pipeline      : LectorPipeline
    perfil_sup    : LectorPerfilSupervision
    puerto_canal  : PuertoCanal
    escalones     : EscalonesMensaje
  }
  METODO barrer(ahora: Instante): Void {
    PARA p EN pipeline.todosProyectosActivos():
        pulso ← construirPulso(p, pipeline.estadoDe(p), ahora)   // reflejo
        esc   ← escalones.clasificar(EventoDominio.pulsoAvance(p, pulso))
        SI esc == EscalonMensaje.PULSO Y perfil_sup.lee().cadenciaDebida(ahora)
            puerto_canal.enviar(Mensaje(esc, pulso, Opt.vacio))
        FIN_SI
    FIN_PARA
  }
  REGLA: "progreso por etapa → escalones al supervisor; sin inundar — la
         cadencia manda"
}
```

### HUECO M · ROL CLIENTE — refuerza I

```
NOTA: M1, M2, M3 refuerzan I1, I2, I3 — mismo cuerpo, mismo contrato.
Si en despliegue se necesitase una vista interna de cobro/entrega distinta a
la del interlocutor cliente, se descompone en subclases; aquí comparten clase.
```

### ESLABÓN ADICIONAL · `OrquestadorNicho`

```
CLASE OrquestadorNicho {           // teje las clases en el flujo semilla→caja
  ATRIBUTOS {
    captura         : CapturadorSemilla
    normalizador    : NormalizadorSemilla
    sondeador       : SondeadorTerritorio
    cola_val        : ColaCandidatosValidacion
    batch           : BatchValidacion
    cortador        : CortadorTempranoSangria
    camino          : CaminoEncontrarConstruir
    ensamblador     : EnsambladorSolucion
    proponedor_mc   : ProponedorModeloCobro
    estudio_comp    : EstudioCompetencia
    gate_operar     : GateDecisionOperar
    motor_cobro     : MotorCobro
    canal_dist      : CanalDistribucion
    pipeline        : PipelinePorNicho
    historial       : HistorialPorNicho
    reglas_c7       : ReglasAprendidasValidacion
    reglas_b2       : ReglasExclusionAprendidas
    alerta_f4       : AlertaSangria
    pulso_l5        : PulsoAvanceEtapa
    cuadro_f3       : CuadroSaludFinanciera
  }

  METODO procesarEntrante(m: MensajeEntrante): Resultado<Void> {
    intencion ← ClasificadorIntencion.clasificar(m)
    SEGUN intencion.tipo:
      SEMILLA              : abrirCiclo(m)
      RESPUESTA_DECISION   : cerrarGate(m)
      CONSULTA             : contestarEstado(m)
      AJUSTE_CONFIG        : encolarCambio(m)
      DESCONOCIDO          : emitirAyuda(m)
    FIN_SEGUN
  }

  METODO abrirCiclo(m: MensajeEntrante): Void {
    sc ← captura.capturar(m).valor
    pipeline.transitar(sc.id, Transicion(desde=null, hasta=SEMILLA_CAPTURADA, ...))
    sn ← normalizador.normalizar(sc)
    SI sn.esSolicitudDecision ENTONCES
        encolarGate(sn)
        pipeline.transitar(sc.id, hasta=ESPERANDO_DECISION_DUENO)
        RETORNAR
    FIN_SI
    pipeline.transitar(sc.id, hasta=SEMILLA_NORMALIZADA)
    candidatos ← sondeador.sondear(sn.valor).valor
    PARA c EN candidatos:
        cola_val.encolar(c)
        pipeline.transitar(c.id_nicho, hasta=EN_COLA_VALIDACION)
    FIN_PARA
    batch.correr()                      // despachador paralelo
  }

  METODO tras_veredicto(id, veredicto): Void {
    SEGUN veredicto.decision:
      VIABLE     : seguirAConstruir(id, veredicto)
      NO_VIABLE  : cortador.procesar(id, veredicto) → pipeline.transitar(... CORTADO ...)
      PUENTE     : encolarGate(SolicitudDecision(VEREDICTO_PUENTE, ...))
    FIN_SEGUN
  }

  METODO seguirAConstruir(id, veredicto): Void {
    camino_v ← camino.decidir(informe, veredicto)
    SI camino_v.esSolicitud: encolarGate(camino_v); RETORNAR
    sol ← ensamblador.ensamblar(id, veredicto, camino_v.valor)
    SI sol.esPuenteHumano: emitirPuente(sol); RETORNAR
    modelo ← proponedor_mc.proponer(id, sol.valor)
    comp   ← estudio_comp.estudiar(sol.valor)
    gate_operar.abrir(sol.valor, comp, modelo)
    pipeline.transitar(id, hasta=ESPERANDO_GATE_OPERAR)
  }

  METODO tras_gate_aprobado(id, modelo): Void {
    canal_dist.llevar(solucionDe(id), modelo)
    pipeline.transitar(id, hasta=OPERANDO)
    // cobros llegan por motor_cobro → RegistroCobros → CuadroSaludFinanciera
  }

  REGLA: "teje las piezas; no agrega lógica de dominio; cada paso delega a su
         clase; el pipeline sella la transición"
}
```

---

## 3 · Puertos abiertos (`p1`..`p6`)

| Puerto | Nombre lógico | Qué cablea | Cablean en despliegue |
|---|---|---|---|
| **p1** | `PuertoCanal` | Canal(es) de supervisión con el dueño | nombres de medios de mensajería declarados por el dueño |
| **p2** | `PuertoFuenteDatos` | Fuentes de detección y validación | buscadores, APIs, scrapers, comunidades autorizadas por el dueño |
| **p3** | `PuertoCobro` | Plataformas de ejecución de cobro | procesadores declarados; si falta, se crea (invariante) |
| **p4** | `PuertoDistribucion` | Canales para llevar la solución al pagador | según tipo de nicho; declarados en D1/E4 |
| **p5** | `PuertoRelojCalendario` | Fuente de tiempo monotónico + cadencias | reloj del sistema del despliegue |
| **p6** | `PuertoAlmacen` | Backing para `AlmacenInmutable` y `LogInmutable` | almacén local o remoto; append-only garantizado |

Todos exponen la interfaz `PuertoAbierto<E,S>` + `nombre()` + `estaCableado()`.
Hasta que no estén cableados, el sistema **no simula**: emite
`SolicitudDecision(DECLARACION_ABIERTA)` con la pieza que falta.

---

## 4 · Contratos de eventos de dominio (familia PULSO + RPC + fallo canónico)

> **Regla:** cada evento declara `tipo`, `id_correlacion`, `instante`, `payload`
> tipado, y si el flujo abre un círculo, **cierra su par `.failed`**.

### 4.1 · Familia PULSO (notificación de avance)

```json
{
  "tipo": "nicho.semilla.capturada",
  "id_correlacion": "<ulid>",
  "instante": "<iso8601>",
  "payload": {
    "id_nicho": "<ulid>",
    "canal": "<nombre_puerto>",
    "autor": "<ref_autor>"
  }
}
```

```json
{ "tipo": "nicho.semilla.normalizada",
  "payload": { "id_nicho": "<ulid>", "intenciones": ["..."], "nitidez": 0.0-1.0 } }

{ "tipo": "nicho.candidato.detectado",
  "payload": { "id_nicho": "<ulid>", "titulo": "...", "senal": 0.0-1.0,
               "territorio": "...", "evidencia_inicial": [...] } }

{ "tipo": "nicho.validacion.iniciada",
  "payload": { "id_nicho": "<ulid>" } }

{ "tipo": "nicho.estudio_demanda.completado",
  "payload": { "id_nicho": "<ulid>",
               "demanda_1er_orden": {"valor": N, "unidad": "...", "confianza": 0.0-1.0},
               "disposicion_a_pagar": "<Dinero|ABIERTO>",
               "fuentes_usadas": ["..."] } }

{ "tipo": "nicho.veredicto.emitido",
  "payload": { "id_nicho": "<ulid>",
               "decision": "VIABLE|NO_VIABLE|PUENTE", "razon": "..." } }

{ "tipo": "nicho.camino.decidido",
  "payload": { "id_nicho": "<ulid>", "tipo": "ENCONTRAR|CONSTRUIR" } }

{ "tipo": "nicho.cortado.pre_construccion",
  "payload": { "id_nicho": "<ulid>", "razon": "..." } }

{ "tipo": "nicho.construccion.iniciada",
  "payload": { "id_proyecto": "<ulid>" } }

{ "tipo": "nicho.construccion.completada",
  "payload": { "id_proyecto": "<ulid>",
               "capacidades_creadas": [...],
               "capacidades_faltantes_pendientes": [...] } }

{ "tipo": "nicho.modelo_cobro.propuesto",
  "payload": { "id_proyecto": "<ulid>", "modelo": {...} } }

{ "tipo": "nicho.competencia.estudiada",
  "payload": { "id_proyecto": "<ulid>", "panorama": {...}, "diferencial": "..." } }

{ "tipo": "nicho.operacion.iniciada",
  "payload": { "id_proyecto": "<ulid>", "canal_entrega": "<nombre_puerto>" } }

{ "tipo": "nicho.cobro.registrado",
  "payload": { "id_proyecto": "<ulid>",
               "tipo": "EFECTIVO|COMPROMETIDO|DEVUELTO",
               "importe": {"cantidad": "...", "moneda": "EUR"},
               "cobro_ref": "..." } }

{ "tipo": "nicho.salud.recalculada",
  "payload": { "id_proyecto": "<ulid>", "estado": "GENERA|SANGRA|NEUTRO",
               "flujo": {...} } }

{ "tipo": "nicho.cerrado.exito",
  "payload": { "id_proyecto": "<ulid>", "resumen": {...} } }
```

### 4.2 · RPC (solicitud ↔ respuesta por decisión humana)

```json
{ "tipo": "decision.solicitud.abierta",
  "id_correlacion": "<ulid>",
  "payload": {
    "tipo_decision": "GATE_OPERAR|PUENTE_HUMANO|ALERTA_SANGRIA|...",
    "contexto": { "...paquete autoexplicado..." },
    "opciones": [ { "id": "aprobar_operar", "etiqueta": "...", "efectos": [...] }, ... ],
    "caducidad": "<iso8601>"
  }
}
```

```json
{ "tipo": "decision.solicitud.respondida",
  "id_correlacion": "<ulid>",
  "payload": {
    "opcion_elegida": "aprobar_operar",
    "dueno": "<ref_autor>",
    "nota_libre": "..."
  }
}
```

### 4.3 · Par de fallo canónico (todo flujo cierra su círculo)

```json
{ "tipo": "nicho.<accion>.failed",
  "id_correlacion": "<ulid>",
  "instante": "<iso8601>",
  "payload": {
    "id_nicho": "<ulid>",
    "razon_codigo": "FUENTE_SIN_CABLEAR | UMBRAL_SIN_DECLARAR | TRANSICION_ILEGAL | ...",
    "razon_detalle": "...",
    "accion_siguiente_declarada": "REINTENTO | PUENTE_HUMANO | SOLICITUD_DECLARACION | SILENCIO"
  }
}
```

Ejemplos concretos:
`nicho.semilla.normalizada.failed`, `nicho.sondeo.failed`,
`nicho.estudio_demanda.failed`, `nicho.construccion.failed`,
`nicho.cobro.failed`, `nicho.distribucion.failed`,
`decision.solicitud.caducada`.

### 4.4 · Invariantes del transporte

- `id_correlacion` propaga por toda la cadena del nicho; nada se emite sin él.
- Cada evento `.completado` tiene su par `.failed`; nunca un flujo muere mudo.
- `fuentes_usadas` queda rastreable en los eventos que consumen puertos de datos
  (auditoría del coste).

---

## 5 · Máquina de estados del nicho — semilla → caja (grafo literal)

```
                              [ SEMILLA_CAPTURADA ]
                                       │
                     ┌─────────────────┴─────────────────┐
                     ▼                                   ▼
         [ SEMILLA_NORMALIZADA ]            [ ESPERANDO_DECISION_DUENO ]
                     │                       (seed_normalizada_dudosa)
                     ▼                                   │
                [ BUSCANDO ]  ◄──────────────────────────┘
                     │
             ┌───────┴────────┐
             ▼                ▼
   [ CANDIDATO_DETECTADO ]  [ CORTADO_PRE_CONSTRUCCION ]  (si barrido seco)
             │
             ▼
   [ EN_COLA_VALIDACION ]
             │
             ▼
      [ VALIDANDO ]
             │
     ┌───────┼────────┬──────────────┐
     ▼       ▼        ▼              ▼
[VIABLE] [PUENTE] [NO_VIABLE]  [ESPERANDO_DECISION_DUENO]
   │        │        │
   │        ▼        ▼
   │   [ESPERANDO_DECISION_DUENO]  [CORTADO_PRE_CONSTRUCCION]
   │        │
   │  ┌─────┴──────┐
   │  ▼            ▼
   │ VIABLE   NO_VIABLE  → CORTADO
   ▼
[CONSTRUYENDO] ──puente_humano──► [ESPERANDO_DECISION_DUENO] ──► CONSTRUYENDO | CORTADO
   │
   ▼
[CONSTRUIDO]
   │
   ▼
[ESPERANDO_GATE_OPERAR] ──► [ESPERANDO_DECISION_DUENO] (gate_decision_operar)
   │                                   │
   │                            ┌──────┴──────┐
   │                            ▼             ▼
   │                       aprobar       rechazar/ajustar
   │                            │             │
   ▼                            ▼             └──► CORTADO_PRE_CONSTRUCCION
[OPERANDO] ──────► [COBRADO_PRIMER_HITO] ──► OPERANDO | CERRADO_EXITO
   │
   ▼
[EN_SANGRIA] ──► [ESPERANDO_DECISION_DUENO] (alerta_sangria) ──► SANGRADO_CORTADO | OPERANDO
```

**Invariantes de transición:**

- Cualquier estado puede saltar a `ESPERANDO_DECISION_DUENO` si surge una
  `SolicitudDecision` activa; al cerrarse, vuelve al estado legal declarado.
- `CORTADO_PRE_CONSTRUCCION` y `SANGRADO_CORTADO` son estados **terminales**:
  nada sale.
- `CERRADO_EXITO` es terminal con bandera positiva; la memoria queda para
  `C7` y `K1`.
- Toda transición pasa por `PipelinePorNicho.transitar` → se registra en
  `HistorialPorNicho`.

---

## 6 · Flujos principales

### 6.1 · Flujo feliz — semana típica

```
PASO 1 (DUEÑO → SISTEMA)
  Dueño escribe "renting de patinetes eléctricos para empresa" al canal.
  PuertoCanal.recibir() → MensajeEntrante.
  ClasificadorIntencion → SEMILLA.
  OrquestadorNicho.abrirCiclo(m).
    CapturadorSemilla.capturar → SemillaCapturada(id_nicho_x).
    PipelinePorNicho.transitar(id, SEMILLA_CAPTURADA).
    Emite nicho.semilla.capturada.

PASO 2 (A2)
  NormalizadorSemilla.normalizar → nitidez 0.78 > umbral 0.6 → SemillaNormalizada.
  PipelinePorNicho.transitar(id, SEMILLA_NORMALIZADA).
  Emite nicho.semilla.normalizada.

PASO 3 (B1)
  SondeadorTerritorio.sondear → 7 CandidatoNicho.
  PARA cada candidato:
    ColaCandidatosValidacion.encolar.
    PipelinePorNicho.transitar(c, EN_COLA_VALIDACION).
    Emite nicho.candidato.detectado.

PASO 4 (C5)
  BatchValidacion.correr (tamaño 3).
  EN PARALELO para 3 candidatos:
    EstudioDemanda.estudiar → informe (demanda_1er_orden, disposicion_a_pagar).
    VeredictoViabilidad.emitir → VIABLE | NO_VIABLE | PUENTE.
    Para 2 de 3 → VIABLE; 1 → NO_VIABLE.
    PipelinePorNicho.transitar(ids a VEREDICTO_*).

PASO 5 (C6)
  CortadorTempranoSangria procesa el NO_VIABLE.
  PipelinePorNicho.transitar → CORTADO_PRE_CONSTRUCCION.
  Emite nicho.cortado.pre_construccion. Nada más gasta ese nicho.

PASO 6 (C4)
  CaminoEncontrarConstruir.decidir para cada VIABLE.
  Ambos → Camino.ENCONTRAR (atajo).

PASO 7 (D1)
  EnsambladorSolucion.ensamblar para 2 proyectos.
  CatalogoCapacidadesFaltantes.encargarCreacion para 1 capacidad faltante.
  SolucionOperable entregada.
  PipelinePorNicho.transitar → CONSTRUIDO.
  Emite nicho.construccion.completada.

PASO 8 (D4)
  ProponedorModeloCobro.proponer → ModeloCobro (suscripcion mensual, 49€/empresa).

PASO 9 (E1)
  EstudioCompetencia.estudiar → EstudioCompetenciaInforme (3 competidores, diferencial).

PASO 10 (E2)
  GateDecisionOperar.abrir.
  PaquetadorDecisionAutoexplicado.empaquetar.
  ColaDecisionesGate.encolar(SolicitudDecision GATE_OPERAR).
  PuertoCanal.enviar(Mensaje.DECISION).
  PipelinePorNicho.transitar → ESPERANDO_GATE_OPERAR.
  (En paralelo: pulso del PASO 4 ya se mandó por L5 según cadencia.)

PASO 11 (DUEÑO → SISTEMA)
  Dueño responde "aprobar_operar" por canal.
  ClasificadorIntencion → RESPUESTA_DECISION.
  OrquestadorNicho.cerrarGate.
    ColaDecisionesGate.cerrar(id_s, RespuestaDecision).
    HistorialPorNicho.registrarDecision.
    PipelinePorNicho.transitar → OPERANDO.
    E4.CanalDistribucion.llevar.

PASO 12 (OPERACIÓN)
  Pagos entran por E3.MotorCobro.ejecutar.
  F1.RegistroCobros.registrar(EntradaCobro EFECTIVO, 49€).
  F3.CuadroSaludFinanciera.recalcular → VistaProyecto.estado = NEUTRO.
  Emite nicho.cobro.registrado + nicho.salud.recalculada.

PASO 13 (SEMANA +4)
  Ingreso acumulado > umbral → VistaProyecto.estado = GENERA.
  L5.PulsoAvanceEtapa barre y envía pulso al canal (cadencia semanal).
  K1.VistaAgregadaPortafolio.recalcular → 1 generan, 0 sangran.

CICLO CERRADO: semilla → cobro efectivo recurrente. Nada se decidió por el
sistema solo que no fuera cálculo determinista; el dueño decidió una vez
(gate operar).
```

### 6.2 · Flujo con puente humano (edge case alto)

```
Igual al feliz hasta PASO 7.
En PASO 7: D1.EnsambladorSolucion detecta "capacidad X faltante sin alternativa"
(ej.: integración con API de un organismo público sin documentación disponible).
  PuenteHumanoAviso devuelto.
  D2.PuenteHumano.alzar → SolicitudDecision(PUENTE_HUMANO) con paquete
    {nicho, problema, alternativas_exploradas: [...], rastro: [...]}.
  ColaDecisionesGate.encolar.
  PuertoCanal.enviar(Mensaje.DECISION).
  PipelinePorNicho.transitar → ESPERANDO_DECISION_DUENO.

El dueño responde: "sugerir_recurso: contactar al organismo por canal P".
  OrquestadorNicho.cerrarGate.
  CatalogoCapacidadesFaltantes.marcarDisponible (tras cablear el recurso).
  PipelinePorNicho.transitar → CONSTRUYENDO (reintenta ensamblaje).
```

### 6.3 · Flujo con sangría (edge case negativo)

```
Proyecto en OPERANDO desde hace 5 semanas.
F2.ImputacionCostesProyecto registra costes de operación crecientes (fuentes
caras + poca conversión).
F1.RegistroCobros registra solo 2 cobros efectivos.
F3.CuadroSaludFinanciera.recalcular → VistaProyecto.estado = SANGRA.
F4.AlertaSangria.barrer detecta cruce de techo (declarado por H2 = 500€).
  SolicitudDecision(ALERTA_SANGRIA) encolada + enviada al canal.
  PipelinePorNicho.transitar → EN_SANGRIA.

El dueño responde: "matar".
  OrquestadorNicho.cerrarGate.
  PipelinePorNicho.transitar → SANGRADO_CORTADO.
  HistorialPorNicho.registrarDecision.
  Costes congelados; no más gasto en fuentes (J3 lo refleja).

El sistema no decidió matar; el sistema midió, alertó y sellaron el corte
con autor explícito.
```

### 6.4 · Flujo "si no existe, se crea" (invariante)

```
En PASO 4, EstudioDemanda detecta que NINGUNA fuente autorizada mide la
"disposición a pagar" para un sector concreto (industria naval, por ejemplo).
  C1 ejecuta medición con fuentes disponibles → disposicion_a_pagar = ABIERTO.
  VeredictoViabilidad.emitir → PUENTE (campo abierto).
  SolicitudDecision(DECLARACION_ABIERTA, "fuente_disposicion_sector_naval").
  Dueño responde: "crear fuente via encuesta directa a 20 contactos".
  Despliegue cablea un nuevo PuertoFuenteDatos("encuesta_naval").
  CatalogoCapacidadesFaltantes.marcarDisponible("fuente_disposicion_sector_naval").
  Reanuda PASO 4 con la fuente nueva.
```

### 6.5 · Flujo de aprendizaje (C7 → C2)

```
Tras 15 proyectos cerrados (12 generan, 3 sangraron):
  C7.ReglasAprendidasValidacion.proponerAjuste.
  Correla: todos los que sangraron tenían disposicion_a_pagar entre 50-80€ al mes.
  SolicitudDecision(AJUSTE_UMBRAL_SUGERIDO).
  Dueño adopta el ajuste.
  K3.AjustadorUmbrales.aplicar → CriterioViabilidad.declara (nuevo umbral 100€/mes).
  Nuevos nichos se validan con el umbral actualizado.
```

### 6.6 · Edge cases catalogados

- **Canal caído:** G1.RegistroCanales mantiene N; si uno cae, los demás siguen;
  mensajes en cola se reintenta con política declarada (L3). Si todos caen →
  SolicitudDecision(DECLARACION_ABIERTA, "canal_sin_cablear") al reactivarse.
- **Fuente saturada:** J3.GestionLimitesFuente devuelve `puedeConsumir = false`
  → B1/C1 esperan hasta la próxima ventana; L5 informa pulso de espera.
- **Transición ilegal:** PipelinePorNicho.transitar rechaza; emite
  `nicho.<accion>.failed` con `razon_codigo = TRANSICION_ILEGAL`. L3 maneja.
- **Semilla duplicada:** CapturadorSemilla no dedupa; A2 puede tratarla como
  nueva (el dueño es responsable); si quedara duplicada vez tras vez,
  SolicitudDecision(AJUSTE_CONFIG, "dedupe_opcional").
- **Umbral `ABIERTO` al llegar C3:** VeredictoViabilidad.PUENTE automático;
  no se infiere.
- **Caducidad de SolicitudDecision:** si vence sin respuesta → se emite
  `decision.solicitud.caducada`; el pipeline permanece en
  ESPERANDO_DECISION_DUENO; L5 escalona el recordatorio por G2.

---

## 7 · Decisiones humanas abiertas `[ABIERTO]`

> Son los `[ABIERTO]` que el diseño nombra sin cerrar. El sistema no funciona
> plenamente hasta que el dueño los declare (y mientras tanto, emite las
> SolicitudDecision correspondientes — no inventa).

| Id | Pieza | Pregunta abierta | Enum TipoDecision al emitir |
|---|---|---|---|
| A1 | `H2.PerfilSup.canales_elegidos` | ¿Qué canal(es) acepta el dueño como vínculo con el sistema? | `DECLARACION_ABIERTA` |
| A2 | `H2.umbral_nitidez_semilla` | ¿Qué nitidez mínima acepta la normalización sin pedir confirmación? | `DECLARACION_ABIERTA` |
| B3 | `PerfilLimite.max_candidatos_por_semilla` | ¿Cuántos candidatos por semilla trae el buscador? | `DECLARACION_ABIERTA` |
| B3 | `PerfilLimite.presupuesto_fuentes_por_hr` | ¿Techo de gasto por hora en fuentes? | `DECLARACION_ABIERTA` |
| B3 | `PerfilLimite.fuentes_autorizadas` | ¿Qué fuentes autoriza el dueño como punto de partida? | `DECLARACION_ABIERTA` |
| C2 | `UmbralViabilidad.ingresos_semana_min/objetivo` | ¿Umbral concreto por tipo de nicho? | `DECLARACION_ABIERTA` |
| C2 | `UmbralViabilidad.disposicion_pagar_min` | ¿Mínimo exigible? | `DECLARACION_ABIERTA` |
| C2 | `UmbralViabilidad.exige_vb_previo_construir` | ¿Toda decisión de construir exige vb previo? | `CAMINO_CONSTRUIR_VB` |
| C5 | `BatchValidacion.tamaño` | ¿Cuántos nichos valida en paralelo la 1ª corrida? | `DECLARACION_ABIERTA` |
| C7 | `umbral_min_corridas` | ¿A partir de cuántos cierres propone recalibrado? | `AJUSTE_UMBRAL_SUGERIDO` |
| D1 | "Qué constituye Enki no sabe" | ¿Dónde está el umbral de duda que activa el puente? | `PUENTE_HUMANO` |
| D1 | "Quién valora el puente" | ¿El propio dueño o un admin distinto? | `DECLARACION_ABIERTA` |
| D4 | `ModeloCobro.*` | ¿Esquema/precio/cadencia por tipo de nicho? | `DECLARACION_ABIERTA` |
| E2 | "Qué define operar hasta cobrar como terminado" | ¿Primer cobro, flujo estable N semanas? | `DECLARACION_ABIERTA` |
| F3 | "KPI genera vs sangra" | ¿Umbral de ingreso por proyecto y techo de pérdida? | `ALERTA_SANGRIA` |
| F3 | "Imputación de costes por proyecto" | ¿Coste fijo por lanzamiento o solo variable? | `DECLARACION_ABIERTA` |
| H2 | `PerfilSup.cadencia_pulso` | ¿Diario, semanal, por evento de cobro? | `DECLARACION_ABIERTA` |
| H2 | `PerfilSup.decide_siempre` | ¿Qué casos exigen SU respuesta sí o sí? | `DECLARACION_ABIERTA` |
| H2 | `PerfilSup.techo_perdida_proyecto` | ¿Techo exacto por proyecto? | `ALERTA_SANGRIA` |
| I1 | `PerfilCobroEntrega.canal_cobro_default` | ¿Qué plataformas se declaran de partida? | `DECLARACION_ABIERTA` |
| I3 | "¿Se recoge feedback del pagador?" | ¿Opt-in o estándar? | `DECLARACION_ABIERTA` |
| J1 | `PuertoFuenteDatos.*` | ¿Qué fuentes autorizadas de partida? | `DECLARACION_ABIERTA` |
| J3 | `Cuota` por puerto | ¿Cuota exacta por fuente? | `DECLARACION_ABIERTA` |
| J4 | `Tarifa` por puerto | ¿Tarifa por fuente? | `DECLARACION_ABIERTA` |
| L3 | `PoliticaReintento` | ¿Cuántos reintentos, qué backoff? | `DECLARACION_ABIERTA` |

Ninguno de estos valores se asume. Al faltar, el sistema **emite** la
SolicitudDecision correspondiente — no interpola.

---

## 8 · Invariantes del sistema (lo que SIEMPRE se cumple)

1. **Trazabilidad por `id_correlacion`:** nada se emite sin él; el flujo de un
   nicho desde semilla a caja (o corte) es reconstruible por `HistorialPorNicho`.
2. **Cero juicio automático:** las únicas decisiones del sistema son cálculos
   deterministas con criterio custodio; todo juicio pasa por `SolicitudDecision`.
3. **Dato ausente = `ABIERTO`:** cualquier campo sin declarar queda explícito,
   nunca interpolado.
4. **Transición legal:** `PipelinePorNicho` rechaza cualquier transición que
   no esté en la tabla; sin estado por descuido.
5. **Append-only para memoria:** `HistorialPorNicho`, `RegistroCobros`,
   `log` de `ImputadorCosteFuente` no borran.
6. **Un escritor por custodio:** cada CUSTODIO tiene su autor tipado; los
   escritores están declarados en el campo `autor` de la clase.
7. **Puerto abierto → cablear o pedir:** si un puerto no está cableado y lo
   necesita el flujo, el sistema no simula: emite SolicitudDecision.
8. **Puente-humano es excepción:** solo emerge cuando `D1` o `L3` detectan
   bloqueo sin alternativa; nunca es el flujo normal.
9. **Cerrar siempre el círculo:** todo `.completado` tiene su par `.failed`;
   `SolicitudDecision` tiene `caducidad` y por lo tanto `caducada` como
   evento posible.
10. **El dueño es sujeto fijo:** H2 (perfil-supervisión) es el único con
    `escritor = Dueño` en varias piezas sensibles; se protege contra la
    sobreescritura por otros.
11. **Expresión en positivo:** cada rechazo expone qué construir en su
    lugar (opciones tipadas en SolicitudDecision; `razon_codigo` en el par
    `.failed` dice la acción siguiente declarada).
12. **Memoria del aprendizaje:** `C7` solo propone cuando hay evidencia
    acumulada (umbral_min_corridas); `B2` solo aprende de corridas cerradas.

---

## 9 · Mapa cruzado — pieza del árbol F2 → clase de este diseño

| F2 — hoja atómica | Forma | Clase en §2 | Hueco de prisma |
|---|---|---|---|
| A1 captura-semilla | REFLEJO | `CapturadorSemilla` | A |
| A2 normalizacion-semilla | MICRO-AGENTE | `NormalizadorSemilla` | A |
| B1 sondeo-territorio | MICRO-AGENTE | `SondeadorTerritorio` | B |
| B2 reglas-exclusion-aprendidas | MICRO-AGENTE | `ReglasExclusionAprendidas` | B |
| B3 perfil-limite-busqueda | CUSTODIO | `PerfilLimiteBusqueda` | B |
| C1 estudio-demanda | MICRO-AGENTE | `EstudioDemanda` | C |
| C2 criterio-viabilidad | CUSTODIO | `CriterioViabilidad` | C |
| C3 veredicto-viabilidad | MICRO-AGENTE | `VeredictoViabilidad` | C |
| C4 camino-encontrar-construir | MICRO-AGENTE | `CaminoEncontrarConstruir` | C |
| C5 batch-validacion | REFLEJO | `BatchValidacion` | C |
| C6 corte-temprano-sangria | REFLEJO | `CortadorTempranoSangria` | C |
| C7 reglas-aprendidas-validacion | MICRO-AGENTE | `ReglasAprendidasValidacion` | C |
| D1 ensamblador-solucion | MICRO-AGENTE | `EnsambladorSolucion` | D |
| D2 puente-humano | PUENTE | `PuenteHumano` | D |
| D3 catalogo-capacidades-faltantes | CUSTODIO | `CatalogoCapacidadesFaltantes` | D |
| D4 proponedor-modelo-cobro | MICRO-AGENTE | `ProponedorModeloCobro` | D |
| E1 estudio-competencia | MICRO-AGENTE | `EstudioCompetencia` | E |
| E2 gate-decision-operar | PUENTE | `GateDecisionOperar` | E |
| E3 motor-cobro | REFLEJO | `MotorCobro` | E |
| E4 canal-distribucion | PUENTE | `CanalDistribucion` | E |
| F1 registro-cobros | CUSTODIO | `RegistroCobros` | F |
| F2 imputacion-costes-proyecto | REFLEJO | `ImputacionCostesProyecto` | F |
| F3 cuadro-salud-financiera | CUSTODIO+REFLEJO | `CuadroSaludFinanciera` | F |
| F4 alerta-sangria | PUENTE | `AlertaSangria` | F |
| G1 puerto-canal | PUENTE | `PuertoCanal` (+ `RegistroCanales`) | G |
| G2 escalones-mensaje | REFLEJO | `EscalonesMensaje` | G |
| G3 clasificador-intencion | MICRO-AGENTE | `ClasificadorIntencion` | G |
| H1 paquete-decision-autoexplicado | MICRO-AGENTE | `PaquetadorDecisionAutoexplicado` | H |
| H2 perfil-supervision | CUSTODIO | `PerfilSupervision` | H |
| I1 perfil-cobro-entrega-por-nicho | CUSTODIO | `PerfilCobroEntregaPorNicho` | I |
| I2 propuesta-valor-canal | MICRO-AGENTE | `PropuestaValorCanal` | I |
| I3 confirmacion-valor-recibido | CUSTODIO+REFLEJO | `ConfirmacionValorRecibido` | I |
| J1 puerto-fuente-datos | PUENTE | `PuertoFuenteDatos` | J |
| J2 conversor-fuente | CONVERSOR | `ConversorFuente` | J |
| J3 gestion-limites-fuente | REFLEJO | `GestionLimitesFuente` | J |
| J4 imputacion-coste-fuente | REFLEJO | `ImputadorCosteFuente` | J |
| K1 vista-agregada-portafolio | REFLEJO+CUSTODIO | `VistaAgregadaPortafolio` | K |
| K2 cola-decisiones-gate | CUSTODIO | `ColaDecisionesGate` | K |
| K3 ajustador-umbrales | REFLEJO+CUSTODIO | `AjustadorUmbrales` | K |
| L1 pipeline-por-nicho | CUSTODIO | `PipelinePorNicho` | L |
| L2 cola-candidatos-validacion | CUSTODIO | `ColaCandidatosValidacion` | L |
| L3 manejo-fallo-reintento | REFLEJO+PUENTE | `ManejoFalloReintento` | L |
| L4 historial-por-nicho | CUSTODIO | `HistorialPorNicho` | L |
| L5 pulso-avance-etapa | REFLEJO | `PulsoAvanceEtapa` | L |
| ESLABÓN | ORQUESTADOR | `OrquestadorNicho` | — |
| ESLABÓN | VALUE OBJECT | `SolicitudDecision` + `RespuestaDecision` | — |

**Total:** 42 hojas atómicas con una clase cada una + 2 eslabones nombrados
= **44 unidades** (sin contar los value objects del lenguaje común en §1, que
son infraestructura de tipos).

---

## 10 · Patrones OOP usados — por qué, dónde

| Patrón | Dónde | Para qué |
|---|---|---|
| **Strategy** | `BatchValidacion`, `ConversorFuente`, `PuertoAbierto` | Intercambiar comportamiento por tipo sin tocar lógica cliente |
| **Observer** | Toda emisión de evento de dominio (§4) | Desacoplar productor de consumidores |
| **State Machine** | `PipelinePorNicho` | Legalidad de transiciones = IllegalStatesUnrepresentable |
| **Command** | `Transicion`, `CambioPerfil`, `CambioUmbral` | Capturar la intención con autor+instante, auditable |
| **Factory** | `SolicitudDecision.*`, `CatalogoCapacidadesFaltantes` | Nacer el value object con invariante asegurada |
| **Specification** | `tabla_leyes` del pipeline, `Veredicto.decisionCriterio` | Afirmar legalidad declarativa |
| **ValueObject** | §1 completa + payloads de eventos | Inmutabilidad; comparación por valor |
| **Null Object / Optional** | `ABIERTO`, `Opt<X>` | Dato ausente nombrable, nunca `null` suelto |
| **Repository (CUSTODIO)** | B3, C2, D3, F1, F3, H2, I1, I3, K1-K3, L1, L2, L4 | Un escritor por store; snapshot inmutable por versión |
| **Dependency Injection** | Toda clase recibe sus puertos y lectores por constructor | Desacoplamiento del despliegue |
| **Guard** | Precondiciones de método (`PRECONDICION`) | Rechaza entrada ilegal antes de ejecutar |
| **Pipeline / Chain-of-steps** | `OrquestadorNicho` | Teje las piezas sin inflar lógica de dominio |

---

## 11 · Relaciones de composición (resumen compacto)

```
OrquestadorNicho
├── CapturadorSemilla       → emite nicho.semilla.capturada
├── NormalizadorSemilla     → H2.PerfilSupervisionLector
├── SondeadorTerritorio
│   ├── Array<PuertoFuenteDatos>  (J1)
│   ├── ConversorFuente     (J2)
│   ├── GestionLimitesFuente(J3)
│   ├── ReglasExclusionAprendidas (B2)
│   └── PerfilLimiteBusqueda.lector  (B3)
├── ColaCandidatosValidacion (L2)
├── BatchValidacion
│   ├── EstudioDemanda      (C1)
│   │   ├── Array<PuertoFuenteDatos>
│   │   ├── ConversorFuente
│   │   ├── GestionLimitesFuente
│   │   └── ImputadorCosteFuente (J4)
│   └── VeredictoViabilidad (C3)
│       └── CriterioViabilidad.lector (C2)
├── CortadorTempranoSangria (C6)
├── CaminoEncontrarConstruir(C4)
├── EnsambladorSolucion     (D1)
│   └── CatalogoCapacidadesFaltantes (D3)
├── PuenteHumano            (D2)
├── ProponedorModeloCobro   (D4)
│   └── PerfilCobroEntregaPorNicho.lector (I1)
├── EstudioCompetencia      (E1)
├── GateDecisionOperar      (E2)
│   ├── PaquetadorDecisionAutoexplicado (H1)
│   └── CuadroSaludFinanciera.lector    (F3)
├── MotorCobro              (E3)
├── CanalDistribucion       (E4)
├── PipelinePorNicho        (L1)
│   └── HistorialPorNicho   (L4)
├── ColaDecisionesGate      (K2)
├── RegistroCanales         (G1)
├── EscalonesMensaje        (G2)
├── ClasificadorIntencion   (G3)
├── AlertaSangria           (F4)
├── PulsoAvanceEtapa        (L5)
├── CuadroSaludFinanciera   (F3)
│   ├── RegistroCobros.lector   (F1)
│   ├── ImputacionCostesProyecto(F2)
│   └── CriterioViabilidad.lector
├── VistaAgregadaPortafolio (K1)
├── AjustadorUmbrales       (K3)
├── ReglasAprendidasValidacion (C7)
├── ReglasExclusionAprendidas  (B2)
├── ManejoFalloReintento    (L3)
├── PerfilSupervision       (H2)
├── PropuestaValorCanal     (I2)
└── ConfirmacionValorRecibido (I3)
```

**Lectura:** el orquestador recibe por DI todas las piezas; cada custodio
expone un lector al que las piezas que leen se enganchan sin acoplarse al
escritor.

---

## 12 · Observabilidad y resiliencia (sin tecnología)

- **Pulso:** cada transición de estado del pipeline emite el evento PULSO
  correspondiente (§4.1). L5 agrega y escalona por G2.
- **Métricas vivas (computadas por reflejo):**
  `candidatos_detectados_por_semilla`, `tasa_viable`, `tasa_cobro_efectivo`,
  `coste_por_candidato`, `coste_por_proyecto`, `tiempo_medio_semilla_a_cobro`.
  No se almacenan como campo: se derivan de `HistorialPorNicho` y
  `RegistroCobros` cuando el jefe las pide (K1).
- **Fallo canónico (§4.3):** cada acción cierra su par; L3 maneja; nada muere
  mudo.
- **Caducidad:** `SolicitudDecision.caducidad` dispara el evento
  `decision.solicitud.caducada`; el pipeline permanece en espera; L5 escalona
  recordatorio.
- **Backoff/retry:** encapsulado en `L3.ManejoFalloReintento`
  (`PoliticaReintento` declarable). Sin ciclos infinitos: el máximo de
  reintentos es declarado.
- **Reconexión de puertos:** `PuertoAbierto.cablear(cfg)` es idempotente; el
  despliegue puede recablear sin tocar lógica.
- **Degradación honesta:** si falta un puerto (fuente, canal, cobro), el
  flujo correspondiente se congela en el estado legal y emite
  `SolicitudDecision(DECLARACION_ABIERTA)` — nunca simula.

---

## 13 · Recuperación de estado (crash safety)

- `AlmacenInmutable` y `LogInmutable` son append-only y versionados; al
  arrancar, cada custodio **relee el último snapshot** y continúa.
- `PipelinePorNicho` reconstruye el estado por nicho leyendo
  `HistorialPorNicho`: el estado actual es la última transición válida.
- Eventos en vuelo que no se emitieron antes del corte: al reanudar, cada
  orquestación en estado `ESPERANDO_*` queda tal cual; `AlertaSangria`,
  `PulsoAvanceEtapa` y `ReglasAprendidasValidacion` se re-barren con el
  último estado.
- `SolicitudDecision` no respondida queda en `ColaDecisionesGate` con su
  caducidad original; si venció durante el corte, al reanudar se emite
  `decision.solicitud.caducada`.

---

## 14 · Nota final — qué NO es este diseño

Este diseño **no** nombra MQTT, no habla de módulos ni de un bus, no cita
plataformas de mensajería ni procesadores de pago. No propone cómo se despliega.
No elige canal ni framework. Es pseudocódigo OOP tipado, con puertos
abiertos: la FASE 3b toma estas 44 clases y las adapta al stack real, cablea
los puertos declarados y mapea los eventos de dominio al transporte.

Es también deliberado lo que **no** incluye: ningún "optimizer" que ajuste
umbrales sin dueño, ningún "auto-approve" en los gates, ningún silencio al
dueño ni al pagador, ninguna estimación. Cada vez que al diseño le faltó un
dato, nombró el `[ABIERTO]` en lugar de inventarlo.

---

## 15 · Resumen operativo

- **Clases diseñadas:** 44 (42 hojas atómicas + `OrquestadorNicho` +
  `SolicitudDecision/RespuestaDecision` value objects compartidos).
- **Puertos abiertos:** 6 (`p1..p6` — canal, fuente de datos, cobro,
  distribución, reloj, almacén).
- **Decisiones humanas abiertas:** 25 `[ABIERTO]` nombradas (sección 7).
- **Tipos de `SolicitudDecision`:** 8 cerrados (sección 0).
- **Estados del nicho:** 19 enum cerrado (sección 1.3).
- **Flujos documentados:** 6 (semana típica + 5 edge cases principales).
- **Patrones OOP:** 12 nombrados y colocados (sección 10).
- **Expresión en positivo:** cumplida — cada "no" del F0/F2 renace como
  Mandato (CORTE sella estado positivo, PUENTE es un paquete de contexto,
  SANGRIA emite opciones, no bloquea).

Fin del documento.
