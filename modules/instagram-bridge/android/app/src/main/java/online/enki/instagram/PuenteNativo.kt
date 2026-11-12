// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// PuenteNativo.kt — el borde JNI. La UNICA puerta entre Kotlin y el crate.
//
// Lo que hace: declara las funciones nativas que el crate exporta y las envuelve
// en versiones "seguras" que no pueden tumbar la app. Nada mas: este fichero no
// decide, no mira y no toca. Todo eso vive en Accesibilidad.kt, Gestos.kt,
// BucleDeMano.kt y en el crate.
//
// # Los siete simbolos
//
// ```text
// Java_online_enki_instagram_PuenteNativo_iniciar
// Java_online_enki_instagram_PuenteNativo_detener
// Java_online_enki_instagram_PuenteNativo_estado
// Java_online_enki_instagram_PuenteNativo_siguientePeticion
// Java_online_enki_instagram_PuenteNativo_entregarRespuesta
// Java_online_enki_instagram_PuenteNativo_arbolVisible
// Java_online_enki_instagram_PuenteNativo_publicarObservacion
// ```
//
// Los tres primeros son el CANAL (bloque 18): abrir, cerrar y contar el estado.
// Los tres siguientes son la MANO (bloque 19a): el crate deja peticiones en una
// cola y BucleDeMano.kt la sondea cada 150 ms. El ultimo es el VOLCADO (19b): se
// mira la pantalla, se serializa y el crate la manda al bus.
// **No hay callbacks JNI**: una llamada
// de Rust a Kotlin necesita AttachCurrentThread, GlobalRefs y un hilo de la JVM
// por cada llamada, y un callback cruzado con una espera es un interbloqueo. La
// cola convierte "se murio el otro lado" en un plazo agotado con nombre
// (`mano_sin_respuesta`), que es un fallo que se puede leer.
//
// El nombre no se elige aqui: lo dicta la JVM a partir del paquete y la clase
// (`online.enki.instagram.PuenteNativo`) y del nombre del metodo. Un `object` de
// Kotlin genera una clase con el MISMO nombre y metodos de instancia, asi que el
// simbolo no lleva `$Companion` ni mangling: ninguno de los seis tiene guiones
// bajos ni sobrecargas, que es lo que obligaria a manglear.
//
// # Lo que NO hace
//
//   - NO guarda la llave. La recibe, la pasa al crate y el unico rastro que queda
//     es el de la memoria del proceso. Un `SharedPreferences` con la llave dentro
//     es un secreto en el estado (V1) y ademas sobrevive al borrado de la app en
//     las copias de seguridad.
//   - NO reintenta ni reconecta. La reconexion es del crate (canal/mqtt.rs); un
//     reintento escondido aqui abriria dos canales con la misma llave.
//   - NO interpreta el estado. `estado()` devuelve el JSON del crate tal cual; si
//     viene roto, se devuelve un JSON nuestro que lo declara.
//
// # Por que "Seguro" y no solo `external fun`
//
// Una funcion `external` que no tiene simbolo lanza `UnsatisfiedLinkError` en la
// PRIMERA llamada, y ese error no es una `Exception`: es un `Error`. Un `catch
// (e: Exception)` no lo atrapa y el proceso muere sin log util. Los envoltorios
// capturan `Throwable` a proposito en este unico sitio del proyecto.

package online.enki.instagram

import org.json.JSONObject

/**
 * El puente nativo. Se usa como objeto: no tiene estado propio mas alla de la
 * ultima llave de error, que existe para que la notificacion pueda contar por que
 * no hay canal.
 */
object PuenteNativo {

    /** El nombre del .so, sin `lib` y sin `.so`: lo que espera `loadLibrary`. */
    const val BIBLIOTECA = "enki_instagram_bridge"

