#ifndef PORTAL_H
#define PORTAL_H

#include "config.h"

// ============================================
// Config en RAM — cargada de NVS al boot
// ============================================

struct WifiEntry {
  char ssid[33];
  char pass[65];
};

struct NodeConfig {
  char deviceId[32];
  char projectId[32];
  WifiEntry wifi[WIFI_MAX_NETWORKS];
  int8_t wifiActive;
  char mqttHost[64];
  uint16_t mqttPort;
  char mqttUser[32];
  char mqttPass[64];
  uint16_t httpPort;
  bool configured;
};

extern NodeConfig cfg;

// ============================================
// HTML del portal cautivo
// ============================================

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enki Node</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:16px;max-width:480px;margin:0 auto}
h1{font-size:1.3em;color:#f59e0b;margin-bottom:4px}
.sub{font-size:.8em;color:#888;margin-bottom:16px}
.card{background:#16213e;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #0f3460}
.card h2{font-size:1em;color:#f59e0b;margin-bottom:12px}
label{display:block;font-size:.85em;color:#aaa;margin-bottom:4px;margin-top:10px}
label:first-of-type{margin-top:0}
input{width:100%;padding:10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;color:#fff;font-size:.95em}
input:focus{outline:none;border-color:#f59e0b}
.row{display:flex;gap:8px}
.row>*{flex:1}
.btn{display:block;width:100%;padding:12px;border:none;border-radius:8px;font-size:1em;cursor:pointer;margin-top:12px;font-weight:600}
.btn-primary{background:#f59e0b;color:#000}
.btn-scan{background:#0f3460;color:#22c55e;border:1px solid #22c55e;margin-top:8px}
.btn-reset{background:transparent;color:#ef4444;border:1px solid #333;font-size:.85em}
.status{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.badge{padding:4px 10px;border-radius:12px;font-size:.75em;font-weight:600}
.badge.ok{background:#1b4332;color:#22c55e}
.badge.err{background:#3d0000;color:#ef4444}
.wifi-net{padding:8px 10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;margin-top:6px;cursor:pointer;display:flex;justify-content:space-between}
.wifi-net:hover{border-color:#22c55e}
.wifi-signal{font-size:.75em;color:#888}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #555;border-top:2px solid #f59e0b;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.msg{padding:10px;border-radius:8px;margin-top:8px;font-size:.85em}
.msg.ok{background:#1b4332;color:#22c55e}
.msg.err{background:#3d0000;color:#ef4444}
.hidden{display:none}
.info{font-size:.7em;color:#666;margin-top:6px}
</style>
</head>
<body>

<h1>Enki Node</h1>
<p class="sub" id="info">Cargando...</p>
<div class="status" id="badges"></div>

<div class="card">
  <h2>WiFi</h2>
  <label>Red principal</label>
  <div class="row">
    <div><input id="ws1" placeholder="SSID"></div>
    <div><input id="wp1" type="password" placeholder="Password"></div>
  </div>
  <label>Red de respaldo</label>
  <div class="row">
    <div><input id="ws2" placeholder="SSID"></div>
    <div><input id="wp2" type="password" placeholder="Password"></div>
  </div>
  <button class="btn btn-scan" onclick="scanWifi()">Escanear redes</button>
  <div id="wsr"></div>
</div>

<div class="card">
  <h2>Servidor Enki</h2>
  <label>Host / IP</label>
  <input id="mh" placeholder="192.168.1.100">
  <div class="row">
    <div><label>Puerto MQTT</label><input id="mp" type="number" value="1883"></div>
    <div><label>Puerto HTTP</label><input id="hp" type="number" value="3000"></div>
  </div>
  <div class="row">
    <div><label>Usuario</label><input id="mu" placeholder="(opcional)"></div>
    <div><label>Password</label><input id="mw" type="password" placeholder="(opcional)"></div>
  </div>
</div>

<div class="card">
  <h2>Identidad</h2>
  <div class="row">
    <div><label>Device ID</label><input id="di" placeholder="(auto desde MAC)"></div>
    <div><label>Project ID</label><input id="pi" placeholder="nonina"></div>
  </div>
  <p class="info">Device ID se genera automaticamente si se deja vacio</p>
</div>

<button class="btn btn-primary" onclick="save()">Guardar y Conectar</button>
<button class="btn btn-reset" onclick="reset()">Borrar config</button>
<div id="msg" class="msg hidden"></div>

<script>
const $=id=>document.getElementById(id);
function badge(t,ok){return '<span class="badge '+(ok?'ok':'err')+'">'+t+'</span>'}
function showMsg(t,ok){const m=$('msg');m.textContent=t;m.className='msg '+(ok?'ok':'err');setTimeout(()=>m.classList.add('hidden'),5000)}

fetch('/api/config').then(r=>r.json()).then(c=>{
  $('ws1').value=c.wifi_ssid1||'';$('wp1').value=c.wifi_pass1||'';
  $('ws2').value=c.wifi_ssid2||'';$('wp2').value=c.wifi_pass2||'';
  $('mh').value=c.mqtt_host||'';$('mp').value=c.mqtt_port||1883;
  $('hp').value=c.http_port||3000;$('mu').value=c.mqtt_user||'';
  $('mw').value=c.mqtt_pass||'';$('di').value=c.device_id||'';
  $('pi').value=c.project_id||'';
  $('info').textContent=c.device_id+' — '+c.ip+' — v'+c.firmware;
});
fetch('/api/status').then(r=>r.json()).then(s=>{
  $('badges').innerHTML=badge('WiFi',s.wifi)+badge('MQTT',s.mqtt)+badge('Enki',s.enki);
});

function save(){
  fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    wifi_ssid1:$('ws1').value,wifi_pass1:$('wp1').value,
    wifi_ssid2:$('ws2').value,wifi_pass2:$('wp2').value,
    mqtt_host:$('mh').value,mqtt_port:+$('mp').value||1883,
    http_port:+$('hp').value||3000,mqtt_user:$('mu').value,
    mqtt_pass:$('mw').value,device_id:$('di').value,project_id:$('pi').value
  })}).then(r=>r.json()).then(r=>showMsg(r.msg||'OK',r.ok)).catch(()=>showMsg('Error',0));
}

function scanWifi(){
  $('wsr').innerHTML='<div style="padding:8px"><span class="spinner"></span> Escaneando...</div>';
  fetch('/api/wifi-scan').then(r=>r.json()).then(nets=>{
    if(!nets.length){$('wsr').innerHTML='<div style="padding:8px;color:#888">Sin redes</div>';return;}
    nets.sort((a,b)=>b.rssi-a.rssi);
    $('wsr').innerHTML=nets.map(n=>'<div class="wifi-net" onclick="pickWifi(\''+n.ssid.replace(/'/g,"\\'")+'\')">'
      +'<span>'+(n.open?'':'&#128274; ')+n.ssid+'</span><span class="wifi-signal">'+n.rssi+'dBm</span></div>').join('');
  }).catch(()=>{$('wsr').innerHTML='<div style="color:#ef4444">Error</div>';});
}

function pickWifi(ssid){
  if(!$('ws1').value){$('ws1').value=ssid;$('wp1').focus();showMsg('Red 1: '+ssid,1);return;}
  if(!$('ws2').value){$('ws2').value=ssid;$('wp2').focus();showMsg('Red 2: '+ssid,1);return;}
  $('ws1').value=ssid;$('wp1').focus();showMsg('Red 1: '+ssid,1);
}

function reset(){
  if(!confirm('Borrar TODO? Se reiniciara.'))return;
  fetch('/api/reset',{method:'POST'}).then(()=>showMsg('Reiniciando...',1));
}
</script>
</body>
</html>
)rawliteral";

#endif // PORTAL_H
