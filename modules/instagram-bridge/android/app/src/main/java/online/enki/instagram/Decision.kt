// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// Decision.kt — la ultima palabra del aparato antes de tocar nada.
//
// Junta los tres dictamenes que ya produjo el crate (D1 pulso, D3 salud, D5 aviso)
// y contesta UNA accion. No vuelve a leer nada y no decide por su cuenta: es la
// tabla que convierte estados en comportamiento, escrita en un solo sitio para
// que el borde JNI no tenga un `if` distinto cada vez.
//
// # La regla que se respeta aqui, otra vez
//
// ```text
// no_se  -> mirar antes de operar   (NUNCA pedir persona, NUNCA operar)
// muerta -> pedir persona
// fuera  -> parar por el aparato
// ```
//
// Y una cuarta: **un estado que no se reconoce no autoriza nada**. Si el crate
// manda un valor que esta tabla no conoce (una version nueva, un payload roto),
// la accion es `MIRAR_ANTES_DE_OPERAR`, nunca `OPERAR`. Un `else -> OPERAR` es la
// forma mas rapida de publicar sin permiso.
//
// API de Android usada: ninguna. Este fichero es Kotlin puro (JSONObject aparte)
// justamente para que se pueda revisar sin SDK y para que su tabla se pueda
// comparar linea a linea con `crate/src/percepcion/*`.

package online.enki.instagram

import org.json.JSONObject

/**
 * Lo que el puente puede hacer con el aparato. Los codigos son los MISMOS que
 * `DecisionDeSesion` / `Salud` del crate, mas dos acciones del aparato que el
 * crate no necesita nombrar (`parar_por_aparato`, `operar_degradado`).
 */
object Acciones {
    const val OPERAR = "operar"
    const val MIRAR_ANTES_DE_OPERAR = "mirar_antes_de_operar"
    const val PEDIR_PERSONA = "pedir_persona"
    const val PARAR_POR_APARATO = "parar_por_aparato"
    const val OPERAR_DEGRADADO = "operar_degradado"

    val TODAS = listOf(
        OPERAR,
        MIRAR_ANTES_DE_OPERAR,
        PEDIR_PERSONA,
        PARAR_POR_APARATO,
        OPERAR_DEGRADADO
    )
}

/**
 * La decision, con su porque y lo que hace falta. Nunca viaja sola: una accion sin
 * motivo no se puede auditar y una negativa sin instruccion no se puede resolver.
 */
data class DecisionDelPuente(
    val accion: String,
    val porQue: String,
    val queHaceFalta: String?
) {
    /** Solo `operar` autoriza a tocar. `operar_degradado` NO autoriza a escribir. */
    val puedeOperar: Boolean get() = accion == Acciones.OPERAR

    fun json(): JSONObject = JSONObject().apply {
        put("accion", accion)
        put("por_que", porQue)
        put("que_hace_falta", queHaceFalta ?: JSONObject.NULL)
        put("puede_operar", puedeOperar)
    }
}

/**
 * La tabla. Estados del crate entran; una accion sale.
 *
 * El orden importa y es el del dano: primero lo que exige persona (un aviso que no
 * se entiende no se opera "con cuidado"), despues el aparato, despues la sesion,
 * despues la plataforma. Mover el pulso por delante del aviso haria que un captcha
 * se leyese como "sesion viva, adelante".
 */
object Decision {

