// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// BucleDeMano.kt — el SONDEO de la cola: el lado Kotlin de la mano (bloque 19a).
//
// Lo que hace: cada 150 ms le pregunta al crate si tiene una peticion
// (`PuenteNativo.siguientePeticion`), la ejecuta con `Accesibilidad.kt` (mirar) o
// con `Gestos.kt` (tocar / escribir / desplazar / esperar) y SIEMPRE contesta con
// `PuenteNativo.entregarRespuesta`.
//
// ```text
//   Rust (hilo del bucle)                  Kotlin (coroutine, Dispatchers.IO)
//   ----------------------                  ---------------------------------
//   cola.encolar(Peticion)                   siguientePeticion()  cada 150 ms
//   cola.esperar_respuesta(id, 10 s)         ejecuta (Accesibilidad / Gestos)
//                        <-----------------  entregarRespuesta(id, json)
// ```
//
// # Por que se SONDEA y no se recibe un callback
//
// Porque un callback de Rust a Kotlin obliga a AttachCurrentThread en el hilo del
// canal, a GlobalRefs que sobreviven a la Activity y a un `extern "system"` donde
// una excepcion de Kotlin mata el proceso. Un sondeo de 150 ms cuesta
// despreciable (una llamada a memoria) y convierte cualquier desastre del otro
// lado en un plazo agotado con nombre. La decision completa esta en
// `crate/src/mano/cola.rs`.
//
// # Las cuatro reglas de este fichero
//
// 1. **Una peticion a la vez.** El sondeo NO lanza dos coroutines: espera a que
//    la anterior este contestada. Dos gestos a la vez sobre la misma pantalla no
//    son dos gestos, son un gesto y medio.
// 2. **Siempre se contesta**, incluso cuando el paso falla: `{"ok":false,
//    "motivo":"..."}`. Callarse dejaria al crate esperando 10 s por cada paso y
//    el bucle del canal parado sin motivo visible.
// 3. **No decide nada.** Este fichero no elige que se toca ni si se puede: eso
//    es A3/A5 en el crate. Aqui solo se obedece el paso que llega.
// 4. **Se para si el borde no esta.** Si el simbolo nativo falta, el sondeo se
//    apaga en vez de repetir el mismo fallo seis veces por segundo.
//
// # Lo que NO hace
//
//   - NO ejecuta recetas. Recibe UN paso por peticion; encadenarlos es del crate.
//   - NO guarda estado de la pantalla. La foto la lee `Accesibilidad.mirar()` en
//     el momento; una foto guardada es la que publica en la cuenta equivocada.
//   - NO reintenta un gesto. Un toque que falla sube como fallo: repetirlo a
//     ciegas es el duplicado que A5 existe para evitar.
//
// # Hilos
//
// Todo corre en `Dispatchers.IO`: leer el arbol de accesibilidad y despachar un
// gesto son llamadas al sistema que pueden tardar, y el hilo principal de Android
// no se toca nunca desde aqui (ANR a los 5 s).

package online.enki.instagram

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicLong

/**
 * El sondeo de la cola del crate. Se arranca con el canal (`ServicioEnki`) y se
 * para con el: un sondeo sin canal gasta bateria y no puede contestar a nadie.
 */
object BucleDeMano {

    // ---- vocabulario compartido con el crate ------------------------------

    /** Cada cuanto se pregunta si hay peticion. */
    const val CADENCIA_MS = 150L

    /** Los dos tipos de peticion del contrato (`TipoDePeticion` en el crate). */
    const val TIPO_OBSERVAR = "observar"
    const val TIPO_EJECUTAR = "ejecutar"

    /** Motivos que ESTE lado puede declarar. Estables y sin tildes. */
    const val MOTIVO_SIN_SERVICIO = "servicio_no_activo"
    const val MOTIVO_PETICION_ILEGIBLE = "peticion_ilegible"
    const val MOTIVO_SIN_ID = "peticion_sin_id"
    const val MOTIVO_TIPO_DESCONOCIDO = "tipo_desconocido"
    const val MOTIVO_PASO_AUSENTE = "paso_ausente"
    const val MOTIVO_ACCION_DESCONOCIDA = "accion_fuera_del_catalogo"
    const val MOTIVO_ESPERA_INVALIDA = "espera_invalida"
    const val MOTIVO_SONDEO_ROTO = "sondeo_roto"

