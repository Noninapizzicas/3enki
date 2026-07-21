//! Análisis de PROSODIA — DSP puro, sin modelo, determinista. audio → features.
//!
//! El motor da FEATURES crudas (la mitad REFLEJO del perceptor); la etiqueta
//! emocional la pone el LLM (la mitad FUZZY). Aquí no se juzga nada.

use anyhow::{anyhow, Result};
use std::io::Cursor;

#[derive(serde::Serialize)]
pub struct Features {
    pub duracion_s: f32,
    pub energia_rms: f32,
    pub variacion_energia: f32, // desviación de la energía por marco (proxy de arousal)
    pub pitch_hz: f32,          // f0 mediano de los marcos sonoros (0 = sin voz)
    pub pitch_variacion_hz: f32,
    pub tasa_silabas_s: f32,    // picos de energía por segundo (proxy de ritmo del habla)
    pub proporcion_sonora: f32, // fracción de marcos con voz (0..1)
}

/// Analiza un WAV (bytes) → features de prosodia.
pub fn analizar(wav: &[u8]) -> Result<Features> {
    let (pcm, sr) = wav_a_pcm(wav)?;
    if pcm.is_empty() {
        return Err(anyhow!("audio vacío"));
    }
    let sr_f = sr as f32;
    let dur = pcm.len() as f32 / sr_f;

    let energia_rms = rms(&pcm);

    // Marcos de 25 ms, salto de 10 ms.
    let frame = (sr_f * 0.025) as usize;
    let hop = (sr_f * 0.010).max(1.0) as usize;
    let mut energias = Vec::new();
    let mut f0s = Vec::new();
    let mut sonoros = 0usize;
    let mut total = 0usize;
    let umbral_energia = energia_rms * 0.5;

    let mut i = 0;
    while i + frame <= pcm.len() {
        let seg = &pcm[i..i + frame];
        let e = rms(seg);
        energias.push(e);
        total += 1;
        if e > umbral_energia {
            if let Some(f0) = f0_autocorrelacion(seg, sr) {
                f0s.push(f0);
                sonoros += 1;
            }
        }
        i += hop;
    }

    let (media_e, var_e) = media_std(&energias);
    let (pitch_hz, pitch_var) = if f0s.is_empty() {
        (0.0, 0.0)
    } else {
        let med = mediana(&mut f0s.clone());
        let (_, std) = media_std(&f0s);
        (med, std)
    };
    let _ = media_e;

    // Ritmo: picos en la envolvente de energía (proxy de sílabas).
    let picos = contar_picos(&energias, media_e.max(1e-6));
    let tasa_silabas_s = if dur > 0.0 { picos as f32 / dur } else { 0.0 };
    let proporcion_sonora = if total > 0 { sonoros as f32 / total as f32 } else { 0.0 };

    Ok(Features {
        duracion_s: redondear(dur, 2),
        energia_rms: redondear(energia_rms, 4),
        variacion_energia: redondear(var_e, 4),
        pitch_hz: redondear(pitch_hz, 1),
        pitch_variacion_hz: redondear(pitch_var, 1),
        tasa_silabas_s: redondear(tasa_silabas_s, 2),
        proporcion_sonora: redondear(proporcion_sonora, 2),
    })
}

fn rms(x: &[f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
}

/// f0 por autocorrelación en el rango de voz humana (50–400 Hz). None si no hay
/// un pico claro (marco sordo/silencio).
fn f0_autocorrelacion(frame: &[f32], sr: usize) -> Option<f32> {
    let min_lag = sr / 400; // 400 Hz
    let max_lag = (sr / 50).min(frame.len().saturating_sub(1)); // 50 Hz
    if max_lag <= min_lag {
        return None;
    }
    let energia0: f32 = frame.iter().map(|v| v * v).sum();
    if energia0 <= 0.0 {
        return None;
    }
    let mut mejor_lag = 0usize;
    let mut mejor = 0.0f32;
    for lag in min_lag..=max_lag {
        let mut suma = 0.0f32;
        for j in 0..(frame.len() - lag) {
            suma += frame[j] * frame[j + lag];
        }
        if suma > mejor {
            mejor = suma;
            mejor_lag = lag;
        }
    }
    // El pico debe ser significativo frente a la energía (marco realmente sonoro).
    if mejor_lag > 0 && mejor > 0.3 * energia0 {
        Some(sr as f32 / mejor_lag as f32)
    } else {
        None
    }
}

fn media_std(x: &[f32]) -> (f32, f32) {
    if x.is_empty() {
        return (0.0, 0.0);
    }
    let media = x.iter().sum::<f32>() / x.len() as f32;
    let var = x.iter().map(|v| (v - media).powi(2)).sum::<f32>() / x.len() as f32;
    (media, var.sqrt())
}

fn mediana(x: &mut [f32]) -> f32 {
    if x.is_empty() {
        return 0.0;
    }
    x.sort_by(|a, b| a.total_cmp(b));
    x[x.len() / 2]
}

/// Cuenta picos de la envolvente por encima del umbral, con histéresis (evita
/// contar el mismo pico dos veces): sube-por-encima → baja-por-debajo = 1 pico.
fn contar_picos(env: &[f32], umbral: f32) -> usize {
    let mut n = 0;
    let mut arriba = false;
    for &e in env {
        if !arriba && e > umbral * 1.2 {
            arriba = true;
            n += 1;
        } else if arriba && e < umbral * 0.8 {
            arriba = false;
        }
    }
    n
}

fn redondear(x: f32, dec: u32) -> f32 {
    let f = 10f32.powi(dec as i32);
    (x * f).round() / f
}

/// WAV (bytes) → (PCM f32 mono, sample_rate). Estéreo → media de canales. Se
/// conserva el sample-rate original (mejor para el tono).
fn wav_a_pcm(bytes: &[u8]) -> Result<(Vec<f32>, usize)> {
    let mut reader = hound::WavReader::new(Cursor::new(bytes)).map_err(|e| anyhow!("WAV inválido: {e}"))?;
    let spec = reader.spec();
    let ch = spec.channels as usize;
    let mut mono = Vec::new();
    match spec.sample_format {
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            let s: Vec<i32> = reader.samples::<i32>().collect::<std::result::Result<_, _>>()?;
            for frame in s.chunks(ch) {
                mono.push(frame.iter().map(|&x| x as f32 / max).sum::<f32>() / ch as f32);
            }
        }
        hound::SampleFormat::Float => {
            let s: Vec<f32> = reader.samples::<f32>().collect::<std::result::Result<_, _>>()?;
            for frame in s.chunks(ch) {
                mono.push(frame.iter().sum::<f32>() / ch as f32);
            }
        }
    }
    Ok((mono, spec.sample_rate as usize))
}
