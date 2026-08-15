---
tipo: herramienta
sector: trading-algoritmico
tags: [vps, colocation, latencia, infraestructura, hosting]
---
# Infraestructura — VPS, colocation y latencia

> Un bot brillante que corre en tu portátil junto a la ventana de casa no es un sistema de trading — es una demo con fecha de caducidad, la primera vez que se corte el wifi o se vaya la luz con una posición abierta.

---

## VPS para trading (nivel retail)

```
QUÉ RESUELVE  → 24/7 sin depender de tu ordenador personal, conexión estable, cerca
                geográficamente del servidor del broker/exchange para reducir latencia
PRECIO 2025-2026 → desde ~3,67 $/mes (planes básicos) hasta 20-50€/mes (planes con SSD
                NVMe dedicado, KVM, latencia garantizada al broker)
CARACTERÍSTICAS CLAVE A EXIGIR
  → SSD NVMe (no HDD, ni SSD compartido)
  → virtualización KVM (recursos DEDICADOS, no compartidos con otros clientes del hosting)
  → ubicación cerca del datacenter del broker/exchange (Londres, Nueva York NY4/NY5 Equinix,
    Frankfurt, Tokio, Singapur son los polos financieros de referencia)
  → soporte para el software que vayas a correr: MT4/MT5, Python (bots freqtrade/custom),
    builds Linux de TradeStation si aplica
PROVEEDORES ESPECIALIZADOS EN TRADING
  → MonoVM, YouStable, VPSForexTrader — VPS orientados específicamente a MT4/MT5 con
    latencia optimizada al broker, presencia en los polos financieros mencionados
  → alternativa genérica: cualquier VPS estándar (Hetzner, DigitalOcean, OVH) funciona
    igual de bien para bots Python/cripto que no dependan de latencia sub-milisegundo a
    un broker forex concreto — más barato, menos especializado
```

## Colocation (nivel institucional/HFT)

```
QUÉ ES        → alojar tu servidor FÍSICAMENTE en el mismo datacenter que el matching
                engine del exchange/venue — la latencia de red se reduce a microsegundos
                en vez de milisegundos
DÓNDE IMPORTA → HFT puro, arbitraje entre venues, market making competitivo — donde ser
                unos microsegundos más lento que otro participante significa perder la
                cola de ejecución sistemáticamente
COSTE         → orden de magnitud muy superior a un VPS (miles de €/mes) — solo se justifica
                cuando el edge por operación es tan pequeño que la latencia ES el edge
NO LO NECESITAS SI → tu estrategia opera en timeframes de minutos u horas, donde la
                latencia de red (decenas-cientos de ms) es irrelevante frente al horizonte
                de la señal
```

## Checklist de resiliencia operativa

```
→ Kill-switch manual accesible remotamente (SSH/panel) para cerrar posiciones de emergencia
→ Alertas de caída del bot vía Telegram/email — un bot que se cae en silencio es el peor
  escenario, no el bot que se cae con alerta inmediata
→ Reinicio automático del proceso (systemd/supervisor en Linux, o watchdog dedicado) tras
  crash, con lógica de reconciliación de posiciones al arrancar (no asumir estado limpio)
→ Backup de configuración y logs fuera del propio VPS — si el VPS se pierde, no pierdes
  también el historial de decisiones para auditar qué pasó
```

---

## Tabla de decisión

```
NIVEL DE ESTRATEGIA              INFRAESTRUCTURA RECOMENDADA           COSTE APROX/MES
Bot retail (MT5 EA, freqtrade)   VPS especializado forex/genérico       5-20€
Cuant amateur (Python, horas)     VPS genérico (Hetzner/DO/OVH)          5-15€
Cuant serio (intradía, minutos)   VPS premium cerca de datacenter broker 20-80€
HFT / market making competitivo   Colocation en el datacenter del venue  1.000€+
```

## Errores comunes

```
→ Correr el bot en un VPS gratuito o compartido de baja calidad — latencia impredecible y
  reinicios no anunciados del proveedor arruinan la fiabilidad exactamente cuando más falta hace.
→ No probar el failover — nunca simular un corte de conexión/crash en un entorno de prueba
  antes de confiar el capital real a la infraestructura.
→ Pensar que colocation resuelve problemas de estrategia — la latencia solo importa si el
  EDGE de la estrategia depende de ser rápido; en estrategias direccionales de medio plazo
  es dinero literalmente tirado.
→ No separar entorno de desarrollo/testing del VPS de producción — desplegar cambios de
  código directamente sobre el bot que gestiona capital real sin pasar por staging.
```

---

## Novedades 2025-2026

```
→ Proveedores de VPS especializados en trading (YouStable, MonoVM) siguen expandiendo su
  red de datacenters en los polos financieros clave (Londres, NY4/NY5, Frankfurt, Tokio,
  Singapur), con planes que arrancan por debajo de 4$/mes para el nivel más básico.
```