    /** El alcance del sondeo: un `SupervisorJob` para que un fallo no lo mate. */
    private val alcance = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** El trabajo vivo, o `null` si el sondeo esta parado. */
    @Volatile
    private var trabajo: Job? = null

    /** Cuantas peticiones se atendieron desde el arranque (diagnostico). */
    private val contador = AtomicLong(0)

    /** El ultimo motivo de fallo del sondeo, para la pantalla o el log. */
    @Volatile
    private var ultimoMotivo: String? = null

    // ---- arrancar y parar -------------------------------------------------

    /**
     * Arranca el sondeo. `false` si ya estaba vivo (no se abren dos).
     *
     * No hace falta llamarlo varias veces: `ServicioEnki` lo llama al abrir el
     * canal y `parar()` al cerrarlo.
     */
    fun arrancar(): Boolean {
        if (trabajo?.isActive == true) return false
        if (!PuenteNativo.disponible()) {
            ultimoMotivo = PuenteNativo.MOTIVO_SIN_BIBLIOTECA
            return false
        }
        ultimoMotivo = null
        trabajo = alcance.launch { bucle() }
        return true
    }

    /** Para el sondeo. Idempotente. */
    fun parar() {
        trabajo?.cancel()
        trabajo = null
    }

    /** ¿Esta el sondeo corriendo? */
    fun estaVivo(): Boolean = trabajo?.isActive == true

    /** Peticiones atendidas desde el arranque. */
    fun atendidas(): Long = contador.get()

    /** El ultimo motivo de fallo del sondeo, o `null`. */
    fun motivo(): String? = ultimoMotivo

    // ---- el bucle ---------------------------------------------------------

    /**
     * Pregunta, atiende y contesta, hasta que lo paren.
     *
     * `delay(CADENCIA_MS)` solo cuando NO habia nada: si hay trabajo encolado se
     * sigue sin esperar, para que una racha de pasos no pague 150 ms por paso.
     *
     * Es una extension de `CoroutineScope` para que `isActive` sea el del trabajo
     * de verdad: `parar()` cancela el `Job` y el bucle se va en la vuelta
     * siguiente (nunca antes: cortar a mitad de un gesto es dejar el aparato a
     * medias).
     */
    private suspend fun CoroutineScope.bucle() {
        while (isActive) {
            val crudo = PuenteNativo.siguientePeticionSeguro()

            if (crudo == null) {
                // `null` es la respuesta normal de un aparato quieto. Pero si el
                // motivo es que el borde nativo no esta, se para: repetir el
                // fallo cada 150 ms no arregla nada y ensucia el log.
                val motivo = PuenteNativo.ultimoMotivo()
                if (motivo == PuenteNativo.MOTIVO_SIN_BORDE_JNI ||
                    motivo == PuenteNativo.MOTIVO_SIN_BIBLIOTECA
                ) {
                    ultimoMotivo = motivo
                    return
                }
                delay(CADENCIA_MS)
                continue
            }

            atender(crudo)
        }
    }

    /**
     * Atiende UNA peticion y contesta siempre.
     *
     * El `finally` no existe aqui a proposito: la respuesta se entrega al final
     * del camino normal y tambien en el camino de error, y una cancelacion (el
     * servicio se esta parando) NO contesta — el crate ya no espera, porque el
     * canal se cierra.
     */
    private suspend fun atender(crudo: String) {
        val peticion = try {
            JSONObject(crudo)
        } catch (e: Exception) {
            // Sin JSON no hay id, y sin id no se puede contestar. Se cuenta y se
            // sigue: el crate lo vera como plazo agotado, que es lo maximo que
            // se puede decir de una peticion que no se entendio.
            ultimoMotivo = MOTIVO_PETICION_ILEGIBLE
            return
        }

        val id = peticion.optLong("id", -1L)
        if (id <= 0L) {
            ultimoMotivo = MOTIVO_SIN_ID
            return
        }

        val respuesta = try {
            when (peticion.optString("tipo", "")) {
                TIPO_OBSERVAR -> observar()
                TIPO_EJECUTAR -> ejecutar(peticion.optJSONObject("paso"))
                // Un tipo que este lado no conoce se nombra: ejecutarlo "casi" es
                // como se toca lo que nadie pidio.
                else -> fallo(MOTIVO_TIPO_DESCONOCIDO)
            }
        } catch (cancelacion: CancellationException) {
            // El servicio se esta parando: no se contesta y se deja morir la
            // coroutine como toca.
            throw cancelacion
        } catch (e: Exception) {
            ultimoMotivo = MOTIVO_SONDEO_ROTO + ": " + (e.message ?: e.javaClass.simpleName)
            fallo(MOTIVO_SONDEO_ROTO)
        }

        PuenteNativo.entregarRespuestaSeguro(id, respuesta)
        contador.incrementAndGet()
    }

