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

profile=tempfile.mkdtemp(prefix='spider-build-chrome-');port=9336
chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
log=open('/tmp/spider-build-chrome.log','w')
p=subprocess.Popen([chrome,'--headless=new',f'--remote-debugging-port={port}','--remote-allow-origins=*',f'--user-data-dir={profile}','--use-gl=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--no-default-browser-check','about:blank'],stdout=log,stderr=log)
try:
 for _ in range(100):
  try:
   tabs=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json/list'));break
  except Exception:time.sleep(.15)
 ws=WS(next(t['webSocketDebuggerUrl'] for t in tabs if t['type']=='page'))
 ws.send('Page.enable');ws.send('Runtime.enable')
 ws.send('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
 def load(query=''):
  ws.send('Page.navigate',{'url':'http://localhost:5173/models/lark-4-tutorial.html'+query})
  time.sleep(.6)
  result=ws.evaluate("new Promise(async resolve=>{for(let n=0;n<500;n++){if(window.tutorialReady)return resolve({ready:true,state:window.tutorialState});if(document.getElementById('error')?.textContent)return resolve({error:document.getElementById('error').textContent});await new Promise(r=>setTimeout(r,100))}resolve({timeout:true,href:location.href,readyState:document.readyState,scripts:[...document.scripts].map(s=>s.src)})})")
  if not result.get('ready'):print('DIAGNOSTICS',json.dumps(ws.events[-25:]),flush=True)
  assert result.get('ready'),result
  return result
 def click(id):return ws.evaluate(f"document.getElementById('{id}').click();window.tutorialState")
 def seek(t):return ws.evaluate(f"document.getElementById('timeline').value={t};document.getElementById('timeline').dispatchEvent(new Event('input'));window.tutorialState")
 def scene():return ws.evaluate("JSON.stringify(document.getElementById('viewer').contentWindow.rec.scene())")
 def eye():return ws.evaluate("document.getElementById('viewer').contentWindow.__3draft.state().eye")
 def close_enough(a,b):return all(abs(x-y)<1e-7 for x,y in zip(a,b))
 print('READY',load(),flush=True)
 assert click('next')['index']==1
 final=click('finish');assert final['index']==746 and final['objects']==635,final
 full=scene()
 assert click('previous')['index']==745
 assert click('next')['index']==746
 assert scene()==full,'Reverse replay changed geometry'
 assert click('interior')['objects']<635
 click('exterior');assert scene()==full
 assert click('hangar')['focusGroup']=='hangar'
 assert click('quarters')['focusGroup']=='quarters'
 click('exterior');assert scene()==full
 click('narration');assert scene()==full
 assert 'disabled' in ws.evaluate("document.getElementById('description').textContent")
 click('narration')
 positions=ws.evaluate("(async()=>{const d=await(await fetch('lark-4.build.json')).json();return d.tracks.construction.steps.filter(s=>s.changes.some(c=>c.type==='put'&&c.object.name==='hangar/cargo/crate')).map(s=>({timeMs:s.timeMs,centre:[0,1,2].map(k=>{const m=d.assets.meshes[s.changes.find(c=>c.type==='put'&&c.object.name==='hangar/cargo/crate').object.meshRef];return(Math.min(...m.positions.map(p=>p[k]))+Math.max(...m.positions.map(p=>p[k])))/2})}))})()")
 assert len(positions)==4
 for step in positions:
  seek(step['timeMs'])
  centre=ws.evaluate("(()=>{const o=document.getElementById('viewer').contentWindow.__3draft.objects().find(o=>o.name==='hangar/cargo/crate');return o.lo.map((v,i)=>(v+o.hi[i])/2)})()")
  assert close_enough(centre,step['centre']),(centre,step)
 print('LARK: exact replay, reverse, cutaway, room views, narration isolation and cargo lift/travel/lower passed',flush=True)
 click('finish');time.sleep(.4)
 shot=ws.send('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
 Path('/tmp/spider-build-v2-player.png').write_bytes(base64.b64decode(shot['data']))
 # Legacy loading uses the same normalized v2 runtime.
 load('?file=lark-4-tutorial.json');assert click('finish')['objects']==635
 assert scene()==full
 print('LEGACY v1 compatibility passed',flush=True)
 load('?file=spider-build-example.build.json')
 assert ws.evaluate("document.getElementById('hangar').hidden")
 seek(1500);geometry=scene();first_eye=eye()
 seek(2500);assert scene()==geometry;assert not close_enough(first_eye,eye()),'Camera did not move independently'
 click('recordedCamera')
 ws.evaluate("document.getElementById('viewer').contentWindow.__3draft.eye(11,12,13,0,0)")
 seek(2600);assert close_enough(eye(),[11,12,13]),'Disabled camera moved while seeking'
 click('play');time.sleep(.15);assert close_enough(eye(),[11,12,13]),'Disabled camera moved during playback'
 click('play');click('recordedCamera');assert not close_enough(eye(),[11,12,13])
 seek(0);click('narration');click('play');time.sleep(.2)
 assert ws.evaluate('window.tutorialState.playing')
 click('play');paused=ws.evaluate('window.tutorialState.timeMs');time.sleep(.2)
 assert paused==ws.evaluate('window.tutorialState.timeMs'),'Pause advanced playhead'
 click('narration');seek(0)
 ws.evaluate("document.getElementById('speed').value='8'")
 click('play');time.sleep(1.6)
 state=ws.evaluate('window.tutorialState');assert not state['playing'] and state['timeMs']==9000 and state['objects']==0,state
 assert ws.evaluate("document.documentElement.lang")=='en'
 print('EXAMPLE: independent camera/text, camera hold, free orbit, pause, speed and completion passed',flush=True)
 # Exercise real audio with an embedded silent WAV, without adding a media fixture to the repo.
 import io,wave
 wav_bytes=io.BytesIO()
 with wave.open(wav_bytes,'wb') as wav:
  wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(8000);wav.writeframes(bytes(8000*2*4))
 audio_uri='data:audio/wav;base64,'+base64.b64encode(wav_bytes.getvalue()).decode()
 injection="""const nativeFetch=window.fetch;window.__testAudio=[];
 const NativeAudio=window.Audio;window.Audio=function(...args){const a=new NativeAudio(...args);window.__testAudio.push(a);return a;};
 window.fetch=async(...args)=>{const r=await nativeFetch(...args);if(String(args[0]).includes('spider-build-example.build.json')){
 const d=await r.json();d.assets.audio.voice={uri:AUDIO_URI,mimeType:'audio/wav'};
 d.tracks.narration.cues[1].audio={assetId:'voice',offsetMs:250,volume:.5};return new Response(JSON.stringify(d),{headers:{'Content-Type':'application/json'}});}return r;};""".replace('AUDIO_URI',json.dumps(audio_uri))
 script=ws.send('Page.addScriptToEvaluateOnNewDocument',{'source':injection})
 load('?file=spider-build-example.build.json')
 ws.user_gesture=True
 assert not ws.evaluate("document.getElementById('voiceover').disabled")
 seek(750);click('play');time.sleep(.35)
 audio=ws.evaluate("window.__testAudio.map(a=>({paused:a.paused,time:a.currentTime,volume:a.volume,rate:a.playbackRate}))")
 assert len(audio)==1 and not audio[0]['paused'] and audio[0]['time']>.5 and audio[0]['volume']==.5,audio
 click('play');assert ws.evaluate('window.__testAudio[0].paused')
 seek(2000);ws.evaluate("document.getElementById('speed').value='2'");click('play');time.sleep(.15)
 audio=ws.evaluate("({time:window.__testAudio[0].currentTime,rate:window.__testAudio[0].playbackRate})")
 assert audio['rate']==2 and audio['time']>1.7,audio
 click('voiceover');assert ws.evaluate('window.__testAudio[0].paused')
 click('play');ws.send('Page.removeScriptToEvaluateOnNewDocument',script)
 print('AUDIO: embedded file playback, cue offset, pause, seek, speed and mute passed',flush=True)
 ws.send('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
 time.sleep(.2)
 assert ws.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Mobile controls overflow horizontally'
 print('MOBILE: controls fit a 390px viewport',flush=True)
 print('PASS',flush=True)
finally:
 p.terminate()
 try:p.wait(timeout=8)
 except Exception:p.kill()
 import shutil
 shutil.rmtree(profile,ignore_errors=True)

