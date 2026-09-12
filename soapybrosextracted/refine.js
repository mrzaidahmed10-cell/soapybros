(function(){
  var section=document.getElementById('detailScroll');
  var hero=document.querySelector('.conversion-hero');
  var count=document.getElementById('scrollCount');
  var windowEl=document.querySelector('.scroll-window');
  var carModel=document.getElementById('detailCarModel');
  if(!section||!hero||!count)return;
  hero.insertAdjacentElement('afterend',section);
  function clamp(value){return Math.max(0,Math.min(1,value));}
  function update(){
    var rect=section.getBoundingClientRect();
    var range=Math.max(1,section.offsetHeight-window.innerHeight);
    var progress=clamp(-rect.top/range);
    var stage=progress<.32?1:progress<.67?2:3;
    section.setAttribute('data-stage',stage);
    section.style.setProperty('--p',progress.toFixed(3));
    count.textContent='0'+stage+' / 03';
    if(carModel){
      var orbit=25+(360*progress);
      var elevation=72-(6*Math.sin(progress*Math.PI));
      var distance=105-(7*Math.sin(progress*Math.PI));
      carModel.setAttribute('camera-orbit',orbit.toFixed(1)+'deg '+elevation.toFixed(1)+'deg '+distance.toFixed(1)+'%');
    }
  }
  function tilt(event){
    var box=windowEl.getBoundingClientRect();
    var x=clamp((event.clientX-box.left)/box.width);
    var y=clamp((event.clientY-box.top)/box.height);
    windowEl.style.setProperty('--mx',(x-.5).toFixed(3));
    windowEl.style.setProperty('--my',(y-.5).toFixed(3));
  }
  if(windowEl){windowEl.addEventListener('pointermove',tilt);windowEl.addEventListener('pointerleave',function(){windowEl.style.setProperty('--mx',0);windowEl.style.setProperty('--my',0);});}
  if(carModel){
    carModel.addEventListener('load',function(){carModel.classList.add('loaded');update();});
    carModel.addEventListener('error',function(){windowEl.classList.add('model-unavailable');});
  }
  window.addEventListener('scroll',update,{passive:true});window.addEventListener('resize',update);update();
})();
