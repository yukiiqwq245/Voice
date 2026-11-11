const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const signal = {...require('../web/signal.js'), estimatePitch:()=>({hz:200,confidence:.99})};
const html = fs.readFileSync('web/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const elements = new Map();
function makeElement(id = '') {
  return {id, hidden:false, textContent:'', innerHTML:'', children:[], dataset:{},
    classList:{toggle(){},add(){},remove(){}}, addEventListener(type,fn){this['on'+type]=fn;},
    setAttribute(){},removeAttribute(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},
    getBoundingClientRect(){return {width:400,height:160};},
    getContext(){return {setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},arc(){},fill(){}};}
  };
}
for (const id of ids) elements.set(id, makeElement(id));
const names = ['practice','analysis','spectrum','history','learn'];
const nav = names.map(name => Object.assign(makeElement(), {dataset:{nav:name}}));
const handlers={};
const window = {PitcheeSignal:signal, devicePixelRatio:1, addEventListener(type,fn){handlers[type]=fn;},scrollTo(){}};
const sample={id:'sample',createdAt:new Date().toISOString(),audio:new Blob(['test']),metrics:{pitch:190,vfp:60,naturalness:80,composite:70,health:90,source:'PitcheeCore'}};
const saved=[sample];
const db={transaction(){const tx={objectStore(){return {getAll(){const req={result:saved.slice()};setTimeout(()=>tx.oncomplete(),0);return req;},add(item){saved.push(item);const req={result:item.id};setTimeout(()=>tx.oncomplete(),0);return req;}}}};return tx;}};
const indexedDB={open(){const req={result:db};setTimeout(()=>req.onsuccess(),0);return req;}};
elements.get('history-metric').value='pitch';
elements.get('score-profile').value='feminization';
const samples = new Float32Array(16000*6);
const audio={duration:6,length:samples.length,numberOfChannels:1,sampleRate:16000,getChannelData:()=>samples};
class FakeAudioContext{decodeAudioData(){return Promise.resolve(audio);}close(){return Promise.resolve();}}
const sandbox = {window, document:{getElementById:id=>elements.get(id),createElement:()=>makeElement(),querySelectorAll:sel=>sel==='.view'?names.map(n=>elements.get(n)):nav},
  location:{hash:''},navigator:{},AudioContext:FakeAudioContext,fetch:async(url)=>({ok:true,json:async()=>url==='/api/status'?{engine_available:true}:url==='/api/voice-health'?{health_score:88.2}:{f0:{mean_hz:198.2},vfp:{vfp_standard_score:65.4},naturalness:{score:82.3},composite:{final_score:74.6}}}),
  requestAnimationFrame(){return 1;},cancelAnimationFrame(){},setTimeout,clearTimeout,setInterval,clearInterval,
  performance:{now:()=>0},crypto:{randomUUID:()=> 'x'},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob,console,indexedDB};
vm.runInNewContext(fs.readFileSync('web/app.js','utf8'),sandbox);
assert.equal(elements.get('piano').children.length,24);
assert.equal(elements.get('practice').hidden,false);
assert.equal(elements.get('analysis').hidden,true);
assert.equal(typeof elements.get('pitch-toggle').onclick,'function');
assert.equal(typeof elements.get('analyze-button').onclick,'function');
async function run(){
  await new Promise(resolve=>setTimeout(resolve,5));
  const file=new Blob(['sample'],{type:'audio/wav'});
  await elements.get('audio-upload').onchange({target:{files:[file],value:''}});
  assert.equal(elements.get('record-actions').hidden,false);
  await elements.get('analyze-button').onclick();
  assert.equal(elements.get('result-vfp').textContent,'65.4');
  assert.equal(elements.get('result-naturalness').textContent,'82.3');
  assert.equal(elements.get('result-composite').textContent,'74.6');
  await elements.get('health-button').onclick();
  assert.equal(elements.get('result-health').textContent,'88.2');
  await elements.get('save-button').onclick();
  sandbox.location.hash='#history';handlers.hashchange();
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(elements.get('history').hidden,false);
  assert.equal(elements.get('history-count').textContent,'2');
  assert.equal(elements.get('history-list').children.length,2);
  assert.ok(elements.get('calendar-grid').children.length>=35);
  console.log('UI recording, analysis, history and navigation checks passed.');
}
run().catch(err=>{console.error(err);process.exitCode=1;});
