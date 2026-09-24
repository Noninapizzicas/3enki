# Diseño OOP — Sistema Nichos Autónomos (Fase 3 · PLASMA)

> **Fase:** 3 · PLASMA (planificar-construccion) · **Proyecto:** nichos
> **Entrada:** el árbol de piezas de la FASE 2 (`fase2/esquemas/esquema.md` + `pasada-diseccion.md`)
> **Regla del plasma (innegociable):** diseño en pseudocódigo OOP tipado SIN Enki ni framework.
> Todo el entorno externo (canal de supervisión, fuentes de datos, plataformas de cobro/distribución)
> va por **puerto ABIERTO** cableado en el sitio de despliegue. Cero juicio automático:
> el dueño decide a través de `SolicitudDecision`. Dato ausente = `[ABIERTO]`, nunca inventado.
>
> Este documento ES el plan que la fase 3b (adaptador X→sistema real) traducirá contra el inventario
> real (plan-construccion.md). Esta fase solo PIENSA: no traduce, no construye.

---

## Objetivo del sistema

El sistema detecta un **nicho** (segmento con demanda de 1er orden y disposición a pagar) →
valida la solución → monta el modelo de negocio → opera hasta **cobrar**, generando ingresos al
dueño. Es una herramienta **autónoma por defecto** en el tramo barato (búsqueda + validación) y
**supervisada por el dueño** en el tramo caro (construcción + operación + cobro).

La **medida maestra** es la **salud financiera por proyecto**: cuántos nichos generan, cuáles
sangran y el flujo real a caja. Todo lo que no llegue a caja con control es deuda del sistema.

**Cuándo interrumpe al dueño (SolicitudDecision):**
- **Gate de operar (E2)** — antes de gastar en operación de un nicho construido, el dueño aprueba/rechaza.
- **Puente humano (D2)** — cuando construir una solución excede la capacidad del sistema y no hay alternativa.
- **Corte/alerta de sangría (F4)** — cuando un proyecto cruza un techo de pérdida, caso a decidir.
- **Ajuste de criterio/umbrales (K3)** — el dueño retunea en caliente los umbrales de validación.
- **Configuración declarable** (B3, C2, H2, I1) — límites, cadencia y contratos los fija el dueño.

En el resto, el sistema **ejecuta y transporta de forma determinista** sin juicio: mide, compara
contra el criterio declarado, corta temprano, reintenta lo mecánico y solo escala a lo humano
cuando la regla no alcanza.

---

## Entidades y clases

> UNA clase por cada pieza del árbol de F2 (con su FORMA de la disección). Se listan las **44** piezas:
> las **42** hojas atómicas de la pasada-disección + **C6** y **C7** (parte del eslabón F2-validación,
> presentes en el esquema maestro y exigidas para expandir el cuello). Ninguna pieza queda sin clase.
>
> Formas: **REFLEJO** (calculo, sin juicio) · **MICRO-AGENTE** (juicio/lenguaje/ambiguedad, hidratado
> por reflejos) · **CUSTODIO** (un unico escritor por store) · **CONVERSOR** (frontera de formatos) ·
> **PUENTE** (conecta con lo vecino por evento).

### Clases de soporte (tipos, no piezas del árbol)

```text
CLASE Nicho {
    seed: Semilla                       // el termino/idea que arranca el ciclo
    idNicho: Id
    estado: EstadoPipeline              // SEMILLA -> BUSCADO -> VALIDADO|CORTADO -> CONSTRUIDO -> OPERANDO -> COBRANDO -> EN_CAJA|SANGRA
    evidencia: List<Evidencia>          // resultados de busqueda y validacion
    camino: CaminoConstruccion          // ENCONTRAR | CONSTRUIR | PUENTE
    modeloCobro: ModeloCobro | [ABIERTO]
    perfilPago: PerfilCobroEntrega | [ABIERTO]
    REGLA: el nicho es un AGREGADO; nadie muta su estado salvo PipelinePorNicho (L1).
}

CLASE SolicitudDecision {           // vehiculo de toda decision humana
    tipo: DECISION_GATE_OPERAR | DECISION_PUENTE_HUMANO | DECISION_CORTAR_SANGRIA | DECISION_AJUSTAR_UMBRAL | DECISION_APROBAR_MODELO
    contexto: Documento              // paquete autocxplicado (nicho+evidencia+riesgo+alternativa)
    estado: PENDIENTE | RESUELTA | EXPIRADA
    resolucion: Aprobar | Rechazar | Diferir | [ABIERTO]
    REGLA: el sistema NUNCA resuelve una SolicitudDecision; solo la crea y la entrega.
}
```

### A · ARRANQUE — SEMILLA-BUSCADOR

