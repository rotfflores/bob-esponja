const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const downloads=[], generatedStates=[], shares=[], revokedURLs=[];
const memoryModule=require(path.join(root,'summary.js'));
const memoryMock={...memoryModule,createPNG:async state=>{generatedStates.push(JSON.parse(JSON.stringify(state)));if(memoryMock.failNext){memoryMock.failNext=false;throw new Error('test encoding failure')}return new Blob(['test image'],{type:'image/png'})}};

// Minimal DOM doubles exercise the actual app, without starting a browser.
class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs; this.children = []; this.parent = null;
    this.events = {}; this.style = {setProperty(){}}; this.hidden = 'hidden' in attrs; this.disabled = 'disabled' in attrs;
    this.open = false; this.paused = true; this.currentTime = 0; this.duration = 10; this.scrollTop = 0;
    this.ownText = ''; this.dataset = {};
    Object.entries(attrs).forEach(([key,value]) => { if(key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())] = value; });
    this.classList = {
      add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].join(' ').trim();},
      remove:(...names)=>{this.className=this.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ');},
      toggle:(name,on)=>{if(on??!this.className.split(/\s+/).includes(name))this.classList.add(name);else this.classList.remove(name);}
    };
  }
  get id(){return this.attrs.id||''} set id(value){this.attrs.id=value}
  get className(){return this.attrs.class||''} set className(value){this.attrs.class=value}
  get textContent(){return this.ownText+this.children.map(x=>x.textContent).join('')}
  set textContent(value){this.ownText=String(value);this.children=[]}
  get firstElementChild(){return this.children[0]}
  get parentNode(){return this.parent}
  click(){if(this.download)downloads.push({name:this.download,href:this.href});return this.emit('click')}
  appendChild(child){child.parent=this;this.children.push(child);return child}
  setAttribute(key,value){this.attrs[key]=String(value)} getAttribute(key){return this.attrs[key]??null}
  removeAttribute(key){delete this.attrs[key]}
  addEventListener(name,fn){(this.events[name]??=[]).push(fn)}
  emit(name,properties={}){const event={target:this,currentTarget:this,preventDefault(){this.defaultPrevented=true},...properties};for(const fn of this.events[name]||[])fn(event);return event}
  matches(selector){
    if(selector.includes(' ')){const parts=selector.split(' ');const last=parts.pop();return this.matches(last)&&!!this.parent?.closest(parts.join(' '));}
    const prefix=/^([a-z]+)\[([\w-]+)\^="([^"]+)"\]$/.exec(selector);
    if(prefix)return this.tagName===prefix[1].toUpperCase()&&(this.attrs[prefix[2]]||'').startsWith(prefix[3]);
    if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
    if(selector.startsWith('['))return selector.slice(1,-1) in this.attrs;
    return this.tagName===selector.toUpperCase();
  }
  closest(selectors){for(let el=this;el;el=el.parent)if(selectors.split(',').some(s=>el.matches(s)))return el;return null}
  querySelectorAll(selector){const result=[];const visit=el=>{for(const child of el.children){if(child.matches(selector))result.push(child);visit(child)}};visit(this);return result}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  replaceWith(next){const index=this.parent.children.indexOf(this);this.parent.children[index]=next;next.parent=this.parent}
  focus(){this.focused=true} getBoundingClientRect(){return {left:0,top:0,width:390,right:390,bottom:844}}
  play(){this.playCalls=(this.playCalls||0)+1;if(process.env.AUTOPLAY_BLOCKED&&this.id==='dive-video'&&this.playCalls===1)return Promise.reject(new Error('Autoplay blocked'));this.paused=false;return Promise.resolve()} pause(){this.paused=true}
  showModal(){this.open=true} close(){this.open=false;this.emit('close')}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this)}
}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const document=new Element('document');
const stack=[document];
for(const token of html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)){
  if(token.startsWith('<!--')||token.startsWith('<!'))continue;
  if(token.startsWith('</')){stack.pop();continue;}
  if(token.startsWith('<')){
    const [,tag]=token.match(/^<([^\s/>]+)/);
    const attrs={};for(const match of token.matchAll(/([\w-]+)(?:="([^"]*)")?/g)){if(match.index===1)continue;attrs[match[1]]=match[2]??'';}
    const el=new Element(tag,attrs);stack.at(-1).appendChild(el);
    if(!/\/$/.test(token.slice(0,-1))&&!['meta','link','br','input','img','hr','source'].includes(tag))stack.push(el);
  }else stack.at(-1).ownText+=token;
}
document.getElementById=id=>{const walk=el=>el.id===id?el:el.children.map(walk).find(Boolean);return walk(document)};
document.createElement=tag=>new Element(tag);
document.hidden=false;document.fullscreenEnabled=false;document.documentElement=document.querySelector('html');document.body=document.querySelector('body');
const $=id=>document.getElementById(id);
const window=new Element('window');window.innerWidth=390;
const motion={matches:false,addEventListener(){}};
let now=1000,timerId=0;const timers=new Map();
function tick(ms){now+=ms;for(const [id,timer]of timers)if(timer.at<=now){timers.delete(id);timer.fn();}}
const sandbox={document,window,OceanMemory:memoryMock,File:class{constructor(parts,name,options){this.name=name;this.type=options.type;this.parts=parts}},navigator:{canShare:()=>true,share:async data=>{shares.push(data)}},URL:{createObjectURL:()=>`blob:test-${generatedStates.length}`,revokeObjectURL:url=>revokedURLs.push(url)},matchMedia:()=>motion,history:{replaceState(){}},performance:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++timerId,{at:now+ms,fn});return timerId},clearTimeout:id=>timers.delete(id),console};
vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),sandbox);
const chapters=document.querySelectorAll('.chapter');
const active=()=>chapters.find(x=>!x.hidden)?.id || null;
function tap(x, options={}){
  tick(300);const stage=$('story-stage');const target=chapters.find(x=>!x.hidden).querySelector('p')||chapters.find(x=>!x.hidden);
  stage.emit('pointerdown',{isPrimary:true,button:0,pointerId:1,clientX:x,clientY:400,target});
  if(options.hold)tick(400);
  if(options.scroll)chapters.find(x=>!x.hidden).scrollTop=50;
  stage.emit('pointerup',{pointerId:1,clientX:x,clientY:400,target});
}
async function run(){
  assert.equal(chapters.length,7);assert.equal(active(),null);assert.equal($('ambience').paused,true);
  assert.equal($('story-stage').hidden,true);assert.equal(document.querySelector('.topbar').hidden,true);assert.equal(document.querySelector('.story-footer').hidden,true);
  assert.ok('autoplay' in $('dive-video').attrs);assert.ok('muted' in $('dive-video').attrs);
  await new Promise(setImmediate);
  if(process.env.AUTOPLAY_BLOCKED){assert.equal($('retry-entry').hidden,false);$('retry-entry').emit('click');await new Promise(setImmediate);}
  assert.equal($('dive-video').paused,false,'The entrance video plays before interaction');
  document.emit('keydown',{key:'ArrowRight'});$('next-story').emit('click');$('start-experience').emit('click');
  assert.equal(active(),null,'Navigation cannot bypass the entrance');assert.equal($('ambience').paused,true);
  assert.equal($('enter-experience').hidden,true);
  $('enter-experience').emit('click');assert.equal($('story-stage').hidden,true,'Invitation cannot open before submersion');
  $('dive-video').currentTime=2.7;$('dive-video').emit('timeupdate');assert.equal($('enter-experience').hidden,true);
  $('dive-video').currentTime=2.9;$('dive-video').emit('timeupdate');assert.equal($('enter-experience').hidden,true);
  $('dive-video').currentTime=3.99;$('dive-video').emit('timeupdate');assert.equal($('enter-experience').hidden,true,'Wait two seconds after full submersion');
  $('dive-video').currentTime=4;$('dive-video').emit('timeupdate');assert.equal($('enter-experience').hidden,false,'Show invitation two seconds after full submersion');
  assert.equal($('story-stage').hidden,true,'Content stays hidden while the video plays');
  $('dive-video').emit('ended');assert.equal($('enter-experience').hidden,false);assert.equal($('dive-loop').hidden,false);assert.equal($('dive-video').hidden,true);assert.equal($('entry').hidden,false);
  $('replay-dive').emit('click');assert.equal($('dive-video').currentTime,0);assert.equal($('enter-experience').hidden,true);
  $('dive-video').emit('ended');
  $('enter-experience').emit('click');await new Promise(setImmediate);
  assert.equal(active(),'inicio');assert.equal($('entry').hidden,true);assert.equal($('entry').inert,true);
  assert.equal($('story-stage').hidden,false);assert.equal(document.querySelector('.topbar').hidden,false);assert.equal(document.querySelector('.story-footer').hidden,false);
  assert.equal($('ambience').paused,false,'The opening touch starts music');assert.equal($('dive-video').paused,true);assert.equal($('dive-loop').paused,true);
  $('dive-video').emit('ended');assert.equal($('entry').hidden,true,'A late video event cannot reopen the entrance');
  $('start-experience').emit('click');assert.equal(active(),'paseo');
  tap(350,{scroll:true});assert.equal(active(),'paseo','Scrolling must not navigate');
  tap(350,{hold:true});assert.equal(active(),'paseo','Holding must not navigate');
  tap(350);assert.equal(active(),'razones');assert.equal($('reason-label').textContent,'Tu risa');
  for(let n=0;n<4;n++)tap(350);assert.equal(active(),'razones');assert.equal($('reason-label').textContent,'Tu compañía');
  tap(350);assert.equal(active(),'atardecer');
  tap(25);assert.equal(active(),'razones');assert.equal($('reason-label').textContent,'Tu compañía');
  tap(25);assert.equal($('reason-label').textContent,'Tu autenticidad');
  $('favorite-reason').emit('click');assert.equal($('favorite-reason').getAttribute('aria-pressed'),'true');
  const bars=document.querySelector('.story-progress').children;
  const barFor=id=>bars[chapters.findIndex(chapter=>chapter.id===id)];
  barFor('atardecer').emit('click');$('save-sunset').emit('click');assert.equal($('save-sunset').getAttribute('aria-pressed'),'true');
  $('save-sunset').emit('click');assert.equal($('save-sunset').getAttribute('aria-pressed'),'false');
  barFor('paseo').emit('click');$('road-surprise').emit('click');assert.equal($('adventure-panel').hidden,false);assert.equal($('road-surprise').getAttribute('aria-expanded'),'true');assert.equal($('road-video').paused,false);
  assert.equal($('road-choice-card').hidden,true);assert.equal($('confirm-plan').disabled,true);
  const planButtons=document.querySelectorAll('[data-plan]');
  planButtons[2].emit('click');assert.equal($('plan-selected-title').textContent,'Ver el atardecer');
  assert.equal(planButtons[2].getAttribute('aria-pressed'),'true');assert.equal(planButtons[1].getAttribute('aria-pressed'),'false');
  tick(300);const inlineStage=$('story-stage');const inlineTarget=$('adventure-title');
  inlineStage.emit('pointerdown',{isPrimary:true,button:0,pointerId:8,clientX:350,clientY:400,target:inlineTarget});
  inlineStage.emit('pointerup',{pointerId:8,clientX:350,clientY:400,target:inlineTarget});
  assert.equal(active(),'paseo','Touching the inline choices must not navigate');
  $('confirm-plan').emit('click');assert.equal($('adventure-panel').hidden,true);assert.equal($('road-choice-card').hidden,false);assert.equal($('road-chosen-title').textContent,'Ver el atardecer');
  $('road-surprise').emit('click');$('surprise-plan').emit('click');assert.equal($('plan-selected-title').textContent,'Explorar contigo');$('confirm-plan').emit('click');
  barFor('carta').emit('click');$('read-letter').emit('click');assert.equal($('letter-dialog').open,true);assert.equal(chapters.find(c=>c.id==='carta').querySelector('video').paused,false,'Video continues behind the transparent letter');tap(350);assert.equal(active(),'carta');
  $('letter-continue').emit('click');assert.equal(active(),'contigo');
  const wish=document.querySelector('.wish-toggle');const detail=$('wish-detail-0');assert.equal(detail.hidden,true);wish.emit('click');assert.equal(detail.hidden,false);
  const wishSave=document.querySelector('.wish-save');assert.equal(wishSave.hidden,false);wishSave.emit('click');assert.equal(wishSave.getAttribute('aria-pressed'),'true');
  barFor('paseo').emit('click');
  $('sound').emit('click');assert.equal($('ambience').paused,true);tap(350);assert.equal($('ambience').paused,true,'Navigation must preserve explicit mute');
  barFor('paseo').emit('click');
  $('sound').emit('click');await new Promise(setImmediate);assert.equal($('ambience').paused,false);
  tick(300);const stage=$('story-stage');const control=$('road-surprise');
  stage.emit('pointerdown',{isPrimary:true,button:0,pointerId:2,clientX:350,clientY:400,target:control});
  stage.emit('pointerup',{pointerId:2,clientX:350,clientY:400,target:control});
  assert.equal(active(),'paseo','A button must not trigger story navigation');
  stage.emit('pointerdown',{isPrimary:true,button:0,pointerId:3,clientX:350,clientY:400,target:$('road-note')});tick(400);
  assert.equal($('ambience').paused,true,'Holding pauses music');assert.equal($('road-video').paused,true,'Holding pauses video');
  window.emit('pointerup');await new Promise(setImmediate);assert.equal($('ambience').paused,false,'Releasing outside the stage resumes music');
  document.hidden=true;document.emit('visibilitychange');assert.equal($('ambience').paused,true);assert.ok(document.querySelectorAll('video').every(v=>v.paused));
  document.hidden=false;document.emit('visibilitychange');await new Promise(setImmediate);assert.equal($('ambience').paused,false);
  barFor('siempre').emit('click');$('send-love').emit('click');assert.match($('love-note').textContent,/ola de cariño/);tap(350);assert.equal(active(),'siempre');

  $('open-summary').emit('click');assert.equal($('summary-dialog').open,true);
  assert.equal($('download-summary').disabled,true);assert.equal($('whatsapp-summary').emit('click').defaultPrevented,true);
  await new Promise(setImmediate);
  assert.equal($('summary-preview').hidden,false,$('summary-status').textContent);assert.equal($('download-summary').disabled,false);
  const state=generatedStates.at(-1);assert.equal(state.giftImage,'media/intro-loop.jpg');assert.equal(state.planTitle,'Explorar contigo');assert.equal(state.favoriteReason,'Esa manera tan tuya de ser.');assert.deepEqual(state.wishes,['Seguir haciendo tonterías.']);
  $('download-summary').emit('click');assert.equal(downloads.at(-1).name,'nuestro-oceano.png');
  const whatsapp=new URL($('whatsapp-summary').getAttribute('href'));assert.equal(whatsapp.hostname,'wa.me');assert.equal(whatsapp.pathname,'/526182051723');assert.match(whatsapp.searchParams.get('text'),/Explorar contigo/);
  assert.equal($('whatsapp-summary').emit('click').defaultPrevented,undefined);assert.equal(downloads.length,2);
  $('share-summary').emit('click');await new Promise(setImmediate);assert.equal(shares[0].files[0].name,'nuestro-oceano.png');
  $('summary-dialog').close();$('open-summary').emit('click');await new Promise(setImmediate);assert.equal(generatedStates.length,1,'Unchanged choices reuse the image');$('summary-dialog').close();
  barFor('paseo').emit('click');$('road-surprise').emit('click');planButtons[0].emit('click');$('confirm-plan').emit('click');
  memoryMock.failNext=true;barFor('siempre').emit('click');$('open-summary').emit('click');await new Promise(setImmediate);assert.equal($('retry-summary').hidden,false);assert.equal($('download-summary').disabled,true);
  $('retry-summary').emit('click');await new Promise(setImmediate);assert.equal($('download-summary').disabled,false);assert.equal(generatedStates.at(-1).planTitle,'Paseo sin rumbo');assert.equal(revokedURLs.length,1);
  sandbox.navigator.share=async()=>{const error=new Error('Canceled');error.name='AbortError';throw error};$('share-summary').emit('click');await new Promise(setImmediate);assert.match($('summary-status').textContent,/cuando quieras/);
  $('summary-dialog').close();
  motion.matches=true;barFor('paseo').emit('click');assert.equal($('road-video').paused,true,'Reduced motion leaves background loops still');
  motion.matches=false;
  bars[0].emit('click');tap(25);assert.equal(active(),'inicio');
  for(const reference of html.matchAll(/(?:src|poster|href)="((?:media\/|app\.|styles\.)[^"]+)"/g))assert.ok(fs.existsSync(path.join(root,reference[1])),reference[1]);
  assert.equal($('pause-story'),undefined,'Pause button removed');assert.equal(document.querySelector('.letter-preview'),null,'No paper preview covers the background');assert.equal($('adventure-dialog'),undefined);
  assert.doesNotMatch(html.replace(/<[^>]*>/g,''),/\b0[1-9]\b/,'No sequential numbers appear in visible content');
  const media=document.querySelectorAll('video');assert.ok(media.every(v=>'muted' in v.attrs),'Only the supplied MP3 should be audible');
  console.log('PASS: invitation at four seconds; inline choices below the button; live background behind letter; pause button removed; selected gift photo in memory state; download, share, touch and audio regressions.');
}
run().catch(error=>{console.error(error);process.exitCode=1});
