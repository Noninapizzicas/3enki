#ifndef PORTAL_H
#define PORTAL_H

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enki Print Proxy</title>
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
input:focus,select:focus{outline:none;border-color:#e94560}
.row{display:flex;gap:8px}
.row>*{flex:1}
.btn{display:block;width:100%;padding:12px;border:none;border-radius:8px;font-size:1em;cursor:pointer;margin-top:12px;font-weight:600}
.btn-primary{background:#e94560;color:#fff}
.btn-scan{background:#0f3460;color:#e94560;border:1px solid #e94560}
.btn-wifi{background:#0f3460;color:#52b788;border:1px solid #52b788;margin-top:8px}
.btn-danger{background:#2d1b1b;color:#e94560;border:1px solid #e94560;margin-top:16px}
.sbar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.b{padding:4px 10px;border-radius:20px;font-size:.75em;font-weight:600}
.bg{background:#1b4332;color:#52b788}
.br{background:#2d1b1b;color:#e94560}
.bb{background:#1b2d4b;color:#5b9bd5}
.di{font-size:.75em;color:#666;margin-bottom:8px}
.lst{max-height:200px;overflow-y:auto;margin-top:8px}
.opt{padding:8px;background:#0f3460;border:1px solid #1a4080;border-radius:6px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;font-size:.85em}
.opt:hover,.opt.sel{border-color:#e94560;background:#1a1a3e}
.msg{padding:10px;border-radius:8px;margin-top:8px;font-size:.9em;display:none}
.mi{font-size:.8em;color:#e94560;margin-top:4px}
</style>
</head>
<body>
<h1>Enki Print Proxy</h1>
<p class="sub">v3.4.0</p>
<div class="di" id="di"></div>
<div class="sbar" id="sb"></div>
<div id="msg" class="msg"></div>

<div class="card">
<h2>WiFi</h2>
<button class="btn btn-wifi" onclick="wScan()">Escanear redes WiFi</button>
<div id="wl" class="lst"></div>
<label>Red 1 (principal)</label>
<div class="row"><input id="ws1" placeholder="SSID"><input id="wp1" type="password" placeholder="Password"></div>
<label>Red 2 (backup)</label>
<div class="row"><input id="ws2" placeholder="SSID"><input id="wp2" type="password" placeholder="Password"></div>
<label>Red 3 (backup)</label>
<div class="row"><input id="ws3" placeholder="SSID"><input id="wp3" type="password" placeholder="Password"></div>
</div>

<div class="card">
<h2>MQTT</h2>
<label>Host</label><input id="mh" placeholder="mqtt.ejemplo.com">
<label>Puerto</label><input id="mp" type="number" value="1883">
<label>Usuario</label><input id="mu" placeholder="(opcional)">
<label>Password</label><input id="mw" type="password" placeholder="(opcional)">
</div>

<div class="card">
<h2>Identidad</h2>
<label>Device ID</label><input id="did" placeholder="cocina-1">
<label>Project ID</label><input id="pid" placeholder="nonina">
</div>

<div class="card">
<h2>Impresora</h2>
<label>Modo Bluetooth</label>
<select id="btm" onchange="tgM()">
<option value="ble">BLE (Low Energy)</option>
<option value="spp">SPP (Clasico)</option>
</select>
<p class="mi" id="mi"></p>
<div id="bf">
<button class="btn btn-scan" onclick="bScan()">Escanear BLE</button>
<div id="pl" class="lst"></div>
</div>
<label>Nombre</label><input id="pn" placeholder="BlueTooth Printer">
<label>MAC</label><input id="pa" placeholder="AA:BB:CC:DD:EE:FF">
<div id="bu">
<label>Service UUID</label><input id="ps" value="49535343-fe7d-4ae5-8fa9-9fafd205e455">
<label>Char UUID</label><input id="pc" value="49535343-8841-43f4-a8d4-ecbe34729bb3">
</div>
<button class="btn btn-scan" onclick="tPrint()">Test Print</button>
</div>

<button class="btn btn-primary" onclick="save()">Guardar todo</button>
<button class="btn btn-danger" onclick="reset()">Reset de fabrica</button>

<script>
var T,oM='ble';
function sm(t,ok){var m=document.getElementById('msg');m.textContent=t;m.style.display='block';m.style.background=ok?'#1b4332':'#2d1b1b';m.style.color=ok?'#52b788':'#e94560';clearTimeout(T);T=setTimeout(function(){m.style.display='none'},4000)}
function tgM(){var v=document.getElementById('btm').value,ble=v==='ble',mac=document.getElementById('pa').value;document.getElementById('bf').style.display=ble?'':'none';document.getElementById('bu').style.display=ble?'':'none';var t='';if(v==='spp'&&!mac)t='SPP necesita MAC. Escanea primero en modo BLE';else if(v!==oM)t='Cambiar modo reiniciara el ESP32';else t=v==='spp'?'Conexion directa por MAC':'Scan + GATT service';document.getElementById('mi').textContent=t}
function lc(){
fetch('/api/config').then(function(r){return r.json()}).then(function(c){
var m={device_id:'did',project_id:'pid',mqtt_host:'mh',mqtt_port:'mp',mqtt_user:'mu',mqtt_pass:'mw',wifi_ssid1:'ws1',wifi_pass1:'wp1',wifi_ssid2:'ws2',wifi_pass2:'wp2',wifi_ssid3:'ws3',wifi_pass3:'wp3'};
for(var k in m){var el=document.getElementById(m[k]);if(el&&c[k]!==undefined)el.value=c[k]}
document.getElementById('di').textContent='IP: '+c.ip+' | Uptime: '+c.uptime+(c.portal_mode?' | PORTAL':'')});
fetch('/api/printer').then(function(r){return r.json()}).then(function(c){
if(c.printer_name)document.getElementById('pn').value=c.printer_name;
if(c.printer_addr)document.getElementById('pa').value=c.printer_addr;
if(c.printer_svc)document.getElementById('ps').value=c.printer_svc;
if(c.printer_char)document.getElementById('pc').value=c.printer_char;
if(c.bt_mode){document.getElementById('btm').value=c.bt_mode;oM=c.bt_mode;tgM()}
}).catch(function(){})}
function ls(){fetch('/api/status').then(function(r){return r.json()}).then(function(s){
var h='<span class="b '+(s.wifi?'bg':'br')+'">WiFi</span><span class="b '+(s.mqtt?'bg':'br')+'">MQTT</span><span class="b '+(s.printer?'bg':'br')+'">Printer</span>';
if(s.bt_mode)h+='<span class="b bb">'+s.bt_mode.toUpperCase()+'</span>';
document.getElementById('sb').innerHTML=h})}
function save(){
var b={device_id:document.getElementById('did').value,project_id:document.getElementById('pid').value,mqtt_host:document.getElementById('mh').value,mqtt_port:parseInt(document.getElementById('mp').value)||1883,mqtt_user:document.getElementById('mu').value,mqtt_pass:document.getElementById('mw').value};
for(var i=1;i<=3;i++){b['wifi_ssid'+i]=document.getElementById('ws'+i).value;b['wifi_pass'+i]=document.getElementById('wp'+i).value}
fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()}).then(function(r){
if(!r.ok)throw new Error(r.error||'Error');
var d={printer_name:document.getElementById('pn').value,printer_addr:document.getElementById('pa').value,printer_svc:document.getElementById('ps').value,printer_char:document.getElementById('pc').value,bt_mode:document.getElementById('btm').value};
if(d.bt_mode==='spp'&&!d.printer_addr){sm('SPP necesita MAC. Escanea primero en modo BLE',false);return}
return fetch('/api/printer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json()})
}).then(function(r){if(r.restart){sm('Guardado. Reiniciando (cambio modo BT)...',true);return}sm('Guardado OK',true);setTimeout(function(){lc();ls()},2000)}).catch(function(e){sm('Error: '+e.message,false)})}
function bScan(){sm('Escaneando BLE (~10s)...',true);fetch('/api/scan').then(function(r){return r.json()}).then(function(d){var h='';d.forEach(function(v){h+='<div class="opt" onclick="sp(this,\''+v.name+'\',\''+v.addr+'\')"><span>'+v.name+'</span><span>'+v.rssi+'dBm</span></div>'});document.getElementById('pl').innerHTML=h||'<div style="color:#888;padding:8px">Nada</div>';sm(d.length+' encontrados',true)}).catch(function(){sm('Error scan',false)})}
function wScan(){sm('Escaneando WiFi...',true);fetch('/api/wifi-scan').then(function(r){return r.json()}).then(function(n){var h='';n.forEach(function(v){h+='<div class="opt" onclick="sw(\''+v.ssid+'\')"><span>'+v.ssid+'</span><span>'+v.rssi+'dBm</span></div>'});document.getElementById('wl').innerHTML=h||'<div style="color:#888;padding:8px">Nada</div>';sm(n.length+' redes',true)}).catch(function(){sm('Error',false)})}
function sw(s){for(var i=1;i<=3;i++){var el=document.getElementById('ws'+i);if(!el.value||el.value===s){el.value=s;document.getElementById('wp'+i).focus();return}}document.getElementById('ws1').value=s;document.getElementById('wp1').focus()}
function sp(el,n,a){document.querySelectorAll('.opt').forEach(function(e){e.classList.remove('sel')});el.classList.add('sel');document.getElementById('pn').value=n;document.getElementById('pa').value=a;tgM()}
function tPrint(){sm('Enviando...',true);fetch('/api/test-print',{method:'POST'}).then(function(r){return r.json()}).then(function(r){r.ok?sm('Test OK',true):sm(r.error,false)}).catch(function(){sm('Error red',false)})}
function reset(){if(!confirm('Borrar TODO? Se reiniciara.'))return;fetch('/api/reset',{method:'POST'}).then(function(){sm('Reiniciando...',true)})}
lc();ls();setInterval(ls,10000);
</script>
</body>
</html>
)rawliteral";

#endif // PORTAL_H