    /** Motivos estables (sin tildes) que ESTE lado puede declarar. */
    const val MOTIVO_SIN_BIBLIOTECA = "sin_biblioteca"
    const val MOTIVO_SIN_BORDE_JNI = "sin_borde_jni"
    const val MOTIVO_SIN_ESTADO = "sin_estado"
    const val MOTIVO_INICIAR_ROTO = "iniciar_roto"

    /** La cola de la mano no se pudo ni leer ni contestar (borde roto de verdad). */
    const val MOTIVO_COLA_ROTA = "cola_rota"

    /** El volcado no se pudo entregar al crate (borde roto, no canal caido). */
    const val MOTIVO_OBSERVACION_ROTA = "observacion_rota"

    /**
     * Si el .so se pudo cargar. Se intenta UNA vez, al tocar el objeto por primera
     * vez: `loadLibrary` no es idempotente ni barato, y reintentarlo en cada
     * llamada solo repetiria el mismo fallo.
     */
    private val cargada: Boolean = try {
        System.loadLibrary(BIBLIOTECA)
        true
    } catch (e: UnsatisfiedLinkError) {
        false
    }

    /** El ultimo motivo de fallo, para la notificacion y la pantalla. */
    @Volatile
    private var ultimo: String? = null

    /** ¿Esta el .so dentro del APK y con la ABI correcta? */
    fun disponible(): Boolean = cargada

    /** El motivo del ultimo fallo, o `null` si no hubo. */
    fun ultimoMotivo(): String? = ultimo

    // ---- los simbolos del crate ---------------------------------------------
    //
    // Las firmas NO se pueden cambiar sin cambiar el Rust: `(String, String) ->
    // Boolean` es `(JString, JString) -> jboolean` en el otro lado, y `(Long,
    // String) -> Boolean` es `(jlong, JString) -> jboolean`. `tests/jni_paridad.rs`
    // lee este fichero y el borde Rust y falla si un nombre o un tipo se separa.

    /** Abre el canal con el bus. `true` solo si el CONNECT fue aceptado. */
    external fun iniciar(url: String, llave: String): Boolean

    /** Cierra el canal. Idempotente en el crate. */
    external fun detener()

    /** El estado del canal como JSON: `{"canal": "...", "motivo": ...}`. */
    external fun estado(): String

    // ---- los simbolos de la mano (bloque 19a) -------------------------------
    //
    // La mano NO se llama por callback: el crate deja peticiones en una cola y
    // este lado la sondea cada 150 ms. Tres funciones y ninguna bloquea el hilo
    // de la UI (el crate solo toca memoria: nada de red ni de disco).

    /**
     * La peticion mas antigua que el crate espera, como JSON:
     * `{"id":7,"tipo":"observar"}` o `{"id":8,"tipo":"ejecutar","paso":{...}}`.
     * `null` si no hay nada (lo normal en un aparato quieto).
     */
    external fun siguientePeticion(): String?

    /**
     * La respuesta a una peticion, como JSON. `id` es el que traia la peticion.
     *
     * `false` = llego tarde o ese id no es de nadie (el crate la cuenta como
     * huerfana y no se rompe nada).
     */
    external fun entregarRespuesta(id: Long, json: String): Boolean

    /** El JSON de la ultima observacion entregada, o `null`. Diagnostico. */
    external fun arbolVisible(): String?

    // ---- el simbolo del volcado de pantalla (bloque 19b) --------------------
    //
    // Un puente TONTO: recibe el JSON de `Volcado.kt` y el crate lo publica en
    // `core/core-a/events/bridge/observacion` dentro del sobre del bus. El crate
    // NO lo parsea (un volcado transformado no es lo que el aparato vio), asi que
    // aqui tampoco se toca: se pasa la cadena tal cual.

    /**
     * El volcado de pantalla, camino del bus.
     *
     * `true` = el crate lo dejo encolado para el hilo del canal (QoS 0: nadie
     * puede afirmar que el broker lo tenga). `false` = no se encolo; el motivo
     * se lee en `estadoSeguro()`, clave `volcado.motivo`.
     */
    external fun publicarObservacion(json: String): Boolean

