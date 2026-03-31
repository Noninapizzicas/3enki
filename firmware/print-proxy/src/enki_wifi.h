#ifndef ENKI_WIFI_H
#define ENKI_WIFI_H

/**
 * Enki WiFi — Conexión multi-red con fallback y portal cautivo
 *
 * Boot: intento bloqueante de hasta 3 redes configuradas.
 * Runtime: reconexión NON-BLOCKING (no bloquea loop).
 * Fallback: portal cautivo AP tras N ciclos fallidos.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include "config.h"

// Estado WiFi
extern DNSServer dnsServer;
extern bool      portalMode;

/**
 * Intento bloqueante de conexión (solo boot).
 * Prueba las 3 redes en orden. Si ninguna conecta, abre portal AP.
 * Retorna true si conectó a alguna red.
 */
bool wifiSetup();

/**
 * Reconexión non-blocking para runtime.
 * Llamar en cada iteración del loop().
 * Detecta desconexión, prueba redes sin bloquear, abre portal si todo falla.
 */
void wifiHandleReconnect();

/**
 * Inicia portal cautivo AP con DNS wildcard.
 */
void wifiStartPortal();

#endif // ENKI_WIFI_H
