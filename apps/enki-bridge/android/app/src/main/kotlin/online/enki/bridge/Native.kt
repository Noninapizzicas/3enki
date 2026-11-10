package online.enki.bridge

/**
 * Puente con el nucleo en Rust.
 *
 * `start` arranca el canal MQTT contra Enki y devuelve 0 si se acepto.
 * `estado` devuelve "conectado|detalle|ordenes" para pintarlo en pantalla.
 */
object Native {
    init {
        System.loadLibrary("enki_bridge")
    }

    external fun start(url: String, idCliente: String): Int
    external fun estado(): String
}