    // ---- los envoltorios que no pueden tumbar la app ------------------------

    /**
     * `iniciar` sin poder matar el proceso.
     *
     * Devuelve `false` cuando no hay biblioteca, cuando falta el simbolo o cuando
     * el crate contesta que no. En los tres casos deja el motivo en `ultimo`.
     */
    fun iniciarSeguro(url: String, llave: String): Boolean {
        if (!cargada) {
            ultimo = MOTIVO_SIN_BIBLIOTECA
            return false
        }
        return try {
            val abierto = iniciar(url, llave)
            if (!abierto) {
                ultimo = leerMotivo(estadoSeguro()) ?: "el crate no abrio el canal"
            } else {
                ultimo = null
            }
            abierto
        } catch (e: UnsatisfiedLinkError) {
            // El .so carga pero no exporta `iniciar`: borde Rust pendiente.
            ultimo = MOTIVO_SIN_BORDE_JNI
            false
        } catch (e: Throwable) {
            // Un panic de Rust convertido en excepcion, o un error de inicializacion.
            ultimo = MOTIVO_INICIAR_ROTO + ": " + (e.message ?: e.javaClass.simpleName)
            false
        }
    }

    /** `detener` sin poder matar el proceso. Si no hay nada que cerrar, no hace nada. */
    fun detenerSeguro() {
        if (!cargada) return
        try {
            detener()
        } catch (e: Throwable) {
            // No hay nada que hacer: el canal ya no esta, o nunca estuvo. Se traga
            // el error a proposito (un `catch` que relanza aqui tumbaria el
            // servicio en `onDestroy`).
            ultimo = "detener_roto: " + (e.message ?: e.javaClass.simpleName)
        }
    }

    /**
     * `estado` sin poder matar el proceso. SIEMPRE devuelve un JSON con la clave
     * `canal`: quien lo lee (ServicioEnki, MainActivity) no tiene que distinguir
     * entre "no hay crate" y "el crate contesto".
     */
    fun estadoSeguro(): String {
        if (!cargada) {
            return json(MOTIVO_SIN_BIBLIOTECA, "la lib $BIBLIOTECA.so no esta en el APK (jniLibs vacio o ABI no empaquetada)")
        }
        return try {
            val bruto = estado()
            if (bruto.isBlank()) json(MOTIVO_SIN_ESTADO, "el crate contesto vacio") else bruto
        } catch (e: UnsatisfiedLinkError) {
            json(MOTIVO_SIN_BORDE_JNI, "el crate no exporta Java_online_enki_instagram_PuenteNativo_estado")
        } catch (e: Throwable) {
            json("estado_roto", e.message ?: e.javaClass.simpleName)
        }
    }

    // ---- la mano (bloque 19a): los envoltorios de la cola -------------------

    /**
     * La siguiente peticion que el crate pide a la mano, o `null` si no hay.
     *
     * NUNCA lanza: si falta el simbolo, no hay biblioteca o el crate entro en
     * panic, devuelve `null` y deja el motivo en `ultimo`. `null` es tambien la
     * respuesta normal de un aparato quieto, asi que el sondeo puede tratar los
     * dos casos igual... salvo por `ultimoMotivo()`, que es lo que distingue "no
     * hay nada" de "no hay borde" (y lo usa `BucleDeMano` para pararse en vez de
     * repetir el fallo seis veces por segundo).
     */
    fun siguientePeticionSeguro(): String? {
        if (!cargada) {
            ultimo = MOTIVO_SIN_BIBLIOTECA
            return null
        }
        return try {
            siguientePeticion()
        } catch (e: UnsatisfiedLinkError) {
            ultimo = MOTIVO_SIN_BORDE_JNI
            null
        } catch (e: Throwable) {
            ultimo = MOTIVO_COLA_ROTA + ": " + (e.message ?: e.javaClass.simpleName)
            null
        }
    }

