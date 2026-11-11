(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const { estimatePitch, toWav } = window.PitcheeSignal;
  const state = { route: '', live: null, frame: 0, pitchValues: [], lastPitchAt: 0,
    recorder: null, chunks: [], recordStart: 0, recordTimer: null, audioBlob: null,
    decoded: null, metrics: null, audioUrl: null, historyUrls: [], historyItems: [], historyMonth: new Date(), engine: false, db: null };
  let toastTimer;
  function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800); }
  function message(text, visible = true) { $('record-message').textContent = text; $('record-message').hidden = !visible; }
  function fmt(value, decimals = 1) { return Number.isFinite(value) ? value.toFixed(decimals) : '—'; }
  function safeId() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)); }
  function stopLive() {
    cancelAnimationFrame(state.frame);
    if (!state.live) return;
    state.live.stream.getTracks().forEach(track => track.stop());
    state.live.context.close().catch(() => {});
    state.live = null;
    $('pitch-toggle').innerHTML = '<span>▶</span> 开始练习';
    $('spectrum-toggle').textContent = '▶ 开始频谱';
  }
  function route() {
    const hash = location.hash.slice(1);
    const name = ['practice','analysis','spectrum','history','learn'].includes(hash) ? hash : 'practice';
    if (state.route !== name) {
      if (state.recorder && state.recorder.state === 'recording') state.recorder.stop();
      stopLive();
    }
    state.route = name;
    document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== name; });
    document.querySelectorAll('[data-nav]').forEach(el => { const active = el.dataset.nav === name; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
    if (name === 'history') renderHistory();
    if (name === 'practice') drawPitch();
    if (name === 'spectrum') drawSpectrum(null);
    window.scrollTo(0, 0);
  }
  async function startLive(kind) {
    stopLive();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('此页面无法访问麦克风。请使用 localhost 或 HTTPS，并检查浏览器权限。');
    const stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
    try {
      const context = new AudioContext();
      await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.7;
      const source = context.createMediaStreamSource(stream); source.connect(analyser);
      state.live = { stream, context, analyser, source, kind };
      if (kind === 'pitch') { $('pitch-toggle').textContent = '■ 停止练习'; $('pitch-empty').hidden = true; }
      if (kind === 'spectrum') { $('spectrum-toggle').textContent = '■ 停止频谱'; $('spectrum-empty').hidden = true; }
      tick(performance.now());
      return stream;
    } catch (error) { stream.getTracks().forEach(track => track.stop()); throw error; }
  }
  function tick(now) {
    if (!state.live) return;
    const { analyser, context, kind } = state.live;
    if (kind === 'pitch' && now - state.lastPitchAt >= 125) {
      const buffer = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(buffer);
      const pitch = estimatePitch(buffer, context.sampleRate);
      state.pitchValues.push(pitch ? pitch.hz : null);
      if (state.pitchValues.length > 120) state.pitchValues.shift();
      $('pitch-value').textContent = pitch ? String(Math.round(pitch.hz)) : '—';
      $('pitch-note').textContent = pitch ? '当前声音的基频估计' : '没有检测到稳定的声音';
      const valid = state.pitchValues.filter(Number.isFinite);
      $('pitch-average').textContent = valid.length ? String(Math.round(valid.reduce((a,b)=>a+b,0)/valid.length)) : '—';
      drawPitch(); state.lastPitchAt = now;
    } else if (kind === 'spectrum') {
      const bins = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(bins); drawSpectrum(bins, context.sampleRate);
    }
    state.frame = requestAnimationFrame(tick);
  }
  function canvasContext(canvas) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width*dpr) || canvas.height !== Math.round(rect.height*dpr)) { canvas.width = Math.round(rect.width*dpr); canvas.height = Math.round(rect.height*dpr); }
    const c = canvas.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,rect.width,rect.height); return {c,w:rect.width,h:rect.height};
  }
  function drawPitch() {
    const { c,w,h } = canvasContext($('pitch-chart')); if (!w || !h) return;
    const vals = state.pitchValues; let started = false;
    c.strokeStyle='#d47b5b'; c.lineWidth=2.5; c.lineCap='round'; c.lineJoin='round'; c.beginPath();
    for (let i=0;i<vals.length;i++) { if (!Number.isFinite(vals[i])) { started=false; continue; }
      const x = (i/119)*w, y = h - Math.max(0,Math.min(1,(vals[i]-70)/330))*h;
      if (!started) { c.moveTo(x,y); started=true; } else c.lineTo(x,y);
    } c.stroke();
  }
  function drawSpectrum(bins, rate=48000) {
    const {c,w,h} = canvasContext($('spectrum-chart')); if (!w || !h || !bins) return;
    const count=80, gap=2, width=Math.max(1,(w-gap*(count-1))/count);
    c.fillStyle='#d7886e';
    for (let i=0;i<count;i++) { const hz=60*Math.pow(8000/60,i/(count-1)); const index=Math.min(bins.length-1,Math.round(hz/(rate/2)*bins.length)); const bar=(bins[index]/255)*h*.88; c.globalAlpha=.45+.45*i/count; c.fillRect(i*(width+gap),h-bar,width,bar); }
    c.globalAlpha=1;
  }
  $('pitch-toggle').addEventListener('click', async () => { if(state.live?.kind==='pitch'){stopLive();$('pitch-note').textContent='已暂停练习';return;} try { await startLive('pitch'); } catch(e){toast(e.message);} });
  $('pitch-reset').addEventListener('click',()=>{state.pitchValues=[];$('pitch-average').textContent='—';$('pitch-value').textContent='—';$('pitch-empty').hidden=!!state.live;drawPitch();});
  $('spectrum-toggle').addEventListener('click',async()=>{ if(state.live?.kind==='spectrum'){stopLive();return;}try{await startLive('spectrum');}catch(e){toast(e.message);} });

  async function decodeBlob(blob) {
    if (blob.size > 30*1024*1024) throw new Error('音频文件不能大于 30 MB。');
    const context = new AudioContext();
    try { const decoded = await context.decodeAudioData(await blob.arrayBuffer()); if(decoded.duration < 5) throw new Error('请使用至少 5 秒的录音。'); if(decoded.duration > 60.1) throw new Error('请使用不超过 60 秒的录音。'); return decoded; }
    finally { await context.close(); }
  }
  function setAudio(blob) {
    if(state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioBlob=blob; state.decoded=null; state.metrics=null; state.audioUrl=URL.createObjectURL(blob);
    $('audio-player').src=state.audioUrl; $('audio-player').hidden=false; $('record-actions').hidden=false;
    $('result-pitch').innerHTML='— <small>Hz</small>'; $('result-vfp').textContent='—'; $('result-naturalness').textContent='—'; $('result-composite').textContent='—'; $('result-health').textContent='—'; $('pitch-source').textContent='等待分析';
    message('录音已准备好，可以回听、分析或保存。');
  }
  function stopTimer(){clearInterval(state.recordTimer);state.recordTimer=null;}
  $('record-toggle').addEventListener('click',async()=>{
    if(state.recorder && state.recorder.state==='recording'){state.recorder.stop();return;}
    try {
      if(!window.MediaRecorder) throw new Error('当前浏览器不支持录音，请使用新版 Chrome 或 Edge。');
      const stream=await startLive('record'); state.chunks=[];
      const recorder = new MediaRecorder(stream); state.recorder=recorder; state.recordStart=Date.now();
      recorder.ondataavailable=e=>{if(e.data.size)state.chunks.push(e.data);};
      recorder.onerror=()=>{stopTimer();stopLive();message('录音中断，请重试。');};
      recorder.onstop=()=>{ stopTimer(); const elapsed=(Date.now()-state.recordStart)/1000; const blob=new Blob(state.chunks,{type:recorder.mimeType||'audio/webm'}); state.recorder=null; stopLive(); $('record-toggle').textContent='开始录音'; $('record-symbol').classList.remove('active'); $('record-help').textContent='录音已结束'; if(elapsed<5 || !blob.size){message('请至少录制 5 秒再结束。');return;} setAudio(blob); };
      recorder.start(); $('record-toggle').textContent='结束录音'; $('record-symbol').classList.add('active'); $('record-help').textContent='正在录音，轻松地说话就好'; message('',false);
      state.recordTimer=setInterval(()=>{const elapsed=Date.now()-state.recordStart,seconds=Math.min(Math.floor(elapsed/1000),60);$('record-timer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');if(elapsed>=59800&&recorder.state==='recording')recorder.stop();},200);
    } catch(e){stopLive();toast(e.message);}
  });
  $('audio-upload').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{await decodeBlob(file);setAudio(file);$('record-help').textContent='已选择音频';}catch(error){message(error.message);} e.target.value='';});
  async function estimateBuffer(audio) {
    const data=audio.getChannelData(0), rate=audio.sampleRate, size=4096, hop=Math.max(1,Math.round(rate*.125));
    let sum=0,count=0;
    for(let start=0;start+size<=data.length;start+=hop){const p=estimatePitch(data.subarray(start,start+size),rate);if(p){sum+=p.hz;count++;}if((Math.floor(start/hop)%24)===0)await new Promise(resolve=>setTimeout(resolve,0));}
    return count ? sum/count : null;
  }
  async function checkEngine(){
    try{const response=await fetch('/api/status',{cache:'no-store'});const info=await response.json();state.engine=!!info.engine_available;}
    catch{state.engine=false;}
    $('engine-description').textContent=state.engine?'原版 Pitchee 分析核心已连接。':'基础音高可用；原版模型尚未连接。';
    $('engine-note').textContent=state.engine?'音色、自然度和综合分由原版核心计算。':'浏览器可估计音高。音色、自然度和综合分需要先安装并验证原版分析核心；当前不会生成这些分数。';
  }
  function busy(on){$('analyze-button').disabled=on;$('health-button').disabled=on;$('record-toggle').disabled=on;$('save-button').disabled=on;}
  $('analyze-button').addEventListener('click',async()=>{
    if(!state.audioBlob)return; const button=$('analyze-button');busy(true);button.textContent='分析中…';
    $('result-vfp').textContent='—';$('result-naturalness').textContent='—';$('result-composite').textContent='—';
    try{
      const decoded=state.decoded||await decodeBlob(state.audioBlob);state.decoded=decoded;
      const pitch=await estimateBuffer(decoded);state.metrics={pitch, source:'browser', duration:decoded.duration,health:state.metrics?.health};
      $('result-pitch').innerHTML=(pitch===null?'—':fmt(pitch,0))+' <small>Hz</small>'; $('pitch-source').textContent='浏览器估计，非原版 SwiftF0';
      if(state.engine){
        message('基础音高已完成，正在运行原版模型；较长录音可能需要一些时间。');
        const wav=toWav(decoded),profile=$('score-profile').value;const response=await fetch('/api/analyze',{method:'POST',headers:{'Content-Type':'audio/wav','X-Pitchee-Request':'1','X-Pitchee-Profile':profile},body:wav});
        const result=await response.json();if(!response.ok)throw new Error(result.error||'原版模型分析失败。');
        const corePitch=result.f0?.mean_hz;state.metrics={pitch:Number.isFinite(corePitch)?corePitch:pitch,source:Number.isFinite(corePitch)?'PitcheeCore':'browser',duration:decoded.duration,profile,health:state.metrics?.health,vfp:result.vfp?.vfp_standard_score,naturalness:result.naturalness?.score,composite:result.composite?.final_score};
        $('result-pitch').innerHTML=(Number.isFinite(state.metrics.pitch)?fmt(state.metrics.pitch,0):'—')+' <small>Hz</small>'; $('pitch-source').textContent=state.metrics.source==='PitcheeCore'?'原版 SwiftF0':'浏览器估计';
        $('result-vfp').textContent=fmt(state.metrics.vfp);$('result-naturalness').textContent=fmt(state.metrics.naturalness);$('result-composite').textContent=fmt(state.metrics.composite);
        message('分析完成。可以回听，并保存到本机记录。');
      } else message(pitch===null?'没有检测到足够稳定的音高，可以尝试更安静的环境重新录制。':'浏览器音高估计完成。原版模型尚未连接，其他分数暂不可用。');
    }catch(e){message(e.message||'分析失败，请重试。');}finally{busy(false);button.textContent='分析这段声音';}
  });
  $('health-button').addEventListener('click',async()=>{
    if(!state.audioBlob)return;if(!state.engine){message('声音健康测评需要先连接原版分析核心。');return;}
    const button=$('health-button');busy(true);button.textContent='测评中…';$('result-health').textContent='—';if(state.metrics)delete state.metrics.health;
    try{
      const decoded=state.decoded||await decodeBlob(state.audioBlob);state.decoded=decoded;
      message('正在运行原版声音健康模型，请稍候。');
      const response=await fetch('/api/voice-health',{method:'POST',headers:{'Content-Type':'audio/wav','X-Pitchee-Request':'1'},body:toWav(decoded)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||'声音健康测评失败。');
      if(!Number.isFinite(result.health_score))throw new Error('没有获得有效的健康分。');
      state.metrics=state.metrics||{pitch:null,source:'none',duration:decoded.duration};state.metrics.health=result.health_score;
      $('result-health').textContent=fmt(result.health_score);message('测评完成。声音健康分仅供参考，不能代替专业评估。');
    }catch(e){message(e.message||'声音健康测评失败，请重试。');}finally{busy(false);button.textContent='声音健康测评';}
  });
  function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('pitchee-web',1);req.onupgradeneeded=()=>req.result.createObjectStore('recordings',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  async function dbAction(mode,fn){state.db=state.db||await openDB();return new Promise((resolve,reject)=>{const tx=state.db.transaction('recordings',mode),store=tx.objectStore('recordings');let request;try{request=fn(store);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('操作已取消'));});}
  $('save-button').addEventListener('click',async()=>{if(!state.audioBlob)return;try{await dbAction('readwrite',s=>s.add({id:safeId(),createdAt:new Date().toISOString(),audio:state.audioBlob,metrics:state.metrics}));toast('已保存到当前浏览器。');}catch(e){toast('无法保存，请检查浏览器存储空间和隐私设置。');}});
  async function renderHistory(){
    const list=$('history-list');state.historyUrls.forEach(URL.revokeObjectURL);state.historyUrls=[];
    try{const items=(await dbAction('readonly',s=>s.getAll())).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));state.historyItems=items;$('history-count').textContent=String(items.length);$('history-last').textContent=items.length?new Date(items[0].createdAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric'}):'—';list.replaceChildren();drawHistory();drawCalendar();
      if(!items.length){const empty=document.createElement('div');empty.className='empty-history';empty.textContent='还没有保存的录音。每一次练习都可以从这里开始。';list.append(empty);return;}
      for(const item of items){const row=document.createElement('div');row.className='history-item';const text=document.createElement('div');const strong=document.createElement('strong');strong.textContent=new Date(item.createdAt).toLocaleString('zh-CN');const small=document.createElement('small');const values=[];if(Number.isFinite(item.metrics?.pitch))values.push(`音高 ${fmt(item.metrics.pitch,0)} Hz`);if(Number.isFinite(item.metrics?.vfp))values.push(`音色 ${fmt(item.metrics.vfp)}`);if(Number.isFinite(item.metrics?.naturalness))values.push(`自然度 ${fmt(item.metrics.naturalness)}`);if(Number.isFinite(item.metrics?.composite))values.push(`综合 ${fmt(item.metrics.composite)}`);if(Number.isFinite(item.metrics?.health))values.push(`健康 ${fmt(item.metrics.health)}`);small.textContent=values.length?values.join(' · '):'未分析';text.append(strong,small);const audio=document.createElement('audio');audio.controls=true;const url=URL.createObjectURL(item.audio);state.historyUrls.push(url);audio.src=url;const del=document.createElement('button');del.textContent='删除';del.setAttribute('aria-label','删除 '+strong.textContent+' 的录音');del.onclick=async()=>{if(!confirm('删除这条保存在浏览器中的录音？'))return;await dbAction('readwrite',s=>s.delete(item.id));renderHistory();};row.append(text,audio,del);list.append(row);}
    }catch(e){list.textContent='无法读取本地记录，请检查浏览器设置。';}
  }
  function drawHistory(){
    const key=$('history-metric').value,values=state.historyItems.slice().reverse().filter(item=>Number.isFinite(item.metrics?.[key])).slice(-30).map(item=>item.metrics[key]);
    $('history-chart-empty').hidden=values.length>0;
    const {c,w,h}=canvasContext($('history-chart'));if(!w||!h||!values.length)return;
    let lo=key==='pitch'?Math.max(0,Math.min(...values)-20):0,hi=key==='pitch'?Math.max(...values)+20:100;
    const coords=values.map((v,i)=>({x:values.length===1?w/2:14+i*(w-28)/(values.length-1),y:h-14-(h-28)*(v-lo)/(hi-lo)}));
    c.strokeStyle='#d47b5b';c.lineWidth=2.5;c.lineJoin='round';c.beginPath();coords.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();
    c.fillStyle='#d47b5b';coords.forEach(p=>{c.beginPath();c.arc(p.x,p.y,3.3,0,Math.PI*2);c.fill();});
  }
  function drawCalendar(){
    const d=state.historyMonth,year=d.getFullYear(),month=d.getMonth(),grid=$('calendar-grid');
    $('calendar-month').textContent=`${year} 年 ${month+1} 月`;grid.replaceChildren();
    for(const day of ['日','一','二','三','四','五','六']){const cell=document.createElement('div');cell.className='calendar-cell weekday';cell.textContent=day;grid.append(cell);}
    const offset=new Date(year,month,1).getDay(),days=new Date(year,month+1,0).getDate();
    for(let i=0;i<offset;i++){const empty=document.createElement('div');empty.className='calendar-cell';grid.append(empty);}
    const counts=new Map();for(const item of state.historyItems){const date=new Date(item.createdAt);if(date.getFullYear()===year&&date.getMonth()===month)counts.set(date.getDate(),(counts.get(date.getDate())||0)+1);}
    for(let day=1;day<=days;day++){const cell=document.createElement('div');cell.className='calendar-cell'+(counts.has(day)?' active':'');cell.textContent=String(day);if(counts.has(day))cell.setAttribute('aria-label',`${month+1} 月 ${day} 日，${counts.get(day)} 条记录`);grid.append(cell);}
  }
  $('history-metric').addEventListener('change',drawHistory);
  $('calendar-prev').addEventListener('click',()=>{const d=state.historyMonth;state.historyMonth=new Date(d.getFullYear(),d.getMonth()-1,1);drawCalendar();});
  $('calendar-next').addEventListener('click',()=>{const d=state.historyMonth;state.historyMonth=new Date(d.getFullYear(),d.getMonth()+1,1);drawCalendar();});
  function piano(){const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];for(let midi=48;midi<72;midi++){const button=document.createElement('button');const note=names[midi%12]+(Math.floor(midi/12)-1);button.textContent=note;button.setAttribute('aria-label',note+' 参考音');button.onclick=()=>{const context=new AudioContext(),osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.value=440*Math.pow(2,(midi-69)/12);gain.gain.setValueAtTime(.0001,context.currentTime);gain.gain.exponentialRampToValueAtTime(.1,context.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.0001,context.currentTime+.7);osc.connect(gain).connect(context.destination);osc.start();osc.stop(context.currentTime+.72);osc.onended=()=>context.close();};$('piano').append(button);}}
  window.addEventListener('hashchange',route);window.addEventListener('resize',()=>{if(state.route==='practice')drawPitch();if(state.route==='history')drawHistory();});
  window.addEventListener('beforeunload',()=>{stopLive();if(state.audioUrl)URL.revokeObjectURL(state.audioUrl);});
  piano();checkEngine();route();
})();