```text
CLASE A1_CapturaSemilla {            // FORMA: REFLEJO
    ATRIBUTOS: mensajeEntrante: Texto
    MÉTODOS: aceptar(mensaje) -> ok          // valida vacios/formato
             formatear(mensaje) -> Semilla    // limpia, normaliza estructura
             buscar(seed) -> evento           // emite "semilla lista para sondeo"
    REGLA: cero juicio. Solo acepta, valida y emite. Test lo afirma. Rechaza vacios con error determinista.
}

CLASE A2_NormalizacionSemilla {      // FORMA: MICRO-AGENTE (hidratada por reflejo)
    ATRIBUTOS: semilla: Semilla, intenciones: List<Intencion>
    MÉTODOS: desambiguar(seed) -> List<Intencion>   // lenguaje/ambiguedad -> juicio
             normalizarEstructura(seed) -> Semilla    // parte mecanica -> reflejo
    REGLA: una palabra con muchos sentidos se abre en varias intenciones de busqueda; la estructura se normaliza sin juicio.
}
```

### B · BUSCADOR (F1) — demanda-primero

```text
CLASE B1_SondeoTerritorio {          // FORMA: MICRO-AGENTE (+ reflejos de barrido)
    ATRIBUTOS: fuentes: PuertoFuenteDatos, intenciones: List<Intencion>, reglasExclusion: List<Regla>
    MÉTODOS: barrerFuentes(intenciones) -> DatasetBruto      // reflejo: parseo mecanico
             juzgarTerritorio(dataset) -> List<Candidato>      // juicio: que territorio merece seguir
             proponerSiguientes(candidatos)                    // prioriza por demanda 1er orden
    REGLA: explora por demanda (nunca por oferta); el agente decide que vale seguir, el reflejo solo recoge datos.
}

CLASE B2_ReglasExclusionAprendidas { // FORMA: MICRO-AGENTE
    ATRIBUTOS: historial: HistorialPorNicho, reglas: List<ReglaExclusion>
    MÉTODOS: aprenderDeCorridas(historial) -> Reglas          // falsos positivos detectados
             aplicar(territorio) -> exluido: Bool
    REGLA: lo que fue falso positivo en una corrida previa afina las reglas para no repetirlo.
}

CLASE B3_PerfilLimiteBusqueda {      // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: limites: LimitesBusqueda      // numero de sondeos, profundidad, fuentes a tocar
              escritorAutorizado: Rol=DUEÑO
    MÉTODOS: declararLímites(duenyo, limites)      // un solo escritor
             leer() -> LimitesBusqueda
    REGLA: UN UNICO escritor (el dueño por el canal). Nadie mas escribe el store de limites.
}
```

### C · VALIDADOR (F2 — ESLABÓN LIMITANTE) — expandido

> El cuello decide QUÉ entra al tramo caro. Se expande con: criterio declarable (C2), estudio
> automatizado (C1), veredicto asistido (C3), batch en paralelo con su cola (C5+L2), corte temprano
> (C6) y bucle de aprendizaje desde resultados reales (C7→C2).

```text
CLASE C1_EstudioDemanda {            // FORMA: MICRO-AGENTE (+ reflejos)
    ATRIBUTOS: candidato: Candidato, fuentesAutorizadas: List<FuenteDeclarable>
    MÉTODOS: medirDemanda1erOrden(candidato) -> Metrica            // reflejo: lee numeros declarados
             medirDisposicionAPagar(candidato) -> Metrica           // reflejo
             redactarConclusionMercado(metricas) -> Conclusion      // juicio: redacta/interpola
    REGLA: el agente concluye el mercado de los numeros que miden los reflejos; si una fuente no existe, se autoriza/crea.
}

CLASE C2_CriterioViabilidad {        // FORMA: CUSTODIO
    ATRIBUTOS: umbralBase: Umbral { min:50, max:300, unidad: EUR/semana, base: declarable }
              umbralVigente: Umbral
              variantesPorTipoNicho: Map<Tipo, Umbral> | [ABIERTO]
              escritorAutorizado: Rol=DUEÑO (vía K3/AjustadorUmbrales)
    MÉTODOS: declararUmbral(duenyo, umbral)      // criterio declarable, no experiencia oculta
             leerVigente(nicho) -> Umbral
    REGLA: el criterio es STORE declarado y refinado por reglas-aprendidas (C7); el corte duro lo aplica el criterio, no el agente.
}

CLASE C3_VeredictoViabilidad {       // FORMA: MICRO-AGENTE
    ATRIBUTOS: estudio: ConclusionMercado, criterio: Umbral
    MÉTODOS: evaluar(estudio, criterio) -> Veredicto   // VIABLE | NO_VIABLE | PUENTE
    REGLA: el veredicto es juicio asistido sobre dato hidratado; pero el corte DURO ("no viable no pasa") es del criterio custodio (C2+C6), no del agente.
}

CLASE C4_CaminoEncontrarConstruir {  // FORMA: MICRO-AGENTE
    ATRIBUTOS: nicho, catalogoCapacidades (D3), riesgoDeclarado
    MÉTODOS: decidirCamino(nicho) -> CaminoConstruccion   // ENCONTRAR(listo en caja rapido) | CONSTRUIR | PUENTE
    REGLA: decide por oportunidad con riesgo DECLARADO; si el riesgo es alto, sube a SolicitudDecision (el dueño ve si se construye sin su visto bueno).
}

CLASE C5_BatchValidacion {           // FORMA: REFLEJO
    ATRIBUTOS: colaCandidatos: ColaCandidatosValidacion (L2), paralelismo: Int | [ABIERTO]
    MÉTODOS: programar(loteDesdeCola) -> loteEnEjecucion
             ejecutarEnParalelo(lote) -> List<Veredicto>      // N nichos a la vez
    REGLA: desacopla el cuello: no se valida en serie; se saca un lote de la cola y se corre en paralelo.
}

CLASE C6_CorteTempranoSangria {      // FORMA: REFLEJO
    ATRIBUTOS: veredicto: Veredicto
    MÉTODOS: evaluar(veredicto) -> PasaAConstruccion: Bool
             cortar(nicho) -> evento "no-viable no avanza a F3"
    REGLA: SI veredicto == NO_VIABLE ENTONCES no pasa a F3. Corte DURO, determinista, protege el cuadro-salud-financiera (F3).
}

CLASE C7_ReglasAprendidas(Validacion) {  // FORMA: MICRO-AGENTE
    ATRIBUTOS: resultadosReales: ResultadosReales (de F1/F3), umbralVigente: Umbral
    MÉTODOS: comparar(umbral, resultadosReales) -> Delta
             recalibrar(umbral, delta) -> UmbralRefinado         // ajusta C2 en caliente
    REGLA: el bucle resultados-reales -> C7 -> C2: cada proyecto que COBRA o SANGRA recalibra el umbral. La "experiencia" del F0 se vuelve criterio auto-aprendido.
}
```

