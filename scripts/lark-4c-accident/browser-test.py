"""Browser integration test; requires a server on localhost:5173 and system Chrome."""
import base64, json, os, socket, struct, subprocess, tempfile, time, urllib.request
from pathlib import Path

class WS:
 def __init__(self,url):
  from urllib.parse import urlparse
  u=urlparse(url);self.s=socket.create_connection((u.hostname,u.port),10);self.s.settimeout(65);self.buf=b'';self.id=0;self.events=[];self.user_gesture=False
  key=base64.b64encode(os.urandom(16)).decode()
  self.s.sendall(f'GET {u.path} HTTP/1.1\r\nHost: {u.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
  while b'\r\n\r\n' not in self.buf:self.buf+=self.s.recv(4096)
  head,self.buf=self.buf.split(b'\r\n\r\n',1)
  assert b'101' in head,head
 def read(self,n):
  while len(self.buf)<n:
   chunk=self.s.recv(max(4096,n-len(self.buf)))
   if not chunk:raise RuntimeError('WebSocket closed')
   self.buf+=chunk
  out,self.buf=self.buf[:n],self.buf[n:];return out
 def send(self,method,params={}):
  self.id+=1;pid=self.id;payload=json.dumps({'id':pid,'method':method,'params':params}).encode();mask=os.urandom(4);n=len(payload)
  h=bytes([0x81,0x80|n]) if n<126 else bytes([0x81,0xfe])+struct.pack('!H',n) if n<65536 else bytes([0x81,0xff])+struct.pack('!Q',n)
  self.s.sendall(h+mask+bytes(b^mask[i%4] for i,b in enumerate(payload)))
  chunks=b''
  while True:
   a,b=self.read(2);length=b&127
   if length==126:length=struct.unpack('!H',self.read(2))[0]
   if length==127:length=struct.unpack('!Q',self.read(8))[0]
   mask2=self.read(4) if b&128 else None;body=self.read(length)
   if mask2:body=bytes(v^mask2[i%4] for i,v in enumerate(body))
   if a&15==8:raise RuntimeError('WebSocket closed')
   if a&15==9:continue
   chunks+=body
   if not a&128:continue
   message=json.loads(chunks);chunks=b''
   if message.get('id')==pid:
    if 'error'in message:raise RuntimeError(message['error'])
    return message.get('result')
   self.events.append(message)
 def evaluate(self,js):
  r=self.send('Runtime.evaluate',{'expression':js,'returnByValue':True,'awaitPromise':True,'userGesture':self.user_gesture})
  if 'exceptionDetails'in r:raise RuntimeError(r['exceptionDetails'])
  return r.get('result',{}).get('value')

profile=tempfile.mkdtemp(prefix='lark-native-story-');port=9340
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
log=open('/tmp/lark-native-story-chrome.log','w')
p=subprocess.Popen([chrome,'--headless=new',f'--remote-debugging-port={port}','--remote-allow-origins=*',f'--user-data-dir={profile}','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-watchdog','--no-first-run','--no-default-browser-check','about:blank'],stdout=log,stderr=log)
try:
 for _ in range(100):
  try:tabs=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list'));break
  except Exception:time.sleep(.15)
 ws=WS(next(t['webSocketDebuggerUrl'] for t in tabs if t['type']=='page'))
 ws.send('Page.enable');ws.send('Runtime.enable');ws.send('DOM.enable');ws.send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
 ws.send('Page.addScriptToEvaluateOnNewDocument',{'source':"window.__audioCreated=0;for(const k of ['Audio','AudioContext','webkitAudioContext']){const C=window[k];if(C)window[k]=new Proxy(C,{construct(T,args){window.__audioCreated++;return Reflect.construct(T,args)}})}"})
 ws.send('Page.navigate',{'url':'http://localhost:5173/?gl&debug&scene=story:lark-4c-accident'});time.sleep(.5)
 result=ws.evaluate("new Promise(async resolve=>{for(let n=0;n<450;n++){const s=window.__3draft?.story();if(s?.bones)return resolve({ready:true,title:s.title,channels:s.animationChannels});await new Promise(r=>setTimeout(r,100))}resolve({timeout:true,notes:document.body.innerText.slice(-1500)})})")
 print('READY',result,flush=True);assert result.get('ready'),result;assert result['channels']==47
 def seek(ms):
  return ws.evaluate(f"document.getElementById('stTime').value={ms};document.getElementById('stTime').dispatchEvent(new Event('input'));(()=>{{const s=__3draft.story();return{{t:s.t,objects:s.objects,channels:s.animationChannels}}}})()")
 for t in [3000,12000,22000,32000,40000,49000,54000,60000,66000]:
  state=seek(t);assert state['t']==t,state;time.sleep(.2)
  shot=ws.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False});Path(f'/tmp/lark-native-{t//1000}.png').write_bytes(base64.b64decode(shot['data']))
  print('SHOT',state,flush=True)
 sky=ws.evaluate('__3draft.sky()');assert sky['traced']==1 and sky['cloud']==2048,sky
 alpha=ws.evaluate("(async()=>{const url=await __3draft.grab(),img=await createImageBitmap(await(await fetch(url)).blob()),c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const p=x.getImageData(0,0,c.width,c.height).data;let clear=0,solid=0;for(let i=3;i<p.length;i+=4){if(p[i]===0)clear++;if(p[i]===255)solid++;}return{clear,solid}})()")
 assert alpha['clear']>0 and alpha['solid']>0,alpha
 assert ws.evaluate("__3draft.objects().filter(o=>/Sagittarius/.test(o.name)).length")==1
 assert not ws.evaluate("__3draft.objects().some(o=>/planet|exoplanet|Mercury|Neptune|Earth/i.test(o.name))")
 before=ws.evaluate('__3draft.story().bones');seek(12000);seek(66000);assert before==ws.evaluate('__3draft.story().bones'),'Reverse/forward seek changed animation'
 seek(59000);assert ws.evaluate("__3draft.objects().some(o=>o.name==='betterman/body')")
 seek(61000);assert not ws.evaluate("__3draft.objects().some(o=>o.name==='betterman/body')"),'Captured cockpit retained its pilot'
 seek(59000);assert ws.evaluate("__3draft.objects().some(o=>o.name==='betterman/body')"),'Rewinding did not restore the captured pilot'
 seek(0);ws.evaluate("document.getElementById('stSpeed').value='8';document.getElementById('stPlay').click()")
 advanced=ws.evaluate("new Promise(async resolve=>{for(let n=0;n<100;n++){if(__3draft.story().t>0)return resolve(true);await new Promise(r=>setTimeout(r,100))}resolve(false)})")
 assert advanced,'Playback did not advance'
 t=ws.evaluate("document.getElementById('stPlay').click();__3draft.story().t")
 time.sleep(.25);assert t==ws.evaluate('__3draft.story().t'),'Paused playhead advanced'
 seek(71950);ws.evaluate("document.getElementById('stPlay').click()")
 ended=ws.evaluate("new Promise(async resolve=>{for(let n=0;n<100;n++){const s=__3draft.story();if(!s.playing&&s.t===72000)return resolve(true);await new Promise(r=>setTimeout(r,100))}resolve(false)})")
 assert ended,'Story did not stop at its final frame'
 assert ws.evaluate('window.__audioCreated')==0,'Silent story created audio'
 seek(12000);eye=ws.evaluate('__3draft.state().eye');ws.evaluate("document.getElementById('stCam').click()");seek(22000)
 assert eye==ws.evaluate('__3draft.state().eye'),'Camera-off seek moved the view'
 ws.evaluate("document.getElementById('stCam').click()")
 # Native leave-story keeps the deformed vessel, seated pilot and Deep Sky instance.
 seek(40000);ws.evaluate("document.getElementById('stExit').click()")
 result=ws.evaluate("new Promise(async resolve=>{for(let n=0;n<100;n++){if(!__3draft.story()&&__3draft.objects().length===563)return resolve(true);await new Promise(r=>setTimeout(r,100))}resolve(false)})")
 assert result
 assert ws.evaluate("__3draft.objects().some(o=>o.name==='betterman/body')")
 # Actual f-up file upload, without a special movie page or an authoring script.
 node=ws.send('DOM.getDocument',{'depth':-1})['root']['nodeId']
 file_node=ws.send('DOM.querySelector',{'nodeId':node,'selector':'#sceneFile'})['nodeId']
 ws.send('DOM.setFileInputFiles',{'nodeId':file_node,'files':[str(Path('models/lark-4c-accident.build.json').resolve())]})
 result=ws.evaluate("new Promise(async resolve=>{for(let n=0;n<150;n++){if(__3draft.story()?.bones)return resolve(true);await new Promise(r=>setTimeout(r,100))}resolve(false)})")
 assert result,'Native file upload did not open the story'
 assert ws.evaluate('window.__audioCreated')==0
 print('PASS: native story link, seven shots, Deep Sky tracer, compact background, debris capture and restoration, no planets/audio, pause, rewind, free camera, editable exit and f-up upload',flush=True)
finally:
 p.terminate()
 try:p.wait(timeout=8)
 except Exception:p.kill()
 import shutil
 shutil.rmtree(profile,ignore_errors=True)