    // ---- observar (A1, lado Android) --------------------------------------

    /**
     * Lee la pantalla AHORA y devuelve el JSON que el crate convierte en `Arbol`.
     *
     * Si no hay servicio de accesibilidad se contesta el motivo, no una foto
     * vacia: `arbol_vacio` y "no hay servicio" son cosas distintas y A1 las
     * trata distinto.
     */
    private fun observar(): String {
        val servicio = Accesibilidad.instancia() ?: return fallo(MOTIVO_SIN_SERVICIO)
        return when (val lectura = servicio.mirar()) {
            is Accesibilidad.Lectura.Observada -> servicio.json(lectura.instantanea)
            is Accesibilidad.Lectura.NoSePudo -> servicio.json(lectura)
        }
    }

    // ---- ejecutar un paso (A3, lado Android) ------------------------------

    /**
     * Entrega UN paso al aparato por el catalogo cerrado de `Gestos`.
     *
     * El paso llega ya decidido (que nodo, que punto, que texto): aqui no se
     * busca nada ni se elige nada.
     */
    private suspend fun ejecutar(paso: JSONObject?): String {
        if (paso == null) return fallo(MOTIVO_PASO_AUSENTE)

        val entrega = when (val accion = paso.optString("accion", "")) {
            "tocar" -> Gestos.tocar(paso.optString("id", ""), punto(paso))
            "escribir" ->
                Gestos.escribir(paso.optString("id", ""), punto(paso), paso.optString("texto", ""))
            "desplazar" ->
                Gestos.desplazar(
                    paso.optString("direccion", ""),
                    paso.optInt("distancia", Gestos.DISTANCIA_POR_DEFECTO)
                )
            // `esperar` duerme este hilo a proposito (ver `Gestos.esperar`: el
            // bucle es secuencial y un esperar asincrono dejaria empezar el paso
            // siguiente antes de que la pantalla se asiente). El crate alarga su
            // plazo con los ms del paso, asi que no caduca por un esperar largo.
            "esperar" -> {
                val ms = paso.optLong("ms", -1L)
                if (ms <= 0L) Entrega.Fallo(MOTIVO_ESPERA_INVALIDA) else Gestos.esperar(ms)
            }
            else -> return fallo("$MOTIVO_ACCION_DESCONOCIDA: $accion")
        }

        return when (entrega) {
            is Entrega.Entregado -> exito(entrega.via)
            is Entrega.Fallo -> fallo(entrega.motivo)
        }
    }

    /** El punto del paso. `-1` si no viene: `Gestos` lo rechaza por su cuenta. */
    private fun punto(paso: JSONObject): Pair<Int, Int> =
        Pair(paso.optInt("x", -1), paso.optInt("y", -1))

    // ---- la respuesta -----------------------------------------------------

    /** `{"ok":true,"via":"..."}`: el aparato acepto el paso. */
    private fun exito(via: String): String =
        JSONObject().put("ok", true).put("via", via).toString()

    /**
     * `{"ok":false,"motivo":"..."}`: el aparato no entrego el paso, y se dice por
     * que. Es lo que A3 convierte en `EfectoEnElMundo.Indeterminado`, asi que el
     * motivo viaja tal cual hasta el informe.
     */
    private fun fallo(motivo: String): String =
        JSONObject().put("ok", false).put("motivo", motivo).toString()
}