> **El eslabón expandido en diseño:** `L2/cola` → `C5/batch en paralelo` → `C1/estudio automatizado`
> sobre fuentes autorizadas → `C7→C2/criterio declarable y recalibrado` → `C3/veredicto asistido` →
> `C6/corte temprano determinista` que solo deja pasar lo viable a F3. Sin este lazo, la cadena no
> llega a caja con control; con él, la medida maestra (cuántos generan vs sangan) queda gobernada por
> dato.

### D · CONSTRUCTOR (F3)

```text
CLASE D1_EnsambladorSolucion {       // FORMA: MICRO-AGENTE (+ reflejos)
    ATRIBUTOS: nicho, camino (C4), catalogoCapacidades (D3)
    MÉTODOS: decidirQueConstruir(nicho) -> Especificacion        // juicio
             ejecutarMontaje(especificacion) -> SolucionOperable   // reflejo: ejecucion mecanica
    REGLA: el agente decide QUE materializar; la ejecucion es reflejo determinista.
}

CLASE D2_PuenteHumano {              // FORMA: PUENTE
    ATRIBUTOS: bloqueo: Documento, alternativas: List<Alternativa> | [ABIERTO]
    MÉTODOS: detectarBloqueo(construir) -> ok
             emitirEvento(puente) -> SolicitudDecision  // bloqueo sin alternativa -> admin por evento
    REGLA: es EXCEPCION, no flujo normal; solo salta cuando no hay alternativa mecanica.
}

CLASE D3_CatalogoCapacidadesFaltantes {  // FORMA: CUSTODIO
    ATRIBUTOS: faltantes: Set<Capacidad>, invariante: "se crea lo que falta"
              escritorAutorizado: Rol=CONSTRUCTOR (D1) + DUEÑO
    MÉTODOS: consultar(nicho) -> CapacidadesDisponibles
             declararFaltante(capacidad) -> agrega al catalogo
    REGLA: un solo dueño escribe; INVARIANTE: si falta una capacidad, se crea (no se deja hueco muerto).
}

CLASE D4_ProponedorModeloCobro {     // FORMA: MICRO-AGENTE
    ATRIBUTOS: nicho, tipoNicho, competencia (E1)
    MÉTODOS: proponerModelo(nicho) -> ModeloCobro   // suscripcion | empresa | transaccional | [ABIERTO]
    REGLA: propone (juicio) el modelo de negocio de cobro; queda CONFIRMADO por el dueño en el gate (E2), no se impone.
}
```

### E · OPERADOR-COBRO (F4)

```text
CLASE E1_EstudioCompetencia {        // FORMA: MICRO-AGENTE (+ reflejos)
    ATRIBUTOS: nicho, fuentes, solucion
    MÉTODOS: analizarFuentes(nicho) -> DatasetCompetidores      // reflejo
             concluirDiferenciacion(dataset) -> Conclusion        // juicio
    REGLA: se corre ANTES del gate; el output (que ofrecemos distinto) entra al paquete que ve el dueño.
}

CLASE E2_GateDecisionOperar {        // FORMA: PUENTE
    ATRIBUTOS: paquete: PaqueteDecision { nicho, competencia(E1), modeloCobro(D4), proyeccion }
    MÉTODOS: armarPaquete() -> Documento
             emitirEvento(gate) -> SolicitudDecision    // no reunión sincrona; paquete-cerrado por evento
    REGLA: aprueba/rechaza el dueño. El sistema NO decide operar por su cuenta.
}

CLASE E3_MotorCobro {                // FORMA: REFLEJO
    ATRIBUTOS: plataformas: List<PuertoPlataformaCobro>, perfil (I1)
    MÉTODOS: ejecutarCobro(nicho, importe) -> Cobro             // via plataforma declarada
             registrar(cobro) -> append-only a F1
             distinguirEfectivoDePromesa(cobro) -> TipoCobro    // EFECTIVO | COMPROMETIDO | [ABIERTO]
    REGLA: calculo puro; ejecuta y registra; distingue cobro efectivo de promesa sin inventar el resultado.
}

CLASE E4_CanalDistribucion {         // FORMA: PUENTE
    ATRIBUTOS: solucion, perfilCobroEntrega (I1), pagador
    MÉTODOS: emitirEvento(entregar) -> lleva la solucion al pagador por su canal
    REGLA: conecta con lo vecino (cliente/pagador) por evento; el canal es un puerto abierto.
}
```

