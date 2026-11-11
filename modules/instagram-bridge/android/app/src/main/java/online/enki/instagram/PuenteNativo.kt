// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// PuenteNativo.kt — el borde JNI. La UNICA puerta entre Kotlin y el crate.
//
// Lo que hace: declara las tres funciones nativas que el crate exporta y las
// envuelve en versiones "seguras" que no pueden tumbar la app. Nada mas: este
// fichero no decide, no mira y no toca. Todo eso vive en Accesibilidad.kt,
// Gestos.kt y en el crate.
//
// # Los tres simbolos
//
// ```text
// Java_online_enki_instagram_PuenteNativo_iniciar
// Java_online_enki_instagram_PuenteNativo_detener
// Java_online_enki_instagram_PuenteNativo_estado
// ```
//
// El nombre no se elige aqui: lo dicta la JVM a partir del paquete y la clase
// (`online.enki.instagram.PuenteNativo`) y del nombre del metodo. Un `object` de
// Kotlin genera una clase con el MISMO nombre y metodos de instancia, asi que el
// simbolo no lleva `$Companion` ni mangling: `iniciar`, `detener`, `estado` no
// tienen guiones bajos ni sobrecargas, que es lo que obligaria a manglear.
//
// **EL CRATE TODAVIA NO EXPORTA ESTOS TRES SIMBOLOS.** El borde Rust es el bloque
// siguiente (5b). Por eso cada llamada va dentro de un `try/catch`: hoy el
// `System.loadLibrary` puede funcionar (el .so existe) y la llamada lanzar
// `UnsatisfiedLinkError` por el simbolo que falta. La app no se cae y el estado
// dice `sin_borde_jni` con su motivo, en vez de fingir un canal conectado. Un
// puente que se cae al arrancar no se puede ni diagnosticar desde el movil.
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

    // ---- los tres simbolos del crate ---------------------------------------
    //
    // Las firmas NO se pueden cambiar sin cambiar el Rust: `(String, String) ->
    // Boolean` es `(JString, JString) -> jboolean` en el otro lado.

    /** Abre el canal con el bus. `true` solo si el CONNECT fue aceptado. */
    external fun iniciar(url: String, llave: String): Boolean

    /** Cierra el canal. Idempotente en el crate. */
    external fun detener()

    /** El estado del canal como JSON: `{"canal": "...", "motivo": ...}`. */
    external fun estado(): String

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

    // ---- lectura del JSON del crate ---------------------------------------

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
