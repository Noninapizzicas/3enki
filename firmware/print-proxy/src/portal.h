#ifndef PORTAL_H
#define PORTAL_H

#include <WebServer.h>
#include <Preferences.h>
#include <NimBLEDevice.h>
#include "config.h"

// ============================================
// Config en RAM — cargada de NVS al boot
// ============================================

struct WifiEntry {
  char ssid[33];
  char pass[65];
};

struct PrintProxyConfig {
  // Identidad
  char deviceId[32];
  char projectId[32];
  // WiFi — hasta 3 redes con fallback
  WifiEntry wifi[WIFI_MAX_NETWORKS];
  int8_t wifiActive;            // indice de la red actualmente conectada (-1 = ninguna)
  // MQTT
  char mqttHost[64];
  uint16_t mqttPort;
  char mqttUser[32];
  char mqttPass[64];
  // Impresora BLE
  char printerName[32];
  char printerAddr[20];       // MAC guardada para reconexion directa sin escaneo
  char printerSvcUuid[48];
  char printerCharUuid[48];
  // Estado (no persistido)
  bool configured;  // true si hay al menos mqttHost y printerName
};

extern PrintProxyConfig cfg;

// ============================================
// Funciones publicas
// ============================================

void configLoad();
void configSave();
void portalSetup();