### F · MONITOR SALUD FINANCIERA (medida maestra)

```text
CLASE F1_RegistroCobros {            // FORMA: CUSTODIO (+reflejo)
    ATRIBUTOS: cobros: ListaAppendOnly<Cobro>, escritorAutorizado: Rol=MOTOR_COBRO (E3)
    MÉTODOS: appendUnico(duenyoEscritor, cobro)   // append-only, nunca se sobrescribe
             consultar(nicho) -> HistorialCobros
    REGLA: un solo escritor; registro inmutable (efectivo vs comprometido queda asentado).
}

CLASE F2_ImputacionCostesProyecto {  // FORMA: REFLEJO
    ATRIBUTOS: costesConstruccion, costesOperacion, costesFuentes (J4)
    MÉTODOS: agregar(nicho) -> CosteProyecto     // CUANTO cuesta cada proyecto, sumado
    REGLA: calculo puro; asigna construccion+operacion+fuentes a cada nicho.
}

CLASE F3_CuadroSaludFinanciera {     // FORMA: CUSTODIO (+reflejo de agregacion)
    ATRIBUTOS: estados: Store<IdNicho, EstadoSalud>, escritorAutorizado: Rol=SISTEMA (F)
    MÉTODOS: agregarPorProyecto(F1, F2) -> EstadoSalud      // GENERA | SANGRA | NEUTRO (reflejo)
             registrarFlujoACaja(nicho) -> Flujo
             leer() -> CuadroGlobal
    REGLA: la agregacion neta es reflejo; es lecto-escritor del store de estados -> custodio del cuadro.
}

CLASE F4_AlertaSangria {             // FORMA: PUENTE
    ATRIBUTOS: techoPerdida: Umbral (declarable), cuadro (F3)
    MÉTODOS: monitorear(cuadro) -> CruzaTecho: Bool
             emitirEvento(alerta) -> SolicitudDecision  // caso a decidir -> canal
    REGLA: al cruzar el techo de perdida, notifica al canal y sube caso a decidir; no decide matar sola.
}
```

### G · CANAL SUPERVISIÓN

```text
CLASE G1_PuertoCanal {               // FORMA: PUENTE
    ATRIBUTOS: canales: List<PuertoCanalAbierto>, actual: CanalId | [ABIERTO]
    MÉTODOS: conectar(canal) -> ok        // agnostico: Telegram es una implementacion, no el portador
             emitirEvento(enviar) -> entrega el mensaje
    REGLA: canal intercambiable por evento; nunca acoplado a un proveedor concreto.
}

CLASE G2_EscalonesMensaje {          // FORMA: REFLEJO
    ATRIBUTOS: tipo: PULSO | ALERTA | DECISION, cadencia: Cadencia | [ABIERTO]
    MÉTODOS: rotular(tipo) -> Escalon
             clasificar(tipo) -> regla declarada (no ambigua)
    REGLA: clasificacion por regla dura declarada -> reflejo; pulso/alerta/decision y su cadencia.
}

CLASE G3_ClasificadorIntencion {     // FORMA: MICRO-AGENTE
    ATRIBUTOS: mensajeEntrante: Texto
    MÉTODOS: clasificar(mensaje) -> Intencion   // SEMILLA | DECISION | CONSULTA
    REGLA: distinguir semilla vs decision vs consulta es lenguaje/ambiguedad -> micro-agente.
}
```

### H · INTERLOCUTOR DUEÑO

```text
CLASE H1_PaqueteDecisionAutocxplicado {  // FORMA: MICRO-AGENTE
    ATRIBUTOS: nicho, evidencia, riesgo, alternativa
    MÉTODOS: construir(nicho, evidencia, riesgo, alternativa) -> Paquete  // hidrata reflejos y redacta sintesis
    REGLA: redaccion + sintesis (juicio) que presenta al dueño EL paquete claro para decidir.
}

CLASE H2_PerfilSupervision {         // FORMA: CUSTODIO (un solo escritor)
    ATRIBUTOS: cadenciaPulso: Cadencia | [ABIERTO], limites: LimitesSupervision
              escritorAutorizado: Rol=DUEÑO
    MÉTODOS: declararCadencia(duenyo, cadencia)
             leer() -> PerfilSupervision
    REGLA: un solo escritor (el dueño); el canal y el monitor consumen este perfil.
}
```

### I · INTERLOCUTOR CLIENTE (pagador del nicho)

