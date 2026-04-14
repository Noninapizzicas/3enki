#ifndef PORTAL_H
#define PORTAL_H

/**
 * Portal web genérico — BASE Enki
 *
 * Cada driver puede sobreescribir este archivo poniendo su propio portal.h
 * en su directorio src/. PlatformIO prioriza los headers del proyecto.
 *
 * Este portal genérico solo muestra: WiFi, MQTT, identidad, status.
 * Los drivers añaden sus secciones específicas via logic_portal_status().
 */

#ifndef DRIVER_TYPE
#define DRIVER_TYPE "generic"
#endif

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.0.0"
#endif

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enki Device</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:16px;max-width:480px;margin:0 auto}
h1{font-size:1.3em;color:#e94560;margin-bottom:4px}
.sub{font-size:.8em;color:#888;margin-bottom:16px}
.card{background:#16213e;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #0f3460}
.card h2{font-size:1em;color:#e94560;margin-bottom:12px}
label{display:block;font-size:.85em;color:#aaa;margin-bottom:4px;margin-top:10px}
label:first-of-type{margin-top:0}
input,select{width:100%;padding:10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;color:#fff;font-size:.95em}
button{width:100%;padding:12px;margin-top:12px;background:#e94560;color:#fff;border:none;border-radius:8px;font-size:1em;cursor:pointer}
button:active{background:#c73853}
.status{display:flex;gap:8px;flex-wrap:wrap}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.on{background:#4caf50}.off{background:#e94560}
#msg{margin-top:8px;padding:8px;border-radius:8px;font-size:.85em;display:none}
.ok{background:#1b5e20;display:block}.err{background:#b71c1c;display:block}
</style>
</head>
<body>
<h1>Enki Device</h1>
<p class="sub">Portal de configuracion</p>

<div class="card">
<h2>Estado</h2>
<div class="status" id="st">Cargando...</div>
</div>

<div class="card">
<h2>WiFi</h2>
<label>Red 1</label><input id="s1"><label>Pass 1</label><input id="p1" type="password">
<label>Red 2</label><input id="s2"><label>Pass 2</label><input id="p2" type="password">
<label>Red 3</label><input id="s3"><label>Pass 3</label><input id="p3" type="password">
<button onclick="scanWifi()">Escanear WiFi</button>
<div id="scan"></div>
</div>

<div class="card">
<h2>Identidad</h2>
<label>Device ID</label><input id="did">
<label>Project ID</label><input id="pid">
</div>

<div class="card">
<h2>MQTT</h2>
<label>Host</label><input id="mh">
<label>Puerto</label><input id="mp" type="number">
<label>Usuario</label><input id="mu">
<label>Password</label><input id="mw" type="password">
</div>

<button onclick="save()">Guardar</button>
<button onclick="if(confirm('Reset total?'))fetch('/api/reset',{method:'POST'})" style="background:#333;margin-top:8px">Reset</button>
<div id="msg"></div>

<script>
async function load(){try{const r=await fetch('/api/config');const d=await r.json();
document.getElementById('s1').value=d.wifi_ssid1||'';document.getElementById('p1').value=d.wifi_pass1||'';
document.getElementById('s2').value=d.wifi_ssid2||'';document.getElementById('p2').value=d.wifi_pass2||'';
document.getElementById('s3').value=d.wifi_ssid3||'';document.getElementById('p3').value=d.wifi_pass3||'';
document.getElementById('did').value=d.device_id||'';document.getElementById('pid').value=d.project_id||'';
document.getElementById('mh').value=d.mqtt_host||'';document.getElementById('mp').value=d.mqtt_port||1883;
document.getElementById('mu').value=d.mqtt_user||'';document.getElementById('mw').value=d.mqtt_pass||'';
}catch(e){msg('Error cargando config','err')}}
async function status(){try{const r=await fetch('/api/status');const d=await r.json();
let h='<span><span class="dot '+(d.wifi?'on':'off')+'"></span> WiFi</span>';
h+='<span><span class="dot '+(d.mqtt?'on':'off')+'"></span> MQTT</span>';
document.getElementById('st').innerHTML=h}catch(e){}}
async function save(){const b={device_id:document.getElementById('did').value,project_id:document.getElementById('pid').value,
wifi_ssid1:document.getElementById('s1').value,wifi_pass1:document.getElementById('p1').value,
wifi_ssid2:document.getElementById('s2').value,wifi_pass2:document.getElementById('p2').value,
wifi_ssid3:document.getElementById('s3').value,wifi_pass3:document.getElementById('p3').value,
mqtt_host:document.getElementById('mh').value,mqtt_port:parseInt(document.getElementById('mp').value)||1883,
mqtt_user:document.getElementById('mu').value,mqtt_pass:document.getElementById('mw').value};
try{const r=await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const d=await r.json();msg(d.msg||'Guardado','ok')}catch(e){msg('Error: '+e,'err')}}
async function scanWifi(){document.getElementById('scan').innerHTML='Escaneando...';
try{const r=await fetch('/api/wifi-scan');const d=await r.json();
let h='<div style="margin-top:8px">';d.forEach(n=>{h+='<div style="padding:4px;cursor:pointer;color:#4fc3f7" onclick="document.getElementById(\'s1\').value=\''+n.ssid+'\'">'+n.ssid+' ('+n.rssi+'dBm)'+(n.open?' abierta':'')+'</div>'});
h+='</div>';document.getElementById('scan').innerHTML=h}catch(e){document.getElementById('scan').innerHTML='Error'}}
function msg(t,c){const m=document.getElementById('msg');m.textContent=t;m.className=c;setTimeout(()=>m.style.display='none',5000)}
load();status();setInterval(status,5000);
</script>
</body>
</html>
)rawliteral";

#endif // PORTAL_H
