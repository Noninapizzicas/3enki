#ifndef ENKI_DEBUG_H
#define ENKI_DEBUG_H

/**
 * Enki Debug Remoto — Publica Serial por MQTT en tiempo real.
 *
 * Cuando el modo debug está activo (via MQTT o portal web),
 * cada línea de Serial se publica en:
 *   enki/{project}/debug/{device}
 *
 * Así puedes ver el output del ESP32 desde la UI web sin cable.
 *
 * Uso: en vez de Serial.println(), usa enki_debug() que hace ambas cosas.
 * O activa el modo con enki_debug_enable() para interceptar todo Serial.
 */

#include <Arduino.h>

/**
 * Inicializar debug remoto. Llamar después de MQTT conectado.
 */
void debugSetup();

/**
 * Procesar en loop — flush buffer de debug si hay líneas pendientes.
 */
void debugLoop();

/**
 * Activar/desactivar debug remoto.
 * Cuando activo, enki_debug() publica por MQTT además de Serial.
 */
void enki_debug_enable();
void enki_debug_disable();
bool enki_debug_active();

/**
 * Imprimir mensaje a Serial + MQTT (si debug activo).
 * Mismo API que Serial.printf.
 */
void enki_debug(const char* fmt, ...);

/**
 * Manejar mensaje MQTT de control de debug.
 * Topic: enki/{project}/debug/{device}/control
 * Payload: { "enable": true/false }
 */
void debugHandleControl(const char* topic, const char* payload);

#endif // ENKI_DEBUG_H