```text
CLASE I1_PerfilCobroEntregaPorNicho {  // FORMA: CUSTODIO
    ATRIBUTOS: contratoPago: Contrato, contratoEntrega: Contrato, pagador: Id
              escritorAutorizado: Rol=CONSTRUCTOR (D) + DUEÑO
    MÉTODOS: declararContrato(contrato) -> perfil por pagador
             leer(pagador) -> PerfilCobroEntrega
    REGLA: contrato de pago/entrega por pagador del nicho, declarado en el constructor; un solo dueño por store.
}

CLASE I2_PropuestaValorCanal {       // FORMA: MICRO-AGENTE
    ATRIBUTOS: nicho, territorio, solucion
    MÉTODOS: proponerMensaje(nicho) -> Copy       // como gana confianza/compra en el territorio
    REGLA: juicio de copy/posicionamiento, hidratado por los datos del canal.
}

CLASE I3_ConfirmacionValorRecibido { // FORMA: CUSTODIO (+reflejo de ingesta)
    ATRIBUTOS: feedback: Store<IdNicho, Feedback>, escritorAutorizado: Rol=INGESTA (reflejo) + SISTEMA
    MÉTODOS: ingestar(feedback) -> estructura        // reflejo: recoge post-compra
             guardar(duenyoEscritor, feedback)       // store de feedback
             consultar(nicho) -> Feedback
    REGLA: [ABIERTO] si se recoge satisfaccion del pagador o el sistema solo cobra; el store es custodio, la ingesta es reflejo.
}
```

### J · INTERLOCUTOR PROVEEDOR (fuentes de datos + plataformas)

```text
CLASE J1_PuertoFuenteDatos {         // FORMA: PUENTE
    ATRIBUTOS: fuentes: List<FuenteAutorizada>, reemplazables: Bool
    MÉTODOS: conectar(fuente) -> ok
             emitirEvento(reemplazar) -> swap por evento, sin acople a vendor
    REGLA: fuente reemplazable por evento, no acoplada a un proveedor; las autoriza el dueño.
}

CLASE J2_ConversorFuente {           // FORMA: CONVERSOR
    ATRIBUTOS: formatoOrigen: Formato, formatoInterno: EsquemaHomogeneo
    MÉTODOS: cruzar(fuenteBruta) -> DatosHomogeneos   // UNICA frontera de formatos
             mapear(formatoOrigen, formatoInterno)
    REGLA: la unica frontera donde cruzan formatos del proveedor a datos internos homogeneos.
}

CLASE J3_GestionLimitesFuente {       // FORMA: REFLEJO
    ATRIBUTOS: cola: ColaConsumo, rate: Rate | [ABIERTO]
    MÉTODOS: encolar(solicitud) -> ok
             dosificar(rate) -> no quemar el recurso
    REGLA: cola/rate declarados; no consumir sin control lo que da la fuente.
}

CLASE J4_ImputacionCosteFuente {     // FORMA: REFLEJO
    ATRIBUTOS: costePorFuente: Map<Fuente, Coste>
    MÉTODOS: calcularCoste(nicho, fuente) -> Coste
             agregarAProyecto(nicho, coste) -> alimenta F2/ImputacionCostesProyecto
    REGLA: coste por fuente -> por proyecto; calculo puro que la salud financiera consume.
}
```

### K · ROL JEFE (visión del portafolio)

```text
CLASE K1_VistaAgregadaPortafolio {   // FORMA: REFLEJO + CUSTODIO
    ATRIBUTOS: vistas: Store<Portafolio, Vista>, escritorAutorizado: Rol=JEFE+SISTEMA
    MÉTODOS: agregarSalud(F3, todos) -> VistaPortafolio   // reflejo: cruza la salud de todos
             guardarVista(duenyoEscritor, vista)            // custodia el store de vistas
             leer() -> DashboardJefe
    REGLA: la agregacion es reflejo; el store de vistas es custodio.
}

CLASE K2_ColaDecisionesGate {        // FORMA: CUSTODIO
    ATRIBUTOS: gates: Cola<GatePendiente>, escritorAutorizado: Rol=JEFE+SISTEMA (E2/D2/F4 emiten)
    MÉTODOS: encolar(solicitud) -> ok
             resolverSiguiente(duenyo, resolucion) -> desencola ordenado
             listar() -> Cola
    REGLA: UNA sola cola de gates por resolver; un escritor al leer/desencolar (el jefe).
}

CLASE K3_AjustadorUmbrales {         // FORMA: REFLEJO + CUSTODIO
    ATRIBUTOS: umbrales: Store<Umbral>, escritorAutorizado: Rol=JEFE
    MÉTODOS: retunear(duenyo, nuevoUmbral) -> aplica a C2   // custodia el store
             aplicar(cambio) -> recalcula                       // reflejo
    REGLA: el jefe retunea el criterio en caliente; el store de umbrales es custodio, la aplicacion es reflejo.
}
```

### L · ROL TRABAJADOR (opera el proceso HOY)