// ============================================
// HTML del portal (embebido en flash con PROGMEM)
// ============================================

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Print Proxy</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:16px;max-width:480px;margin:0 auto}
h1{font-size:1.3em;color:#e94560;margin-bottom:4px}
.sub{font-size:.8em;color:#888;margin-bottom:16px}
.card{background:#16213e;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #0f3460}
.card h2{font-size:1em;color:#e94560;margin-bottom:12px;display:flex;align-items:center;gap:6px}
label{display:block;font-size:.85em;color:#aaa;margin-bottom:4px;margin-top:10px}
label:first-of-type{margin-top:0}
input,select{width:100%;padding:10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;color:#fff;font-size:.95em}
input:focus{outline:none;border-color:#e94560}
.row{display:flex;gap:8px}
.row>*{flex:1}
btn,button,.btn{display:block;width:100%;padding:12px;border:none;border-radius:8px;font-size:1em;cursor:pointer;margin-top:12px;font-weight:600}
.btn-primary{background:#e94560;color:#fff}
.btn-primary:hover{background:#c73e54}
.btn-scan{background:#0f3460;color:#e94560;border:1px solid #e94560}
.btn-scan:hover{background:#1a4080}
.btn-wifi-scan{background:#0f3460;color:#52b788;border:1px solid #52b788;margin-top:8px}
.btn-wifi-scan:hover{background:#1a4080}
.wifi-net{padding:8px 10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;margin-top:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
.wifi-net:hover{border-color:#52b788}
.wifi-net.configured{border-color:#52b788;background:#1b4332}
.wifi-signal{font-size:.75em;color:#888}
.wifi-tag{font-size:.7em;padding:2px 6px;border-radius:4px;background:#533483;color:#fff;margin-left:6px}
.btn-test{background:#533483;color:#fff}
.btn-test:hover{background:#6b44a0}
.btn-reset{background:transparent;color:#e94560;border:1px solid #333;font-size:.85em}
.status{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.badge{padding:4px 10px;border-radius:12px;font-size:.75em;font-weight:600}
.badge.ok{background:#1b4332;color:#52b788}
.badge.err{background:#3d0000;color:#e94560}
.badge.wait{background:#3d3d00;color:#ffd166}
#scan-results{margin-top:8px}
.printer-opt{padding:10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;margin-top:6px;cursor:pointer;display:flex;justify-content:space-between}
.printer-opt:hover{border-color:#e94560}
.printer-opt.selected{border-color:#52b788;background:#1b4332}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #555;border-top:2px solid #e94560;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.msg{padding:10px;border-radius:8px;margin-top:8px;font-size:.85em}
.msg.ok{background:#1b4332;color:#52b788}
.msg.err{background:#3d0000;color:#e94560}
.hidden{display:none}
</style>
</head>
<body>

<h1>&#9881; Print Proxy</h1>
<p class="sub" id="device-info">Cargando...</p>

<div class="status" id="status-badges"></div>

<!-- WiFi — 3 redes con fallback -->
<div class="card">
  <h2>&#128246; WiFi (3 redes, fallback automatico)</h2>
  <label>Red 1 (principal)</label>
  <div class="row">
    <div><input id="wifi_ssid1" placeholder="SSID principal"></div>
    <div><input id="wifi_pass1" type="password" placeholder="Password"></div>
  </div>
  <label>Red 2 (respaldo)</label>
  <div class="row">
    <div><input id="wifi_ssid2" placeholder="SSID respaldo"></div>
    <div><input id="wifi_pass2" type="password" placeholder="Password"></div>
  </div>
  <label>Red 3 (respaldo)</label>
  <div class="row">
    <div><input id="wifi_ssid3" placeholder="SSID movil/hotspot"></div>
    <div><input id="wifi_pass3" type="password" placeholder="Password"></div>
  </div>
  <button class="btn btn-wifi-scan" onclick="scanWifi()">&#128246; Escanear redes WiFi</button>
  <div id="wifi-scan-results"></div>
  <p style="font-size:.75em;color:#888;margin-top:8px">Si las 3 fallan se abre portal cautivo para configurar desde el movil</p>
</div>

<!-- MQTT -->
<div class="card">
  <h2>&#9729; MQTT (Servidor)</h2>
  <label>Host / IP del broker</label>
  <input id="mqtt_host" placeholder="192.168.1.100 o tu-vps.com">
  <div class="row">
    <div><label>Puerto</label><input id="mqtt_port" type="number" value="1883"></div>
    <div><label>Usuario</label><input id="mqtt_user" placeholder="(opcional)"></div>
  </div>
  <label>Password MQTT</label>
  <input id="mqtt_pass" type="password" placeholder="(opcional)">
</div>

<!-- Identidad -->
<div class="card">
  <h2>&#128204; Identidad</h2>
  <div class="row">
    <div><label>Device ID</label><input id="device_id" placeholder="cocina-1"></div>
    <div><label>Project ID</label><input id="project_id" placeholder="nonina"></div>
  </div>
</div>

<!-- Impresora -->
<div class="card">
  <h2>&#128424; Impresora BLE</h2>
  <label>Nombre Bluetooth</label>
  <input id="printer_name" placeholder="Pulsa Escanear para buscar">
  <label>MAC Address (se guarda automaticamente)</label>
  <input id="printer_addr" placeholder="Se rellena al escanear o conectar" readonly style="color:#888">
  <button class="btn btn-scan" onclick="scanBLE()">&#128269; Escanear impresoras</button>
  <div id="scan-results"></div>
  <label>Service UUID</label>
  <input id="printer_svc" placeholder="49535343-fe7d-4ae5-8fa9-9fafd205e455">
  <label>Characteristic UUID</label>
  <input id="printer_char" placeholder="49535343-8841-43f4-a8d4-ecbe34729bb3">
</div>

<!-- Acciones -->
<button class="btn btn-primary" onclick="saveConfig()">&#128190; Guardar y Reconectar</button>
<button class="btn btn-test" onclick="testPrint()">&#128424; Imprimir Test</button>
<button class="btn btn-reset" onclick="resetConfig()">Borrar toda la config</button>

<div id="msg" class="msg hidden"></div>

<script>
// Cargar config actual al abrir
fetch('/api/config').then(r=>r.json()).then(c=>{
  for(let i=1;i<=3;i++){
    document.getElementById('wifi_ssid'+i).value=c['wifi_ssid'+i]||'';
    document.getElementById('wifi_pass'+i).value=c['wifi_pass'+i]||'';
  }
  document.getElementById('mqtt_host').value=c.mqtt_host||'';
  document.getElementById('mqtt_port').value=c.mqtt_port||1883;
  document.getElementById('mqtt_user').value=c.mqtt_user||'';
  document.getElementById('mqtt_pass').value=c.mqtt_pass||'';
  document.getElementById('device_id').value=c.device_id||'';
  document.getElementById('project_id').value=c.project_id||'';
  document.getElementById('printer_name').value=c.printer_name||'';
  document.getElementById('printer_addr').value=c.printer_addr||'';
  document.getElementById('printer_svc').value=c.printer_svc||'';
  document.getElementById('printer_char').value=c.printer_char||'';
  document.getElementById('device-info').textContent=
    c.device_id+' / '+c.project_id+' — IP: '+c.ip+' — WiFi: '+(c.wifi_active||'?')+' — Up: '+c.uptime;
});

// Cargar status
fetch('/api/status').then(r=>r.json()).then(s=>{
  let h='';
  h+=badge('WiFi',s.wifi?'ok':'err');
  h+=badge('MQTT',s.mqtt?'ok':'err');
  h+=badge('Impresora',s.printer?'ok':'err');
  document.getElementById('status-badges').innerHTML=h;
});

function badge(t,cls){return '<span class="badge '+cls+'">'+t+'</span>'}

function showMsg(txt,ok){
  const m=document.getElementById('msg');
  m.textContent=txt;m.className='msg '+(ok?'ok':'err');m.classList.remove('hidden');
  setTimeout(()=>m.classList.add('hidden'),5000);
}

function saveConfig(){
  const body={
    wifi_ssid1:document.getElementById('wifi_ssid1').value,
    wifi_pass1:document.getElementById('wifi_pass1').value,
    wifi_ssid2:document.getElementById('wifi_ssid2').value,
    wifi_pass2:document.getElementById('wifi_pass2').value,
    wifi_ssid3:document.getElementById('wifi_ssid3').value,
    wifi_pass3:document.getElementById('wifi_pass3').value,
    mqtt_host:document.getElementById('mqtt_host').value,
    mqtt_port:parseInt(document.getElementById('mqtt_port').value)||1883,
    mqtt_user:document.getElementById('mqtt_user').value,
    mqtt_pass:document.getElementById('mqtt_pass').value,
    device_id:document.getElementById('device_id').value,
    project_id:document.getElementById('project_id').value,
    printer_name:document.getElementById('printer_name').value,
    printer_addr:document.getElementById('printer_addr').value,
    printer_svc:document.getElementById('printer_svc').value,
    printer_char:document.getElementById('printer_char').value
  };
  fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.json()).then(r=>{
      if(r.ok) showMsg('Guardado. Reconectando...',true);
      else showMsg('Error: '+r.error,false);
    }).catch(e=>showMsg('Error de red',false));
}

function scanBLE(){
  const div=document.getElementById('scan-results');
  div.innerHTML='<div style="padding:8px"><span class="spinner"></span> Escaneando BLE (10 seg)...</div>';
  fetch('/api/scan').then(r=>r.json()).then(devices=>{
    if(!devices.length){div.innerHTML='<div style="padding:8px;color:#888">No se encontraron impresoras</div>';return;}
    div.innerHTML=devices.map((d,i)=>
      '<div class="printer-opt" onclick="selectPrinter(this,\''+d.name+'\',\''+d.addr+'\')">'
      +'<span>'+d.name+'</span><span style="color:#888;font-size:.8em">'+d.addr+(d.rssi?' ('+d.rssi+'dBm)':'')+'</span></div>'
    ).join('');
  }).catch(e=>{div.innerHTML='<div style="color:#e94560">Error escaneando</div>';});
}

function scanWifi(){
  const div=document.getElementById('wifi-scan-results');
  div.innerHTML='<div style="padding:8px"><span class="spinner"></span> Escaneando redes WiFi...</div>';
  fetch('/api/wifi-scan').then(r=>r.json()).then(nets=>{
    if(!nets.length){div.innerHTML='<div style="padding:8px;color:#888">No se encontraron redes WiFi</div>';return;}
    nets.sort((a,b)=>b.rssi-a.rssi);
    div.innerHTML=nets.map(n=>{
      let cls=n.configured?'wifi-net configured':'wifi-net';
      let signal=n.rssi>-50?'Excelente':n.rssi>-60?'Buena':n.rssi>-70?'Normal':'Debil';
      let tag=n.configured?'<span class="wifi-tag">Red '+n.configured+'</span>':'';
      let lock=n.open?'':'&#128274; ';
      return '<div class="'+cls+'" onclick="selectWifi(\''+n.ssid.replace(/'/g,"\\'")+'\')">'
        +'<span>'+lock+n.ssid+tag+'</span>'
        +'<span class="wifi-signal">'+n.rssi+'dBm ('+signal+')</span></div>';
    }).join('');
  }).catch(e=>{div.innerHTML='<div style="color:#e94560">Error escaneando</div>';});
}

function selectWifi(ssid){
  for(let i=1;i<=3;i++){
    if(!document.getElementById('wifi_ssid'+i).value){
      document.getElementById('wifi_ssid'+i).value=ssid;
      document.getElementById('wifi_pass'+i).focus();
      showMsg('SSID copiado a Red '+i+'. Introduce la password.',true);
      return;
    }
  }
  document.getElementById('wifi_ssid1').value=ssid;
  document.getElementById('wifi_pass1').focus();
  showMsg('SSID copiado a Red 1 (todas estaban ocupadas)',true);
}

function selectPrinter(el,name,addr){
  document.querySelectorAll('.printer-opt').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('printer_name').value=name;
  document.getElementById('printer_addr').value=addr;
}

function testPrint(){
  fetch('/api/test-print',{method:'POST'}).then(r=>r.json()).then(r=>{
    if(r.ok) showMsg('Test enviado a la impresora',true);
    else showMsg('Error: '+r.error,false);
  }).catch(e=>showMsg('Error de red',false));
}

function resetConfig(){
  if(!confirm('Borrar TODA la configuracion? El ESP32 se reiniciara.')) return;
  fetch('/api/reset',{method:'POST'}).then(r=>r.json()).then(r=>{
    showMsg('Config borrada. Reiniciando...',true);
  });
}
</script>
</body>
</html>
)rawliteral";

#endif // PORTAL_H
