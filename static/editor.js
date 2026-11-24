const files={front:null,back:null};
const canvases={front:document.getElementById('frontCanvas'),back:document.getElementById('backCanvas')};
const ctx={front:canvases.front.getContext('2d'),back:canvases.back.getContext('2d')};
let angle=0,zoom=1,fit='contain';
function load(side,file){
 if(!file)return;
 if(!file.type.startsWith('image/')){alert('कृपया image file चुनें');return;}
 const url=URL.createObjectURL(file),img=new Image();
 img.onload=()=>{files[side]=img;draw(side);document.getElementById(side+'Empty').style.display='none';URL.revokeObjectURL(url)};
 img.src=url;
}
document.getElementById('frontFile').addEventListener('change',e=>load('front',e.target.files[0]));
document.getElementById('backFile').addEventListener('change',e=>load('back',e.target.files[0]));
document.getElementById('rotate').addEventListener('input',e=>{angle=Number(e.target.value);document.getElementById('angleText').textContent=angle+'°';drawAll()});
document.getElementById('zoom').addEventListener('input',e=>{zoom=Number(e.target.value)/100;drawAll()});
document.getElementById('fitMode').addEventListener('change',e=>{fit=e.target.value;drawAll()});
function draw(side){
 const c=canvases[side],g=ctx[side],img=files[side];g.clearRect(0,0,c.width,c.height);g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);if(!img)return;
 g.save();g.translate(c.width/2,c.height/2);g.rotate(angle*Math.PI/180);
 const rotatedW=(angle%180===0)?img.width:img.height,rotatedH=(angle%180===0)?img.height:img.width;
 let scale=(fit==='cover'?Math.max(c.width/rotatedW,c.height/rotatedH):Math.min(c.width/rotatedW,c.height/rotatedH))*zoom;
 const w=img.width*scale,h=img.height*scale;g.drawImage(img,-w/2,-h/2,w,h);g.restore();
}
function drawAll(){draw('front');draw('back')}
function resetEditor(){angle=0;zoom=1;fit='contain';document.getElementById('rotate').value=0;document.getElementById('zoom').value=100;document.getElementById('fitMode').value='contain';document.getElementById('angleText').textContent='0°';drawAll()}
async function printPaid(){
 if(!files.front&&!files.back){alert('पहले Front या Back image upload करें');return}
 const btn=event?.target; if(btn){btn.disabled=true;btn.textContent='Processing...'}
 try{
  const res=await fetch('/api/use-service',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({service:'Card Print'})});
  const data=await res.json();
  if(!res.ok||!data.ok){alert(data.message||'Wallet payment failed');return}
  window.print();
 }catch(e){alert('Server से संपर्क नहीं हो पाया।')}
 finally{if(btn){btn.disabled=false;btn.textContent='Pay ₹1 & Print A4'}}
}
