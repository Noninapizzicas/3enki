// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// MainActivity.kt — la pantalla minima del puente.
//
// Lo que hace: enseñar el estado del canal y del servicio de accesibilidad, dejar
// teclear la URL y la llave del bus, arrancar/parar el servicio en primer plano,
// abrir los ajustes de accesibilidad y OBSERVAR LA PANTALLA (bloque 19b): leer el
// arbol real, serializarlo y mandarlo al bus, o copiarlo al portapapeles si el
// bus no esta. Nada mas.
//
// # Lo que NO hace, a proposito
//
//   - NO guarda la llave. Se escribe, se pasa al servicio como extra del `Intent`
//     y se borra el campo. La URL si se recuerda: no es un secreto y tener que
//     teclearla en cada arranque solo invita a guardarla en un papel.
//   - NO decide ni interpreta el estado. Lo que enseña es la cadena del crate
//     (`PuenteNativo.estadoSeguro()` via `ServicioEnki`). Si dice
//     `sin_borde_jni`, es que el crate no exporta el simbolo, y se dice tal cual.
//   - NO pide el permiso de accesibilidad por su cuenta: abre la pantalla de
//     Ajustes. Activar un servicio de accesibilidad sin que el dueño lo vea es
//     exactamente lo que Android prohibe (y lo que un malware hace).
//   - NO arranca el canal al abrir la app. Abrir una pantalla no puede abrir dos
//     canales con la misma llave.
//   - NO mira la pantalla por su cuenta. El volcado se hace cuando el dueño
//     pulsa el boton: espiar en bucle es otra cosa (y no es esta).
//   - NO publica el volcado si el crate no esta: lo dice en pantalla y deja el
//     JSON en el portapapeles. Un "no se pudo" sin salida obligaria a repetir el
//     volcado, y el volcado es una foto que caduca.
//
// # Refresco
//
// Un `Handler` en el hilo principal cada 2 s mientras la actividad esta en primer
// plano. `onPause` lo quita: una pantalla que se refresca en segundo plano es
// bateria gastada para nada.

package online.enki.instagram

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView

class MainActivity : Activity() {

    companion object {
        /** Donde se recuerda la URL (nunca la llave). */
        private const val PREFERENCIAS = "puente"
        private const val CLAVE_URL = "url"

        /** Cada cuanto se repinta el estado. */
        private const val CADENCIA_DE_REFRESCO_MS = 2_000L

        /** Codigo de la peticion de POST_NOTIFICATIONS. */
        private const val PETICION_DE_NOTIFICACIONES = 17
    }

    private lateinit var estadoCanal: TextView
    private lateinit var estadoAccesibilidad: TextView
    private lateinit var detalle: TextView
    private lateinit var campoUrl: EditText
    private lateinit var campoLlave: EditText
    private lateinit var nota: TextView
    private lateinit var botonObservar: Button
    private lateinit var botonCopiar: Button

    /**
     * El ultimo volcado que se tomo, para el boton de copiar.
     *
     * Se guarda en memoria y no en disco: un volcado lleva los textos de la
     * pantalla de una cuenta y no tiene por que sobrevivir a la app. Si el
     * proceso muere, se vuelve a pulsar OBSERVAR.
     */
    private var ultimoVolcado: String? = null
    private var nodosDelVolcado: Int = 0

    private val refresco = Handler(Looper.getMainLooper())
    private val tareaDeRefresco = object : Runnable {
        override fun run() {
            pintarEstado()
            refresco.postDelayed(this, CADENCIA_DE_REFRESCO_MS)
        }
    }

    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        setContentView(R.layout.actividad_principal)

        estadoCanal = findViewById(R.id.estado_canal)
        estadoAccesibilidad = findViewById(R.id.estado_accesibilidad)
        detalle = findViewById(R.id.detalle)
        campoUrl = findViewById(R.id.campo_url)
        campoLlave = findViewById(R.id.campo_llave)
        nota = findViewById(R.id.nota)

        // La URL se recuerda; la llave, no. El campo de la llave nace vacio y se
        // vacia otra vez despues de conectar.
        campoUrl.setText(preferencias().getString(CLAVE_URL, "") ?: "")
        campoLlave.setText("")

