package online.enki.bridge

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Pantalla unica de F1: arranca el canal y ensena el estado en vivo.
 *
 * La URL lleva la llave del broker en la query, igual que el panel de cocina.
 */
class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var estado: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val campoUrl = EditText(this).apply {
            hint = "wss://enki-ai.online/mqtt?k=LLAVE"
            setText(getSharedPreferences("enki", MODE_PRIVATE).getString("url", "") ?: "")
        }
        estado = TextView(this).apply { text = "sin arrancar" }
        val boton = Button(this).apply { text = "Conectar" }

        boton.setOnClickListener {
            val url = campoUrl.text.toString().trim()
            if (url.isEmpty()) {
                estado.text = "falta la URL del broker"
                return@setOnClickListener
            }
            getSharedPreferences("enki", MODE_PRIVATE).edit().putString("url", url).apply()
            val codigo = Native.start(url, "enki-bridge-" + android.os.Build.MODEL)
            estado.text = if (codigo == 0) "arrancando..." else "error al arrancar ($codigo)"
        }

        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            addView(campoUrl)
            addView(boton)
            addView(estado)
        }
        setContentView(raiz)

        handler.postDelayed(object : Runnable {
            override fun run() {
                estado.text = Native.estado()
                handler.postDelayed(this, 2000)
            }
        }, 2000)
    }
}
