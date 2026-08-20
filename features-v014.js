(function(){
  const sb=window.FC_SUPABASE;
  function toast(m){window.showToast?window.showToast(m):alert(m)}
  async function refreshPushStatus(){
    const text=document.getElementById('pushStatusText'),on=document.getElementById('enableRealPush'),off=document.getElementById('disableRealPush');if(!text||!window.FCPWA)return;
    const st=await window.FCPWA.getPushStatus();
    if(!st.supported){text.textContent='Este navegador no admite Web Push.';if(on)on.disabled=true;if(off)off.disabled=true;return}
    if(st.subscribed){text.textContent='Este dispositivo está suscrito a notificaciones push, incluso con Fila Cero cerrada.';if(on)on.textContent='Push activado ✓';if(on)on.disabled=true;if(off)off.disabled=false}
    else {text.textContent=st.permission==='denied'?'Las notificaciones están bloqueadas en la configuración del navegador.':'Push no está activo en este dispositivo.';if(on){on.textContent='Activar push';on.disabled=st.permission==='denied'}if(off)off.disabled=true}
  }
  async function initAccountAutomation(){
    if(!document.getElementById('userAccountPage'))return;
    const on=document.getElementById('enableRealPush'),off=document.getElementById('disableRealPush');
    on?.addEventListener('click',async()=>{on.disabled=true;try{await window.FCPWA.subscribePush()}catch(e){toast(e.message||String(e))}finally{await refreshPushStatus()}});
    off?.addEventListener('click',async()=>{off.disabled=true;try{await window.FCPWA.unsubscribePush()}catch(e){toast(e.message||String(e))}finally{await refreshPushStatus()}});
    await refreshPushStatus();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPushStatus()});
  }
  function initNetworkStatus(){
    const update=()=>document.documentElement.classList.toggle('fc-offline',!navigator.onLine);update();window.addEventListener('online',()=>{update();toast('Conexión restablecida.')});window.addEventListener('offline',()=>{update();toast('Estás sin conexión. Puedes seguir viendo contenido guardado de Fila Cero.')});
  }
  document.addEventListener('DOMContentLoaded',()=>{initNetworkStatus();initAccountAutomation().catch(console.error)});
})();