    /**
     * @param pulso `viva` | `muerta` | `no_se` (de D1)
     * @param salud `sano` | `degradado` | `fuera` (de D3)
     * @param motivoDeFuera `esencial_ausente` | `esencial_no_se` | null
     * @param avisoExigePersona D5: un aviso reconocido que pide persona o uno no previsto
     * @param plataformaContesta si la plataforma respondio en la ultima lectura
     */
    fun decidir(
        pulso: String?,
        salud: String?,
        motivoDeFuera: String?,
        avisoExigePersona: Boolean,
        plataformaContesta: Boolean
    ): DecisionDelPuente {
        // 1 · Un aviso que no se entiende (o que pide persona) manda.
        if (avisoExigePersona) {
            return DecisionDelPuente(
                accion = Acciones.PEDIR_PERSONA,
                porQue = "la plataforma puso un aviso que exige una persona (o no esta en la tabla)",
                queHaceFalta = "una persona delante del aparato lea el aviso y lo resuelva"
            )
        }

        // 2 · El aparato.
        when (salud) {
            "fuera" -> {
                // Un esencial que no se pudo leer NO es una averia: se vuelve a mirar.
                return if (motivoDeFuera == "esencial_no_se") {
                    DecisionDelPuente(
                        accion = Acciones.MIRAR_ANTES_DE_OPERAR,
                        porQue = "un indicador esencial del aparato no contesto",
                        queHaceFalta = "volver a leer el indicador antes de operar (no es una averia)"
                    )
                } else {
                    DecisionDelPuente(
                        accion = Acciones.PARAR_POR_APARATO,
                        porQue = "falta un indicador esencial del aparato",
                        queHaceFalta = "reparar el aparato (servicio, pantalla, bloqueo, version, sitio)"
                    )
                }
            }

            "sano", "degradado" -> Unit
            // Un estado de salud que no se reconoce no autoriza nada.
            else -> return DecisionDelPuente(
                accion = Acciones.MIRAR_ANTES_DE_OPERAR,
                porQue = "el estado de salud del aparato no se reconoce",
                queHaceFalta = "volver a leer el aparato"
            )
        }

        // 3 · La sesion. Aqui vive la regla de D1: no_se NO es muerto.
        when (pulso) {
            "viva" -> Unit
            "muerta" -> return DecisionDelPuente(
                accion = Acciones.PEDIR_PERSONA,
                porQue = "hay evidencia de que la sesion se cerro",
                queHaceFalta = "una persona abra sesion con la cuenta del padron (D2)"
            )
            "no_se" -> return DecisionDelPuente(
                accion = Acciones.MIRAR_ANTES_DE_OPERAR,
                porQue = "no se sabe si la sesion esta viva",
                queHaceFalta = "mirar la pantalla otra vez antes de operar (no se pide contrasena)"
            )
            else -> return DecisionDelPuente(
                accion = Acciones.MIRAR_ANTES_DE_OPERAR,
                porQue = "el pulso de la sesion no se reconoce",
                queHaceFalta = "mirar la pantalla otra vez antes de operar"
            )
        }

        // 4 · La plataforma. Sin ella solo sobrevive lo ya traido (H3).
        if (!plataformaContesta) {
            return DecisionDelPuente(
                accion = Acciones.OPERAR_DEGRADADO,
                porQue = "la plataforma no contesta: solo se puede leer lo ya traido",
                queHaceFalta = "esperar a que vuelva la plataforma para publicar o escribir"
            )
        }

        // 5 · Todo en orden.
        return DecisionDelPuente(
            accion = Acciones.OPERAR,
            porQue = "sesion viva, aparato en condiciones y plataforma contestando",
            queHaceFalta = null
        )
    }

    /** Atajo: la decision a partir de la fotografia que arma PrimerPlano. */
    fun desdeEstadoDelAparato(
        estado: EstadoDelAparato,
        pulso: String?,
        motivoDeFuera: String?,
        avisoExigePersona: Boolean
    ): DecisionDelPuente {
        val salud = cuando(estado)
        return decidir(
            pulso = pulso,
            salud = salud,
            motivoDeFuera = motivoDeFuera,
            avisoExigePersona = avisoExigePersona,
            plataformaContesta = estado.redValidada == true
        )
    }

    /**
     * El dictamen de D3 en una palabra, a partir de los indicadores. Espejo de la
     * regla del crate: un esencial ausente es `fuera`; un deseable caido es
     * `degradado`; todo en `si` es `sano`.
     */
    fun cuando(estado: EstadoDelAparato): String {
        val indicadores = estado.salud()
        val esenciales = listOf(
            "servicio_de_accesibilidad",
            "pantalla_encendida",
            "desbloqueado",
            "version_de_app",
            "almacenamiento_libre"
        )
        if (esenciales.any { indicadores[it] == "no" }) return "fuera"
        if (esenciales.any { indicadores[it] == "no_se" }) return "fuera"
        if (indicadores.values.any { it != "si" }) return "degradado"
        return "sano"
    }
}
