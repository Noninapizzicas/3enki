// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// MainActivity.kt — la pantalla minima del puente.
//
// Lo que hace: enseñar el estado del canal y del servicio de accesibilidad, dejar
// teclear la URL y la llave del bus, arrancar/parar el servicio en primer plano y
// abrir los ajustes de accesibilidad. Nada mas.
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
//
// # Refresco
//
// Un `Handler` en el hilo principal cada 2 s mientras la actividad esta en primer
// plano. `onPause` lo quita: una pantalla que se refresca en segundo plano es
// bateria gastada para nada.

package online.enki.instagram

import android.Manifest
import android.app.Activity
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

    // ---- pintura ----------------------------------------------------------

    private fun pintarEstado() {
        val canal = if (ServicioEnki.estaEnMarcha()) {
            ServicioEnki.estado()
        } else {
            getString(R.string.canal_detenido)
        }
        estadoCanal.text = getString(R.string.estado_canal, canal)

        estadoAccesibilidad.text = getString(
            if (PrimerPlano.servicioActivo(this)) {
                R.string.accesibilidad_activa
            } else {
                R.string.accesibilidad_inactiva
            }
        )

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