```text
CLASE L1_PipelinePorNicho {          // FORMA: CUSTODIO
    ATRIBUTOS: estados: Store<IdNicho, EstadoPipeline>, escritorAutorizado: Rol=SISTEMA
    MÉTODOS: avanzar(nicho, evento) -> transicion de estado   // semilla->caja
             orquestarEtapa(nicho) -> llama a A/B/C/D/E/F segun estado
             registrarEnHistorial(nicho) -> alimenta L4
    REGLA: maquina de estados UNA por proyecto; un solo dueno del estado de cada nicho.
}

CLASE L2_ColaCandidatosValidacion {  // FORMA: CUSTODIO
    ATRIBUTOS: buffer: Cola<Candidato>, escritorAutorizado: Rol=VALIDADOR (C5)
    MÉTODOS: encolar(candidato) -> ok
             tomarN(paralelismo) -> lote
             longitud() -> numeroEnCola
    REGLA: buffer del cuello de botella; el validador (via C5) es el unico que saca lote.
}

CLASE L3_ManejoFalloReintento {      // FORMA: REFLEJO + PUENTE
    ATRIBUTOS: reintentos: Contador, maxReintentos: Int | [ABIERTO]
    MÉTODOS: reintentarMecanico(fallo) -> ok            // reflejo: alternativas mecanicas
             derivarASinAlternativa(fallo) -> D2        // puente: sin alternativa -> evento
    REGLA: reintento/alternativa mecanico es reflejo; cuando no hay alternativa, escala a puente-humano por evento.
}

CLASE L4_HistorialPorNicho {         // FORMA: CUSTODIO
    ATRIBUTOS: registro: ListaAppendOnly<EstadoDecision>, escritorAutorizado: Rol=PIPELINE (L1)
    MÉTODOS: appendUnico(duenyoEscritor, estado)   // registro append-only de estados/decisiones
             consultar(nicho) -> Historial
    REGLA: un solo dueno (el pipeline) escribe; append-only, inmutable.
}

CLASE L5_PulsoAvanceEtapa {          // FORMA: REFLEJO
    ATRIBUTOS: etapaActual, etapasTotales, canal (G1)
    MÉTODOS: calcularProgreso(etapa) -> Progreso     // calculo
             emitirEscalon(progreso) -> pulso al supervisor
    REGLA: progreso por etapa -> escalones al supervisor; calculo puro que consume el canal.
}
```

---

## Puertos abiertos

> Todo el entorno externo va por puerto ABIERTO, cableado en el sitio de despliegue. Cero acople a
> marca o plataforma concreta. Se listan los puertos con su contrato abstracto.

```text
PUERTO PuertoCanalAbierto {           // G1, F4, L5 — canal de supervision
    conectar(canal) -> ok
    enviar(mensaje) -> entrega a un canal declarado (pulso/alerta/decision)
    IMPL: Telegram es UNA implementacion, no el portador.
}

PUERTO PuertoFuenteDatos {            // B1, C1, J1-J4 — fuentes de datos
    consultar(peticion) -> DatasetBruto          // buscador, APIs, scraping, comunidades
    limites() -> Rate                            // para J3 no quemar el recurso
    coste() -> Coste                             // para J4 -> salud financiera
    reemplazar(fuente) -> swap sin acople        // reemplazable por evento
}

PUERTO PuertoPlataformaCobro {        // E3, E4, I1 — cobro/distribucion
    cobrar(importe, pagador) -> Cobro            // efectivo | comprometido (declarado por nicho)
    entregar(solucion, pagador) -> ok
}

PUERTO PuertoModeloDeclarado {        // D4, I1, H2, B3, C2
    // Todo contrato, umbral, cadencia y limite se DECLARA (lo escribe el dueño o el constructor declarado),
    // nunca se estima ni se deriva de "experiencia" oculta.
}
```

---

## Flujos

### Flujo maestro `semilla → buscador → validación[embudo] → constructor → operar-cobrar → salud-financiera`

```text
FLOJO Maestro:
 1. [A1 CapturaSemilla] el canal recibe una semilla del dueño -> emite buscar(seed).
 2. [A2 NormalizacionSemilla] desambigua e intenciones -> semilla lista para sondeo.
 3. [B1 SondeoTerritorio] barre fuentes autorizadas y juzga que territorio seguir (demanda 1er orden).
 4. [B2 ReglasExclusion] descarta falsos positivos de corridas previas.
 5. [B3 PerfilLimiteBusqueda] respeta los limites declarados del dueño.
 6. -> los candidatos pasan a [L2 ColaCandidatosValidacion].

 7. [EMBUDO/VALIDACION - el cuello] de [L2], [C5 BatchValidacion] toma un lote en paralelo:
    - [C1 EstudioDemanda] mide 1er orden + disposicion a pagar sobre fuentes autorizadas.
    - [C7→C2] recalibra el umbral con resultados reales (COBRA o SANGRA previos).
    - [C3 VeredictoViabilidad] evalua contra [C2 CriterioViabilidad] -> VIABLE|NO_VIABLE|PUENTE.
    - [C4 CaminoEncontrarConstruir] decide ENCONTRAR|CONSTRUIR|PUENTE (riesgo declarado).
    - [C6 CorteTemprano] NO_VIABLE -> CORTADO, no avanza a F3 (protege F3 salubridad).
    Viables entran al tramo caro CON control; los cortados no sangran.

 8. [CONSTRUCCION/F3] [D1 EnsambladorSolucion] + [D3 CatalogoCapacidades]
    (invariante: se crea lo que falta); [D4 ProponedorModeloCobro] propone el modelo.
    Si hay bloqueo sin alternativa -> [D2 PuenteHumano] solicita decision por evento.

 9. [E1 EstudioCompetencia] se corre ANTES del gate -> alimenta el paquete.
10. [E2 GateDecisionOperar] arma paquete-cerrado y SOLICITA decision al dueño (SolicitudDecision).
    Si aprueba -> [E3 MotorCobro] ejecuta/registra cobro; [E4 CanalDistribucion] lleva la solucion al pagador.

11. [SALUD FINANCIERA/F] [F1 RegistroCobros] asienta (append-only) [F2 ImputacionCostesProyecto]
    agrega costes [F3 CuadroSaludFinanciera] declara GENERA|SANGRA|NEUTRO + flujo a caja.
    [F4 AlertaSangria] cruza techo -> SolicitudDecision.

12. [BUCLES] F3 retroalimenta [C7 ReglasAprendidas] -> reconvierte el umbral del validador;
    F3 alimenta [K1 VistaPortafolio] (jefe); [G2 EscalonesMensaje]+[G1 PuertoCanal] entregan el pulso.
```