    /**
     * Devuelve al crate la respuesta de una peticion.
     *
     * `false` significa "llego tarde o ese id no es de nadie": el crate la cuenta
     * como huerfana y sigue. No es un error que haya que reintentar (reintentar
     * una respuesta seria contestar dos veces al mismo recado).
     */
    fun entregarRespuestaSeguro(id: Long, json: String): Boolean {
        if (!cargada) return false
        return try {
            entregarRespuesta(id, json)
        } catch (e: UnsatisfiedLinkError) {
            ultimo = MOTIVO_SIN_BORDE_JNI
            false
        } catch (e: Throwable) {
            ultimo = MOTIVO_COLA_ROTA + ": " + (e.message ?: e.javaClass.simpleName)
            false
        }
    }

    /**
     * El JSON de la ultima observacion que el crate recibio, o `null` si aun no
     * hubo ninguna. Diagnostico: lo que se enseña en la pantalla del puente.
     */
    fun arbolVisibleSeguro(): String? {
        if (!cargada) return null
        return try {
            arbolVisible()
        } catch (e: UnsatisfiedLinkError) {
            ultimo = MOTIVO_SIN_BORDE_JNI
            null
        } catch (e: Throwable) {
            ultimo = MOTIVO_COLA_ROTA + ": " + (e.message ?: e.javaClass.simpleName)
            null
        }
    }

    // ---- el volcado (bloque 19b): el envoltorio del puente tonto ------------

    /**
     * Publica un volcado de pantalla sin poder matar el proceso.
     *
     * `false` NO se queda mudo: el crate deja el motivo en `estado().volcado`
     * (`sin_canal` con el estado del canal dentro, `json_vacio`,
     * `json_no_objeto`, `buzon_lleno`) y se lee aqui para que la pantalla lo
     * pueda enseñar. Un "no se pudo" sin motivo no se puede arreglar desde el
     * movil.
     *
     * El JSON no se toca: `Volcado.json()` lo construye y esto solo lo pasa.
     */
    fun publicarObservacionSeguro(json: String): Boolean {
        if (!cargada) {
            ultimo = MOTIVO_SIN_BIBLIOTECA
            return false
        }
        return try {
            val encolado = publicarObservacion(json)
            ultimo = if (encolado) {
                null
            } else {
                leerMotivoDeVolcado(estadoSeguro())
                    ?: "el crate no encolo el volcado y no dijo por que"
            }
            encolado
        } catch (e: UnsatisfiedLinkError) {
            ultimo = MOTIVO_SIN_BORDE_JNI
            false
        } catch (e: Throwable) {
            ultimo = MOTIVO_OBSERVACION_ROTA + ": " + (e.message ?: e.javaClass.simpleName)
            false
        }
    }

    // ---- lectura del JSON del crate ---------------------------------------

    /**
     * El motivo del ultimo volcado dentro del estado del crate
     * (`volcado.motivo`), o `null` si no lo trae. Se lee de `estado()` y no de la
     * respuesta de `publicarObservacion` porque esa solo puede ser un booleano.
     */
    private fun leerMotivoDeVolcado(bruto: String): String? = try {
        val volcado = JSONObject(bruto).optJSONObject("volcado")
        if (volcado == null || volcado.isNull("motivo")) {
            null
        } else {
            volcado.optString("motivo").ifBlank { null }
        }
    } catch (e: Exception) {
        null
    }

    /** El `motivo` de un estado, o `null` si no lo trae o no es JSON. */
    private fun leerMotivo(bruto: String): String? = try {
        val obj = JSONObject(bruto)
        if (obj.isNull("motivo")) null else obj.optString("motivo").ifBlank { null }
    } catch (e: Exception) {
        null
    }

    /** Un estado minimo con la forma que espera quien lee. */
    private fun json(canal: String, motivo: String?): String = try {
        JSONObject()
            .put("canal", canal)
            .put("motivo", motivo ?: JSONObject.NULL)
            .toString()
    } catch (e: Exception) {
        "{\"canal\":\"sin_estado\",\"motivo\":null}"
    }
}