        findViewById<Button>(R.id.boton_conectar).setOnClickListener { conectar() }
        findViewById<Button>(R.id.boton_desconectar).setOnClickListener { desconectar() }
        findViewById<Button>(R.id.boton_accesibilidad).setOnClickListener {
            abrirAjustesDeAccesibilidad()
        }

        // El volcado (bloque 19b). Los dos botones comparten el mismo JSON: si
        // el bus no lo quiere, se copia y se pega en Telegram, que es como se
        // mira hoy una pantalla cuando el canal no esta.
        botonObservar = findViewById(R.id.boton_observar)
        botonObservar.setOnClickListener { observarPantalla() }
        botonCopiar = findViewById(R.id.boton_copiar)
        botonCopiar.setOnClickListener { copiarVolcado() }
        botonCopiar.isEnabled = ultimoVolcado != null

        pedirPermisoDeNotificaciones()
        pintarEstado()
    }

    override fun onResume() {
        super.onResume()
        pintarEstado()
        refresco.removeCallbacks(tareaDeRefresco)
        refresco.postDelayed(tareaDeRefresco, CADENCIA_DE_REFRESCO_MS)
    }

    override fun onPause() {
        refresco.removeCallbacks(tareaDeRefresco)
        super.onPause()
    }

    // ---- acciones ---------------------------------------------------------

    /**
     * Conectar: valida, guarda SOLO la url y arranca el servicio en primer plano.
     *
     * La validacion del `wss://` esta aqui y no en el crate porque el crate tambien
     * la hace (`url_no_segura`), pero comprobarla en pantalla evita arrancar un
     * servicio que va a fallar: el motivo tiene que verse antes, no en una
     * notificacion tres segundos despues.
     */
    private fun conectar() {
        val url = campoUrl.text.toString().trim()
        val llave = campoLlave.text.toString().trim()

        if (!url.startsWith("wss://")) {
            nota.text = getString(R.string.error_url_insegura)
            return
        }
        if (llave.isEmpty()) {
            nota.text = getString(R.string.error_sin_llave)
            return
        }

        preferencias().edit().putString(CLAVE_URL, url).apply()

        val intent = Intent(this, ServicioEnki::class.java).apply {
            action = ServicioEnki.ACCION_INICIAR
            putExtra(ServicioEnki.EXTRA_URL, url)
            putExtra(ServicioEnki.EXTRA_LLAVE, llave)
        }
        // minSdk 26: `startForegroundService` existe desde API 26, no hace falta rama.
        startForegroundService(intent)

        // La llave no se queda en la pantalla: el servicio ya la tiene en memoria.
        campoLlave.setText("")
        nota.text = getString(R.string.aviso_llave_no_se_guarda)
        pintarEstado()
    }

    /** Desconectar: baja el servicio. `stopService` no necesita arrancarlo antes. */
    private fun desconectar() {
        stopService(Intent(this, ServicioEnki::class.java))
        nota.text = getString(R.string.nota_inicial)
        pintarEstado()
    }

    /** Abre Ajustes > Accesibilidad. El permiso lo da el dueño, no la app. */
    private fun abrirAjustesDeAccesibilidad() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            startActivity(intent)
        } catch (e: Exception) {
            // Hay aparatos sin esa pantalla (TV, algunos Android recortados).
            nota.text = getString(R.string.error_sin_ajustes)
        }
    }

    // ---- el volcado de pantalla (bloque 19b) ------------------------------

    /**
     * OBSERVAR PANTALLA: lee el arbol real, lo serializa y lo manda al bus.
     *
     * Todo el trabajo pesado (recorrer 4000 nodos y montar el JSON) va en un
     * hilo aparte: en el hilo de la UI seria un ANR con una pantalla grande de
     * Instagram, que es justo la que se quiere volcar.
     *
     * El orden importa: primero se mira (aqui), despues se publica (en el hilo
     * de la UI, que es barato: el crate solo encola). Si el bus no lo quiere, el
     * JSON se queda en `ultimoVolcado` y COPIAR VOLCADO sigue funcionando: la
     * foto no se pierde por un canal caido.
     */
    private fun observarPantalla() {
        if (!PrimerPlano.servicioActivo(this)) {
            // El boton ya esta apagado sin servicio; esto es por si el estado
            // cambio entre el ultimo repintado y el toque.
            nota.text = getString(R.string.observar_sin_accesibilidad)
            return
        }

        botonObservar.isEnabled = false
        nota.text = getString(R.string.observar_leyendo)

        Thread {
            val resultado = Volcado.leer()
            runOnUiThread { terminarVolcado(resultado) }
        }.start()
    }

    /** La segunda mitad del volcado: enseñar el resultado y publicarlo. */
    private fun terminarVolcado(resultado: Volcado.Resultado) {
        botonObservar.isEnabled = PrimerPlano.servicioActivo(this)

        when (resultado) {
            is Volcado.Resultado.Imposible -> {
                nota.text = getString(R.string.observar_sin_leer, resultado.motivo)
            }

            is Volcado.Resultado.Hecho -> {
                ultimoVolcado = resultado.json
                nodosDelVolcado = resultado.nodos
                botonCopiar.isEnabled = true

                if (PuenteNativo.publicarObservacionSeguro(resultado.json)) {
                    nota.text = getString(
                        if (resultado.truncado) {
                            R.string.observar_enviado_truncado
                        } else {
                            R.string.observar_enviado
                        },
                        resultado.nodos
                    )
                } else {
                    // El motivo lo pone el crate (`sin_canal` con el estado
                    // dentro, `json_vacio`, `buzon_lleno`...). Si no dijo nada,
                    // se dice que no dijo nada en vez de inventarlo.
                    val motivo = PuenteNativo.ultimoMotivo() ?: "sin motivo"
                    nota.text = getString(R.string.observar_no_enviado, motivo)
                }
            }
        }
    }

    /**
     * COPIAR VOLCADO: el JSON al portapapeles.
     *
     * Es la salida cuando el bus falla: se pega en Telegram y se ve igual. No
     * necesita canal ni servicio (el JSON ya esta tomado), asi que no vuelve a
     * mirar la pantalla: copia lo que se vio, no lo que hay ahora.
     */
    private fun copiarVolcado() {
        val json = ultimoVolcado
        if (json.isNullOrBlank()) {
            nota.text = getString(R.string.volcado_nada)
            return
        }
        val portapapeles = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        portapapeles.setPrimaryClip(ClipData.newPlainText("volcado", json))
        nota.text = getString(R.string.volcado_copiado, nodosDelVolcado)
    }

    // ---- pintura ----------------------------------------------------------

    private fun pintarEstado() {
        val canal = if (ServicioEnki.estaEnMarcha()) {
            ServicioEnki.estado()
        } else {
            getString(R.string.canal_detenido)
        }
        estadoCanal.text = getString(R.string.estado_canal, canal)

        val accesibilidadActiva = PrimerPlano.servicioActivo(this)
        estadoAccesibilidad.text = getString(
            if (accesibilidadActiva) {
                R.string.accesibilidad_activa
            } else {
                R.string.accesibilidad_inactiva
            }
        )

        // Sin servicio no hay arbol que leer: el boton se apaga en vez de fallar
        // al pulsarlo (y `observarPantalla` lo vuelve a comprobar, porque el
        // estado puede cambiar entre dos repintados).
        botonObservar.isEnabled = accesibilidadActiva

        val motivo = ServicioEnki.motivo()
        detalle.text = buildString {
            append(
                getString(
                    if (PuenteNativo.disponible()) {
                        R.string.biblioteca_presente
                    } else {
                        R.string.biblioteca_ausente
                    }
                )
            )
            if (!motivo.isNullOrBlank()) {
                append("\n")
                append(motivo)
            }
        }
    }

    // ---- permisos y preferencias -----------------------------------------

    /** POST_NOTIFICATIONS existe desde API 33: por debajo no hay nada que pedir. */
    private fun pedirPermisoDeNotificaciones() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val concedido = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (concedido) return
        requestPermissions(
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            PETICION_DE_NOTIFICACIONES
        )
    }

    private fun preferencias(): SharedPreferences =
        getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE)
}
