#ifndef PORTAL_H
#define PORTAL_H

// ============================================
// HTML del portal web (embebido en flash con PROGMEM)
// ============================================
// Este HTML es específico del driver Print Proxy.
// Cada driver puede tener su propio portal.h con su UI.
// ============================================

const char PORTAL_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enki Print Proxy</title>
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
.btn-danger{background:#2d1b1b;color:#e94560;border:1px solid #e94560;margin-top:16px}
.status-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.badge{padding:4px 10px;border-radius:20px;font-size:.75em;font-weight:600}
.badge-ok{background:#1b4332;color:#52b788}
.badge-err{background:#2d1b1b;color:#e94560}
.msg{padding:10px;border-radius:8px;margin-top:8px;font-size:.9em;display:none}
.msg-ok{background:#1b4332;color:#52b788;display:block}
.msg-err{background:#2d1b1b;color:#e94560;display:block}
.device-info{font-size:.75em;color:#666;margin-bottom:8px}
.printer-list{max-height:200px;overflow-y:auto;margin-top:8px}
.printer-opt{padding:8px;background:#0f3460;border:1px solid #1a4080;border-radius:6px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;font-size:.85em}
.printer-opt:hover,.printer-opt.selected{border-color:#e94560;background:#1a1a3e}
.wifi-list{max-height:200px;overflow-y:auto;margin-top:8px}
.wifi-opt{padding:8px;background:#0f3460;border:1px solid #1a4080;border-radius:6px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;font-size:.85em}
.wifi-opt:hover{border-color:#52b788;background:#1a1a3e}
.wifi-opt .configured{color:#52b788;font-size:.7em}
</style>
</head>
<body>
<h1>Enki Print Proxy</h1>
<p class="sub">BASE + LOGICA v3.0</p>
<div class="device-info" id="devInfo"></div>
<div class="status-bar" id="statusBar"></div>
<div id="msg" class="msg"></div>

<div class="card">
<h2>WiFi</h2>
<button class="btn btn-wifi-scan" onclick="wifiScan()">Escanear redes WiFi</button>
<div id="wifiList" class="wifi-list"></div>
<label>Red 1 (principal)</label>
<div class="row"><input id="wifi_ssid1" placeholder="SSID"><input id="wifi_pass1" type="password" placeholder="Password"></div>
<label>Red 2 (backup)</label>
<div class="row"><input id="wifi_ssid2" placeholder="SSID"><input id="wifi_pass2" type="password" placeholder="Password"></div>
<label>Red 3 (backup)</label>
<div class="row"><input id="wifi_ssid3" placeholder="SSID"><input id="wifi_pass3" type="password" placeholder="Password"></div>
</div>

<div class="card">
<h2>MQTT</h2>
<label>Host</label><input id="mqtt_host" placeholder="mqtt.ejemplo.com">
<label>Puerto</label><input id="mqtt_port" type="number" value="1883">
<label>Usuario</label><input id="mqtt_user" placeholder="(opcional)">
<label>Password</label><input id="mqtt_pass" type="password" placeholder="(opcional)">
</div>

<div class="card">
<h2>Identidad</h2>
<label>Device ID</label><input id="device_id" placeholder="cocina-1">
<label>Project ID</label><input id="project_id" placeholder="nonina">
</div>

<div class="card">
<h2>Impresora Bluetooth</h2>
<label>Modo Bluetooth</label>
<select id="bt_mode" style="width:100%;padding:10px;background:#0f3460;border:1px solid #1a4080;border-radius:8px;color:#fff;font-size:.95em">
<option value="ble">BLE — Bajo consumo (NimBLE)</option>
<option value="spp">SPP — Clasico, mas estable (Serial)</option>
</select>
<button class="btn btn-scan" onclick="bleScan()">Escanear impresoras BLE</button>
<div id="printerList" class="printer-list"></div>
<label>Nombre</label><input id="printer_name" placeholder="BlueTooth Printer">
<label>MAC (auto)</label><input id="printer_addr" placeholder="AA:BB:CC:DD:EE:FF" readonly>
<label>Service UUID (solo BLE)</label><input id="printer_svc" value="49535343-fe7d-4ae5-8fa9-9fafd205e455">
<label>Characteristic UUID (solo BLE)</label><input id="printer_char" value="49535343-8841-43f4-a8d4-ecbe34729bb3">
<button class="btn btn-scan" onclick="testPrint()">Test Print</button>
</div>

<button class="btn btn-primary" onclick="saveConfig()">Guardar todo</button>
<button class="btn btn-danger" onclick="resetConfig()">Reset de fabrica</button>

<script>
let refreshTimer;

function showMsg(text,ok){
  const m=document.getElementById('msg');
  m.textContent=text;
  m.className='msg '+(ok?'msg-ok':'msg-err');
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>{m.className='msg'},4000);
}

function loadConfig(){
  fetch('/api/config').then(r=>r.json()).then(c=>{
    ['device_id','project_id','mqtt_host','mqtt_port','mqtt_user','mqtt_pass',
     'wifi_ssid1','wifi_pass1','wifi_ssid2','wifi_pass2','wifi_ssid3','wifi_pass3'
    ].forEach(k=>{const el=document.getElementById(k);if(el&&c[k]!==undefined)el.value=c[k]});
    document.getElementById('devInfo').textContent=
      'IP: '+c.ip+' | Uptime: '+c.uptime+(c.portal_mode?' | MODO PORTAL':'');
  });
  // Cargar config del driver
  fetch('/api/printer').then(r=>r.json()).then(c=>{
    ['printer_name','printer_addr','printer_svc','printer_char'].forEach(k=>{
      const el=document.getElementById(k);if(el&&c[k]!==undefined)el.value=c[k]});
    if(c.bt_mode){document.getElementById('bt_mode').value=c.bt_mode}
  }).catch(()=>{});
}

function loadStatus(){
  fetch('/api/status').then(r=>r.json()).then(s=>{
    let h='';
    h+='<span class="badge '+(s.wifi?'badge-ok':'badge-err')+'">WiFi</span>';
    h+='<span class="badge '+(s.mqtt?'badge-ok':'badge-err')+'">MQTT</span>';
    h+='<span class="badge '+(s.printer?'badge-ok':'badge-err')+'">Printer</span>';
    if(s.bt_mode)h+='<span class="badge badge-ok">'+(s.bt_mode==='spp'?'SPP':'BLE')+'</span>';
    document.getElementById('statusBar').innerHTML=h;
  });
}

function saveConfig(){
  const body={};
  ['device_id','project_id','mqtt_host','mqtt_user','mqtt_pass',
   'wifi_ssid1','wifi_pass1','wifi_ssid2','wifi_pass2','wifi_ssid3','wifi_pass3'
  ].forEach(k=>{body[k]=document.getElementById(k).value});
  body.mqtt_port=parseInt(document.getElementById('mqtt_port').value)||1883;

  // Guardar config base
  fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  .then(r=>r.json()).then(r=>{
    if(r.ok){
      // Guardar config del driver
      const driverBody={
        printer_name:document.getElementById('printer_name').value,
        printer_addr:document.getElementById('printer_addr').value,
        printer_svc:document.getElementById('printer_svc').value,
        printer_char:document.getElementById('printer_char').value,
        bt_mode:document.getElementById('bt_mode').value
      };
      return fetch('/api/printer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(driverBody)}).then(r=>r.json());
    }
    throw new Error(r.error||'Error');
  }).then(r=>{
    showMsg('Configuracion guardada',true);
    setTimeout(()=>{loadConfig();loadStatus()},2000);
  }).catch(e=>showMsg('Error: '+e.message,false));
}

function bleScan(){
  showMsg('Escaneando BLE (~10s)...',true);
  fetch('/api/scan').then(r=>r.json()).then(devs=>{
    let h='';
    devs.forEach(d=>{
      h+='<div class="printer-opt" onclick="selectPrinter(this,\''+d.name+'\',\''+d.addr+'\')">'+
        '<span>'+d.name+'</span><span>'+d.rssi+' dBm</span></div>';
    });
    document.getElementById('printerList').innerHTML=h||'<div style="color:#888;padding:8px">Sin resultados</div>';
    showMsg(devs.length+' dispositivos BLE encontrados',true);
  }).catch(e=>showMsg('Error scan BLE',false));
}

function wifiScan(){
  showMsg('Escaneando WiFi...',true);
  fetch('/api/wifi-scan').then(r=>r.json()).then(nets=>{
    let h='';
    nets.forEach(n=>{
      let extra=n.configured?'<span class="configured">Red '+n.configured+'</span>':'';
      h+='<div class="wifi-opt" onclick="selectWifi(\''+n.ssid+'\')">'+
        '<span>'+n.ssid+(n.open?' (abierta)':'')+'</span>'+
        '<span>'+n.rssi+' dBm '+extra+'</span></div>';
    });
    document.getElementById('wifiList').innerHTML=h||'<div style="color:#888;padding:8px">Sin redes</div>';
    showMsg(nets.length+' redes WiFi encontradas',true);
  }).catch(e=>showMsg('Error scan WiFi',false));
}

function selectWifi(ssid){
  for(let i=1;i<=3;i++){
    const el=document.getElementById('wifi_ssid'+i);
    if(!el.value||el.value===ssid){el.value=ssid;document.getElementById('wifi_pass'+i).focus();return}
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

loadConfig();
loadStatus();
setInterval(loadStatus,10000);
</script>
</body>
</html>
)rawliteral";

#endif // PORTAL_H
