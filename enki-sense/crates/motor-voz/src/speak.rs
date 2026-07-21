//! Síntesis de voz con Piper (piper-rs) — Rust + ort (ONNX Runtime), local.
//! texto → audio (WAV). Voces en español.
//!
//! Carga LOCAL (sin red): las voces (.onnx + .onnx.json) se provisionan con
//! get-models.sh en el dir de voces. Cada voz se carga una vez y se reutiliza.
//!
//! HONESTIDAD: si la voz no está provisionada → Err("voz_no_disponible"); el
//! motor no finge audio.

use anyhow::{anyhow, Result};
use piper_rs::Piper;
use std::io::Cursor;
use std::path::PathBuf;

/// Voz por defecto (español). get-models.sh provisiona esta.
pub const VOZ_DEFECTO: &str = "es_ES-davefx-medium";

fn voces_dir() -> PathBuf {
    std::env::var("MOTOR_VOZ_MODELS")
        .unwrap_or_else(|_| "/opt/enki-sense/models/voz".to_string())
        .into()
}

/// Un sintetizador cargado para UNA voz. `create` necesita &mut (estado interno).
pub struct Locutor {
    piper: Piper,
    sample_rate: u32,
}

impl Locutor {
    /// Carga una voz del dir local: `<dir>/<voz>/voz.onnx` + `voz.onnx.json`.
    pub fn cargar(voz: &str) -> Result<Self> {
        // Voz saneada (sin path traversal).
        if voz.contains('/') || voz.contains("..") {
            return Err(anyhow!("voz_no_disponible (nombre inválido)"));
        }
        let dir = voces_dir().join(voz);
        let onnx = dir.join("voz.onnx");
        let cfg = dir.join("voz.onnx.json");
        if !onnx.exists() || !cfg.exists() {
            return Err(anyhow!("voz_no_disponible (no provisionada en {})", dir.display()));
        }
        let piper = Piper::new(&onnx, &cfg).map_err(|e| anyhow!("cargar voz: {e:?}"))?;
        Ok(Self { piper, sample_rate: 22050 })
    }

    /// Sintetiza `texto` → WAV (bytes). Determinista (misma voz+texto → mismo audio).
    pub fn decir(&mut self, texto: &str) -> Result<(Vec<u8>, u32)> {
        let (samples, sr) = self
            .piper
            .create(texto, false, None, None, None, None)
            .map_err(|e| anyhow!("síntesis: {e:?}"))?;
        self.sample_rate = sr;
        let wav = samples_a_wav(&samples, sr)?;
        Ok((wav, sr))
    }
}

/// Muestras f32 [-1,1] → WAV PCM 16-bit mono (bytes).
fn samples_a_wav(samples: &[f32], sr: u32) -> Result<Vec<u8>> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: sr,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::<u8>::new());
    {
        let mut w = hound::WavWriter::new(&mut cursor, spec)?;
        for &s in samples {
            w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16)?;
        }
        w.finalize()?;
    }
    Ok(cursor.into_inner())
}
