/* Local keepsake export: the chosen gift and sunset remain visible in the PNG. */
(function (root) {
  'use strict';
  const WIDTH=1080, HEIGHT=1920, RECIPIENT='526182051723';
  const GIFT_IMAGES=['media/paseo.jpg','media/noche.jpg','media/atardecer.jpg','media/intro-loop.jpg'];
  function wrappedText(ctx,text,x,y,width,lineHeight,maxLines){
    const words=String(text).split(/\s+/),lines=[];let line='';
    for(const word of words){const trial=line?`${line} ${word}`:word;if(line&&ctx.measureText(trial).width>width){lines.push(line);line=word}else line=trial}
    if(line)lines.push(line);const visible=lines.slice(0,maxLines);
    if(lines.length>maxLines){let last=visible[visible.length-1];while(last&&ctx.measureText(`${last}…`).width>width)last=last.slice(0,-1);visible[visible.length-1]=`${last.trim()}…`}
    visible.forEach((value,index)=>ctx.fillText(value,x,y+index*lineHeight));
  }
  function roundedPath(ctx,x,y,width,height,radius){
    ctx.beginPath();ctx.moveTo(x+radius,y);ctx.lineTo(x+width-radius,y);ctx.quadraticCurveTo(x+width,y,x+width,y+radius);
    ctx.lineTo(x+width,y+height-radius);ctx.quadraticCurveTo(x+width,y+height,x+width-radius,y+height);
    ctx.lineTo(x+radius,y+height);ctx.quadraticCurveTo(x,y+height,x,y+height-radius);ctx.lineTo(x,y+radius);ctx.quadraticCurveTo(x,y,x+radius,y);ctx.closePath();
  }
  function cover(ctx,image,x,y,width,height){
    if(!image)return;const scale=Math.max(width/image.width,height/image.height);const w=image.width*scale,h=image.height*scale;
    ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);
  }
  function photoCard(ctx,image,x,label,title){
    const y=470,w=440,h=620;
    ctx.save();roundedPath(ctx,x,y,w,h,24);ctx.clip();
    ctx.fillStyle='#08758c';ctx.fillRect(x,y,w,h);cover(ctx,image,x,y,w,h);
    const shade=ctx.createLinearGradient(0,y,0,y+h);shade.addColorStop(0,'#021b35cc');shade.addColorStop(.35,'#021b3540');shade.addColorStop(.7,'#021b3500');
    ctx.fillStyle=shade;ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#fff8df';ctx.font='900 16px Nunito, sans-serif';ctx.fillText(label,x+24,y+38);
    ctx.font='37px Chewy, sans-serif';wrappedText(ctx,title,x+24,y+98,w-48,45,3);
    ctx.restore();ctx.strokeStyle='#fff8df88';ctx.lineWidth=2;roundedPath(ctx,x,y,w,h,24);ctx.stroke();
  }
  function draw(ctx,state,background=null,gift=null,sunset=null){
    ctx.fillStyle='#053d55';ctx.fillRect(0,0,WIDTH,HEIGHT);cover(ctx,background,0,0,WIDTH,HEIGHT);
    const shade=ctx.createLinearGradient(0,0,0,HEIGHT);shade.addColorStop(0,'#021b35c9');shade.addColorStop(.5,'#032d4377');shade.addColorStop(1,'#021b35ee');ctx.fillStyle=shade;ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle='#dcf6ef';ctx.font='800 22px Nunito, sans-serif';ctx.fillText('ARENITA  ·  TU BOB ESPONJA',80,108);
    ctx.fillStyle='#ffe575';ctx.font='100px Chewy, sans-serif';ctx.fillText('Un océano',74,250);ctx.fillText('para nosotros.',74,362);
    ctx.fillStyle='#fff8df';ctx.font='37px Caveat, cursive';ctx.fillText('Mi lugar favorito siempre vas a ser tú.',80,426);
    photoCard(ctx,gift,70,'EL REGALO QUE ELEGIMOS',state.planTitle||'Una aventura contigo');
    photoCard(ctx,sunset,570,'NUESTRO ATARDECER','Un lugar para nosotros.');
    ctx.fillStyle='#fff8e8ed';roundedPath(ctx,70,1140,940,540,28);ctx.fill();
    function label(text,y){ctx.fillStyle='#537879';ctx.font='900 20px Nunito, sans-serif';ctx.fillText(text,112,y)}
    label('MI DETALLE FAVORITO DE TI',1197);ctx.fillStyle='#073d50';ctx.font='39px Chewy, sans-serif';
    wrappedText(ctx,state.favoriteReason||'Tu forma de hacer especial mi mundo.',112,1260,856,48,2);
    label('LO QUE QUIERO CONTIGO',1398);ctx.fillStyle='#073d50';ctx.font='28px Nunito, sans-serif';
    wrappedText(ctx,state.wishes?.length?state.wishes.join(' · '):'Reír, cuidarnos y coleccionar días juntos.',112,1452,856,39,3);
    ctx.fillStyle='#ad5b60';ctx.font='31px Caveat, cursive';wrappedText(ctx,state.sunsetSaved?'Guardamos un atardecer. Nos quedan muchos más.':'Nos quedan muchos atardeceres por compartir.',112,1606,856,37,2);
    ctx.fillStyle='#ffe575';ctx.font='40px Caveat, cursive';wrappedText(ctx,'Te amo. En este y en todos nuestros mares.',80,1773,920,48,2);
    ctx.fillStyle='#d8efea';ctx.font='20px Nunito, sans-serif';ctx.fillText('Un recuerdo de nuestro pequeño Fondo de Bikini.',84,1872);
  }
  function loadPhoto(path){
    return new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=root.OceanMemoryImages?.[path]||path});
  }
  async function createPNG(state){
    const fonts=document.fonts?.ready||Promise.resolve();
    const path=GIFT_IMAGES.includes(state.giftImage)?state.giftImage:'media/paseo.jpg';
    const [background,gift,sunset]=await Promise.all([loadPhoto('media/medusas.jpg'),loadPhoto(path),loadPhoto('media/atardecer.jpg'),Promise.race([fonts,new Promise(resolve=>setTimeout(resolve,1800))])]);
    const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas unavailable');draw(ctx,state,background,gift,sunset);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image encoding failed')),'image/png'));
  }
  // Click-to-chat opens the conversation; the user attaches the downloaded image.
  function whatsappURL(state){
    const plan=state.planTitle?`Nuestro plan: ${state.planTitle}. `:'';
    return `https://wa.me/${RECIPIENT}?text=${encodeURIComponent(`Arenita, te comparto el recuerdo de nuestro océano. ${plan}Te elegiría en este y en todos nuestros mares. ♡`)}`;
  }
  const api={draw,createPNG,whatsappURL,WIDTH,HEIGHT};root.OceanMemory=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
