// PENDIENTE DE COMPILAR EN EL PORTATIL (no hay Android SDK en el servidor)
//
// ServicioEnki.kt — el servicio en primer plano que mantiene vivo el canal.
//
// Lo que hace: recibe la URL y la llave del bus, abre el canal por JNI y se queda
// delante con una notificacion que dice el estado. Cuando la pantalla se apaga y
// el movil duerme, Android mata cualquier cosa que no sea un servicio en primer
// plano: sin esto el canal dura lo que dura la pantalla encendida.
//
// # Lo que NO hace, a proposito
//
//   - NO guarda la llave. Ni en `SharedPreferences` ni en la notificacion ni en el
//     log. Vive en memoria mientras el servicio esta vivo, y al cerrar la app hay
//     que volver a teclearla. Es una molestia de diez segundos contra un secreto
//     en disco (V1).
//   - NO reconecta. La reconexion es del crate (`canal/mqtt.rs`): dos bucles de
//     reconexion con la misma llave son dos canales y dos suscripciones, y el
//     broker acaba cerrando el primero.
//   - NO arranca solo tras un reinicio. `RECEIVE_BOOT_COMPLETED` esta declarado
//     pero no hay receptor: sin llave en disco un arranque automatico solo podria
//     subir una notificacion vacia. Ver la nota 2 del manifiesto.
//   - NO decide si se puede operar. El estado que enseña es el del crate, tal cual.
//
// # Por que `LifecycleService` y no `Service`
//
// El ciclo de vida del canal (arranca, se lee, se para) se puede observar como
// cualquier otro ciclo de Android, y `androidx.lifecycle:lifecycle-service` es la
// dependencia que el bloque pide. Un `Service` pelado obligaria a inventar un
// registro de callbacks propio para lo mismo.
//
// # Hilos
//
// `iniciar()` del crate HACE RED (handshake TLS + CONNECT + SUBACK) y puede tardar
// segundos: se llama en un hilo aparte, nunca en el hilo principal. El vigilante
// que lee el estado corre en el hilo principal cada 3 s y solo toca la
// notificacion, que es una llamada barata.

package online.enki.instagram

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

class ServicioEnki : LifecycleService() {

    companion object {
        /** Abrir el canal. Lleva `EXTRA_URL` y `EXTRA_LLAVE`. */
        const val ACCION_INICIAR = "online.enki.instagram.accion.INICIAR"

        /** Parar el canal y bajar el servicio. */
        const val ACCION_PARAR = "online.enki.instagram.accion.PARAR"

        const val EXTRA_URL = "url"
        const val EXTRA_LLAVE = "llave"

        /** El canal de notificaciones. Uno solo: el estado del puente. */
        const val CANAL_DE_NOTIFICACIONES = "canal_puente"

        /** Id de la notificacion persistente. */
        const val ID_DE_NOTIFICACION = 17

        /** Cada cuanto se relee el estado del crate para la notificacion. */
        private const val CADENCIA_MS = 3_000L

        @Volatile
        private var enMarcha: Boolean = false

        @Volatile
        private var estadoDelCanal: String = "detenido"

        @Volatile
        private var motivoDelCanal: String? = null

        /** ¿Hay un canal abierto (o arrancandose) en este proceso? */
        fun estaEnMarcha(): Boolean = enMarcha

        /** El ultimo estado del canal, tal como lo cuenta el crate. */
        fun estado(): String = estadoDelCanal

        /** El motivo del ultimo fallo, o `null`. */
        fun motivo(): String? = motivoDelCanal
    }

    private val refresco = Handler(Looper.getMainLooper())

    /** Un solo arranque: dos `iniciar` seguidos abririan dos canales. */
    private val arrancando = AtomicBoolean(false)

    /** Lee el estado del crate y refresca la notificacion. Se reprograma solo. */
    private val vigilante = object : Runnable {
        override fun run() {
            leerEstado()
            refresco.postDelayed(this, CADENCIA_MS)
        }
    }

    // ---- ciclo de vida ----------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        crearCanalDeNotificaciones()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        // Parar: se cierra el canal y se baja el servicio. `stopSelf` despues de
        // `stopForeground` para no dejar la notificacion huerfana.
        if (intent?.action == ACCION_PARAR) {
            pararCanal()
            return START_NOT_STICKY
        }

        // A partir de aqui el servicio tiene que estar en primer plano: si vino por
        // `startForegroundService`, el sistema da 5 s y despues mata la app.
        subirPrimerPlano()

        val url = intent?.getStringExtra(EXTRA_URL)
        val llave = intent?.getStringExtra(EXTRA_LLAVE)

        if (url.isNullOrBlank() || llave.isNullOrBlank()) {
            // Sin url ni llave no hay canal: se dice, se baja la notificacion y se
            // para. Un servicio en primer plano sin nada que hacer es bateria
            // gastada y una notificacion que miente.
            estadoDelCanal = "sin_credenciales"
            motivoDelCanal = "faltan la url o la llave del bus: el servicio no abre canal sin ellas"
            actualizarNotificacion()
            pararCanal()
            return START_NOT_STICKY
        }

