//! Nucleo del puente Enki ↔ movil.
//!
//! Se compila de dos formas:
//!   * binario (`enki-bridge-cli`) para probar el canal en un escritorio;
//!   * `cdylib` para Android, donde la APK llama a `Native_start`.
//!
//! No suplanta ninguna aplicacion: recibe ordenes y opera el cliente real que
//! ya esta instalado y con sesion iniciada en el dispositivo.
pub mod bus;
pub mod ordenes;

use std::sync::Arc;
use tokio::sync::Mutex;

/// Estado compartido del puente, legible desde Java/Kotlin.
#[derive(Default)]
pub struct Estado {
    pub conectado: bool,
    pub ultimo_detalle: String,
    pub ordenes: u64,
}

pub type EstadoCompartido = Arc<Mutex<Estado>>;

/// Arranca el canal en un hilo propio y devuelve el estado compartido.
pub fn arrancar(url: String, id_cliente: String) -> EstadoCompartido {
    // rustls exige elegir un proveedor criptografico antes de cualquier TLS.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let estado: EstadoCompartido = Arc::new(Mutex::new(Estado::default()));
    let estado_hilo = estado.clone();

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .worker_threads(2)
            .build()
        {
            Ok(rt) => rt,
            Err(e) => {
                let mut g = estado_hilo.blocking_lock();
                g.ultimo_detalle = format!("sin runtime: {e}");
                return;
            }
        };
        rt.block_on(bucle(url, id_cliente, estado_hilo));
    });

    estado
}

async fn bucle(url: String, id_cliente: String, estado: EstadoCompartido) {
    loop {
        match bus::Sesion::abrir(&url, &id_cliente).await {
            Ok(mut sesion) => {
                {
                    let mut g = estado.lock().await;
                    g.conectado = true;
                    g.ultimo_detalle = "conectado al bus de Enki".into();
                }

                if let Err(e) = sesion.suscribir(bus::TOPIC_ORDENES).await {
                    let mut g = estado.lock().await;
                    g.conectado = false;
                    g.ultimo_detalle = e;
                } else {
                    while let Some(msg) = sesion.siguiente().await {
                        match msg {
                            Ok(r) => {
                                let texto = String::from_utf8_lossy(&r.payload).to_string();
                                let mut g = estado.lock().await;
                                g.ordenes += 1;
                                g.ultimo_detalle = format!("orden en {}: {}", r.topic, texto);
                            }
                            Err(e) => {
                                let mut g = estado.lock().await;
                                g.ultimo_detalle = e;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let mut g = estado.lock().await;
                g.conectado = false;
                g.ultimo_detalle = e;
            }
        }

        {
            let mut g = estado.lock().await;
            g.conectado = false;
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

#[cfg(target_os = "android")]
mod android_api {
    use super::{arrancar, EstadoCompartido};
    use jni::objects::{JClass, JString};
    use jni::sys::{jint, jstring};
    use jni::JNIEnv;
    use std::sync::OnceLock;

    static ESTADO: OnceLock<EstadoCompartido> = OnceLock::new();

    /// `Native.start(url, idCliente)` — arranca el canal. Devuelve 0 si se acepto.
    #[no_mangle]
    pub extern "system" fn Java_online_enki_bridge_Native_start<'local>(
        mut env: JNIEnv<'local>,
        _clase: JClass<'local>,
        url: JString<'local>,
        id_cliente: JString<'local>,
    ) -> jint {
        let url: String = match env.get_string(&url) {
            Ok(s) => s.into(),
            Err(_) => return -1,
        };
        let id_cliente: String = match env.get_string(&id_cliente) {
            Ok(s) => s.into(),
            Err(_) => return -2,
        };
        let _ = ESTADO.set(arrancar(url, id_cliente));
        0
    }

    /// `Native.estado()` — devuelve "conectado|detalle|ordenes".
    #[no_mangle]
    pub extern "system" fn Java_online_enki_bridge_Native_estado<'local>(
        mut env: JNIEnv<'local>,
        _clase: JClass<'local>,
    ) -> jstring {
        let detalle = match ESTADO.get() {
            Some(e) => match e.try_lock() {
                Ok(g) => format!("{}|{}|{}", g.conectado, g.ultimo_detalle, g.ordenes),
                Err(_) => "false|ocupado|0".to_string(),
            },
            None => "false|sin arrancar|0".to_string(),
        };
        match env.new_string(detalle) {
            Ok(s) => s.into_raw(),
            Err(_) => std::ptr::null_mut(),
        }
    }
}