### Bucle `resultados-reales → reglas-aprendidas → validador`

```text
FLOJO BucleAprendizajeValidacion:
 [F1/F3] reportan resultado real por nicho (COBRÓ | SANGRA | NEUTRO) con sus metricas reales.
  -> [C7 ReglasAprendidas] compara umbral contra resultado y calcula delta.
  -> [C2 CriterioViabilidad] recalibra el umbral vigente (autorizado: bucle de sistema + visto bueno jefe via K3).
  -> el siguiente lote de [C1/C3] evalua contra el umbral refinado.
 REGLA: cada proyecto que cobra o sangra RECALIBRA el criterio. La "experiencia" estática del F0
 se convierte en un embudo que se afina solo, gobernado por dato real, no por intuición.
```

---

## Decisión humana (SolicitudDecision)

> El sistema NO decide lo humano; solo arma el paquete y lo entrega. Los puntos donde el dueño
> decide de forma obligatoria:

| # | Punto | Pieza | Qué entrega el sistema | Qué decide el dueño |
|---|---|---|---|---|
| 1 | **Gate de operar** | E2 (PUENTE) | paquete-cerrado: nicho + competencia + modeloCobro + proyección | APRUEBA | RECHAZA operar un nicho ya construido |
| 2 | **Puente humano** | D2 (PUENTE) | bloqueo + alternativas agotadas | construye a mano / autoriza camino / decide dejar |
| 3 | **Corte/alerta de sangría** | F4 (PUENTE) | cruce de techo de pérdida | mata el proyecto / lo mantiene a pérdida consciente |
| 4 | **Camino construir de alto riesgo** | C4 (MICRO-AGENTE) | oportunidad + riesgo declarado | ¿acepta construir sin su visto bueno previo, o exige previo? |
| 5 | **Modelo de cobro** | D4 (MICRO-AGENTE) | propuesta de modelo por tipo de nicho | confirma o corrige el modelo |
| 6 | **Ajuste de umbral/criterio** | K3 (CUSTODIO) | umbral actual + justificación del delta | retunea el criterio en caliente |
| 7 | **Configuración declarable** | B3, C2, H2, I1 | estado actual de límites/cadencia/contratos | declara valores por el canal |

> Todas estas van por `SolicitudDecision` (estado PENDIENTE→RESUELTA). El sistema NUNCA resuelve
> una solicitud; si vence sin respuesta, queda EXPIRADA y se re-pregunta (nunca asume).

---

## Contratos / eventos

> Cada clase PIDE algo y EMITE algo. Sin transporte concreto: contrato abstracto.

```text
CONTRATO CapturaSemilla   pide: MensajeTexto        emite: SemillaNormalizada
CONTRATO SondeoTerritorio pide: Semilla+Fuentes     emite: List<Candidato>
CONTRATO Validacion       pide: Candidato+Umbral    emite: Veredicto (VIABLE|NO_VIABLE|PUENTE)
CONTRATO CorteTemprano    pide: Veredicto           emite: PasaAConstruccion (Bool)
CONTRATO Construccion     pide: Nicho+Camino        emite: SolucionOperable | SolicitudDecision(puente)
CONTRATO Operar           pide: Solucion+Modelo     emite: SolicitudDecision(gate) -> Cobro
CONTRATO Cobro            pide: Importe+Pagador     emite: Cobro(EFECTIVO|COMPROMETIDO)
CONTRATO SaludFinanciera  pide: Cobros+Costes       emite: EstadoSalud(GENERA|SANGRA|NEUTRO) + FlujoACaja
CONTRATO Supervision      pide: Pulso/Alerta/Decision  emite: Escalon al canal declarado
CONTRATO FuenteDatos      pide: Peticion            emite: DatasetBruto + Rate + Coste
EVENTO  ReemplazoFuente   -> J1, swap sin acople
EVENTO  PuenteNecesario   -> D2, bloqueo sin alternativa
EVENTO  GateAOperar       -> E2, paquete-cerrado al dueño
EVENTO  AlertaSangria     -> F4, caso a decidir
EVENTO  CobroRegistrado   -> F1, append-only
```