        arrancarCanal(url, llave)

        // NO `START_STICKY`: si el sistema mata el servicio, el reintento llega con
        // `intent == null` y sin llave. Se prefiere que no vuelva a arrancar vacio.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        pararCanal()
        super.onDestroy()
    }

    // ---- el canal ---------------------------------------------------------

    /**
     * Abre el canal en un hilo aparte. `iniciar()` hace red: en el hilo principal
     * seria un ANR de manual.
     */
    private fun arrancarCanal(url: String, llave: String) {
        if (!arrancando.compareAndSet(false, true)) return

        // Si ya habia un canal, se cierra ANTES de abrir el siguiente. Dos canales
        // con la misma llave y el mismo client id hacen que el broker cierre el
        // primero, y el sintoma que se ve es "conecta y se cae" sin motivo. El
        // cierre va DENTRO del hilo: `detener()` tambien puede tocar la red.
        val habiaCanal = enMarcha

        enMarcha = true
        estadoDelCanal = "arrancando"
        motivoDelCanal = null
        actualizarNotificacion()

        Thread({
            if (habiaCanal) {
                PuenteNativo.detenerSeguro()
            }
            val abierto = PuenteNativo.iniciarSeguro(url, llave)
            estadoDelCanal = if (abierto) "conectado" else "sin_canal"
            motivoDelCanal = if (abierto) null else PuenteNativo.ultimoMotivo()

            // La notificacion se toca en el hilo principal, siempre.
            refresco.post {
                arrancando.set(false)
                actualizarNotificacion()
                refresco.removeCallbacks(vigilante)
                refresco.post(vigilante)
            }
        }, "enki-canal").start()
    }

    /** Cierra el canal y baja el servicio. Idempotente. */
    private fun pararCanal() {
        refresco.removeCallbacks(vigilante)
        if (enMarcha) {
            PuenteNativo.detenerSeguro()
        }
        arrancando.set(false)
        enMarcha = false
        estadoDelCanal = "detenido"
        motivoDelCanal = null

        // minSdk 26: `STOP_FOREGROUND_REMOVE` existe desde API 24, no hace falta rama.
        stopForeground(Service.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** Relee el estado del crate. Lo que diga el crate es lo que se enseña. */
    private fun leerEstado() {
        if (!enMarcha) return
        val bruto = PuenteNativo.estadoSeguro()
        estadoDelCanal = leerCampo(bruto, "canal") ?: bruto
        motivoDelCanal = leerCampo(bruto, "motivo")
        actualizarNotificacion()
    }

    /** Un campo de texto del estado, o `null` si no esta o el JSON no se puede leer. */
    private fun leerCampo(bruto: String, campo: String): String? = try {
        val obj = JSONObject(bruto)
        if (obj.isNull(campo)) null else obj.optString(campo).ifBlank { null }
    } catch (e: Exception) {
        null
    }

    // ---- la notificacion --------------------------------------------------

    /**
     * Sube el servicio a primer plano. El tipo `specialUse` es obligatorio desde
     * API 34 y tiene que casar con el `foregroundServiceType` del manifiesto: si no
     * casa, el sistema lanza `SecurityException` al arrancar.
     */
    private fun subirPrimerPlano() {
        val notificacion = construirNotificacion()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                ID_DE_NOTIFICACION,
                notificacion,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // En 29..33 el tipo se toma del manifiesto.
            startForeground(
                ID_DE_NOTIFICACION,
                notificacion,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST
            )
        } else {
            startForeground(ID_DE_NOTIFICACION, notificacion)
        }
    }

    private fun crearCanalDeNotificaciones() {
        val gestor = getSystemService(NotificationManager::class.java) ?: return
        val canal = NotificationChannel(
            CANAL_DE_NOTIFICACIONES,
            getString(R.string.notificacion_canal_nombre),
            // IMPORTANCE_LOW: el estado se ve en la barra, pero no suena. Un canal
            // que pita cada reconexion es un canal que el dueño silencia, y
            // entonces la notificacion deja de servir para lo unico que sirve:
            // decir que el puente esta vivo.
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notificacion_canal_descripcion)
            setShowBadge(false)
        }
        gestor.createNotificationChannel(canal)
    }

    private fun construirNotificacion(): Notification {
        val abrir = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val parar = PendingIntent.getService(
            this,
            1,
            Intent(this, ServicioEnki::class.java).apply { action = ACCION_PARAR },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val cuerpo = getString(R.string.notificacion_texto, estadoDelCanal)
        val completo = motivoDelCanal?.let { "$cuerpo · $it" } ?: cuerpo

        return NotificationCompat.Builder(this, CANAL_DE_NOTIFICACIONES)
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(getString(R.string.notificacion_titulo))
            .setContentText(cuerpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(completo))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(abrir)
            .addAction(R.drawable.ic_notificacion, getString(R.string.accion_parar), parar)
            .build()
    }

    private fun actualizarNotificacion() {
        val gestor = getSystemService(NotificationManager::class.java) ?: return
        gestor.notify(ID_DE_NOTIFICACION, construirNotificacion())
    }
}
