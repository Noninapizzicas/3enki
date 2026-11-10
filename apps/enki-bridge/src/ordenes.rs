//! Modelo de las ordenes que llegan de Enki y de los resultados que se devuelven.
use serde::{Deserialize, Serialize};

/// Lo que Enki puede pedir al movil.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(tag = "accion", rename_all = "snake_case")]
pub enum Orden {
    /// Publicar una pieza en una red concreta.
    Publicar {
        red: Red,
        /// Texto del pie de publicacion.
        texto: String,
        /// Ruta local del archivo ya descargado en el movil.
        archivo: String,
        /// Si es true, el flujo se detiene antes de pulsar "Publicar".
        #[serde(default)]
        simulacion: bool,
    },
    /// Comprobar que el canal sigue vivo.
    Latido,
}

/// Redes que el puente sabe operar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Red {
    Instagram,
    Tiktok,
    Facebook,
}

/// Estado de un trabajo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Estado {
    Recibida,
    EnCurso,
    Hecha,
    Fallida,
    Simulada,
}

/// Lo que el movil devuelve a Enki.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resultado {
    pub trabajo_id: String,
    pub estado: Estado,
    pub detalle: String,
}

impl Resultado {
    pub fn nuevo(trabajo_id: impl Into<String>, estado: Estado, detalle: impl Into<String>) -> Self {
        Self { trabajo_id: trabajo_id.into(), estado, detalle: detalle.into() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn una_orden_se_deserializa_por_su_accion() {
        let json = r#"{"accion":"publicar","red":"instagram","texto":"hola","archivo":"/sdcard/a.jpg"}"#;
        let orden: Orden = serde_json::from_str(json).unwrap();
        match orden {
            Orden::Publicar { red, simulacion, .. } => {
                assert_eq!(red, Red::Instagram);
                assert!(!simulacion, "simulacion debe valer false por defecto");
            }
            _ => panic!("se esperaba Publicar"),
        }
    }

    #[test]
    fn el_latido_no_necesita_campos() {
        let orden: Orden = serde_json::from_str(r#"{"accion":"latido"}"#).unwrap();
        assert!(matches!(orden, Orden::Latido));
    }
}