---

## Invariantes / determinismo

- **Cero juicio automático:** el sistema ejecuta/transporta determinista; el dueño decide. Las
  decisiones van por `SolicitudDecision`, nunca por lógica automática.
- **Dato ausente = desconocido / `[ABIERTO]`:** nada se inventa. Un umbral, contrato o cadencia sin
  declarar se reporta como `[ABIERTO]` y el flujo lo trata como no-decidible hasta que el dueño declare.
- **Un único escritor por store (CUSTODIO):** C2, B3, H2, I1, F1, F3, K1, K2, K3, L1, L2, L4, D3.
  Nadie más escribe; si otro intenta, se rechaza (no se sobreescribe).
- **Append-only inmutable:** F1 (cobros) y L4 (historial) no se borran ni se modifican; solo crecen.
- **Corte DURO determinista (C6):** `SI veredicto == NO_VIABLE ENTONCES no avanza a F3`. No depende de
  juicio en el corte; el juicio vive solo en formar el veredicto, no en aplicarlo.
- **Frontera única de formatos:** J2/ConversorFuente es el único cruce entre formatos externos y datos
  internos homogéneos.
- **Reglas-exclusión (B2) y reglas-aprendidas (C7):** lo aprendido SIEMPRE proviene de resultados reales
  (historial / cobros-sangría), nunca inferido sin dato.
- **Reintento mecánico antes de puente (L3):** se reintenta la alternativa declarada antes de escalar a
  humano; escalar es excepción, no costumbre.
- **Inmutabilidad de la medida maestra (F3):** GENERA | SANGRA | NEUTRO y flujo a caja se calculan de
  F1+F2 (hechos), no de promesas.

---

## Preguntas abiertas [ABIERTO]

1. **Criterio de validación (C2):** ¿cuál es el mínimo exigible de demanda de 1er orden y la disposición
   a pagar concreta? ¿El umbral 50–300 €/semana es único o varía por tipo de nicho? `[ABIERTO]`
2. **Fuentes de validación (J1/C1):** ¿qué fuentes exactas autorizan "demanda de 1er orden"
   (buscador, APIs, scraping, comunidades)? `[ABIERTO]`
3. **Salud financiera (F3/F4):** ¿qué KPI define "genera" vs "sangra" y con qué techo de pérdida se
   mata/corta un proyecto? ¿Cómo se imputa el coste por proyecto (construcción+operación+fuentes)? `[ABIERTO]`
4. **Supervisión (H2/G2):** ¿qué cadencia de pulso acepta (diario/semanal)? ¿Qué casos exigen SÍ o SÍ
   su respuesta (gate, corte de sangría, puente-humano)? ¿"otro canal elegido" = cuáles? `[ABIERTO]`
5. **Cobro/operación (E3/I1):** ¿qué plataformas de cobro y distribución se declaran de partida?
   ¿Qué define "operar hasta cobrar" como terminado (primer cobro, flujo N semanas)? `[ABIERTO]`
6. **Autonomía vs control (C4):** ¿acepta que el sistema decida solo el camino CONSTRUIR (riesgo alto),
   o toda decisión de construir exige su visto bueno previo? `[ABIERTO]`
7. **Puente humano (D2):** ¿qué constituye "el sistema no sabe" (umbral de duda)? ¿El admin que valora
   el puente es el propio dueño? `[ABIERTO]`
8. **Batch (C5/L2):** ¿cuántos nichos en paralelo valida la primera corrida? `[ABIERTO]`
9. **Cliente post-compra (I3):** ¿se recoge satisfacción/valor recibido del pagador o el sistema solo
   cobra? `[ABIERTO]`
10. **Aprendizaje (C7):** ¿con qué autoridad recalibra el bucle el umbral: puramente automático desde
    resultados, o con visto bueno del jefe (K3) en cada ajuste? `[ABIERTO]`

> Ninguno de estos huecos se cierra aquí. Son el guion de la conversación siguiente; hasta que se
> respondan, los valores quedan `[ABIERTO]` y el sistema los trata como no-decidibles, nunca asumidos.

---

## Resumen de la fase

- **Clases:** 44 (las 42 hojas de la disección de F2 + **C6**·CorteTemprano + **C7**·ReglasAprendidas
  — ambas parte del eslabón F2-validación exigidas para expandir el cuello). Ninguna pieza sin clase.
- **Puertos abiertos:** 4 (CanalSupervisión, FuenteDatos, PlataformaCobro/Distribución, ModeloDeclarado).
- **Decisiones humanas en `SolicitudDecision`:** gate-de-operar (E2), puente-humano (D2), corte/alerta
  de sangría (F4), camino-construir de alto riesgo (C4), confirmación de modelo de cobro (D4), ajuste de
  umbral (K3) y configuración declarable (B3/C2/H2/I1).
- **Eslabón limitante (C) expandido:** criterio declarable (C2), batch en paralelo + cola (C5+L2), corte
  temprano (C6), bucle resultados-reales→C7→C2 de auto-aprendizaje del umbral.
