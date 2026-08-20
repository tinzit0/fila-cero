(function(){
  const cfg=window.FC_CONFIG||{},sb=window.FC_SUPABASE,db=cfg.db||{},edge=cfg.edge||{};
  const pushTable=db.pushSubscriptionsTable||'fila_cero_push_subscriptions';
  let deferredPrompt=null;
  function toast(m){window.showToast?window.showToast(m):console.log(m)}
  function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
  async function register(){if(!('serviceWorker'in navigator)||location.protocol==='file:')return null;try{return await navigator.serviceWorker.register('/sw.js',{scope:'/'})}catch(e){console.warn('Fila Cero SW',e);return null}}
  async function getRegistration(){await register();return navigator.serviceWorker.ready}
  async function session(){if(!sb)return null;return (await sb.auth.getSession()).data.session}
  async function getPushStatus(){
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))return {supported:false,subscribed:false,permission:'unsupported'};
    try{const reg=await getRegistration(),sub=await reg.pushManager.getSubscription();return {supported:true,subscribed:!!sub,permission:Notification.permission,subscription:sub}}catch{return {supported:true,subscribed:false,permission:Notification.permission}}
  }
  async function subscribePush(){
    if(!sb)throw new Error('Supabase no disponible.');const s=await session();if(!s)throw new Error('Inicia sesión para activar avisos push.');
    if(!('PushManager'in window)||!('Notification'in window))throw new Error('Este navegador no admite notificaciones push.');
    const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Debes permitir las notificaciones para activar push.');
    const fn=edge.pushConfig||'fila-cero-push-config';const response=await fetch(`${cfg.supabaseUrl}/functions/v1/${fn}`,{headers:{apikey:cfg.supabasePublishableKey}});const pushCfg=await response.json().catch(()=>({}));
    if(!response.ok||!pushCfg?.enabled||!pushCfg.publicKey)throw new Error('Push todavía no está configurado en Supabase. Revisa las claves VAPID de la v0.14.');
    const reg=await getRegistration();let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(pushCfg.publicKey)});
    const j=sub.toJSON(),row={user_id:s.user.id,endpoint:j.endpoint,p256dh:j.keys?.p256dh,auth:j.keys?.auth,user_agent:navigator.userAgent,updated_at:new Date().toISOString()};
    const {error}=await sb.from(pushTable).upsert(row,{onConflict:'user_id,endpoint'});if(error)throw error;toast('Notificaciones push activadas en este dispositivo.');return sub;
  }
  async function unsubscribePush(){
    if(!sb)return;const s=await session(),reg=await getRegistration(),sub=await reg.pushManager.getSubscription();if(sub){if(s)await sb.from(pushTable).delete().eq('user_id',s.user.id).eq('endpoint',sub.endpoint);await sub.unsubscribe()}toast('Notificaciones push desactivadas en este dispositivo.');
  }
  async function install(){
    if(window.matchMedia('(display-mode: standalone)').matches)return toast('Fila Cero ya está instalada como aplicación.');
    if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;document.querySelectorAll('[data-pwa-install-dynamic]').forEach(x=>x.classList.add('hidden'));return}
    if(/iphone|ipad|ipod/i.test(navigator.userAgent))return alert('En iPhone/iPad: toca Compartir y luego “Agregar a pantalla de inicio”.');
    alert('En el menú de tu navegador busca “Instalar aplicación” o “Agregar a pantalla de inicio”.');
  }
  function bindInstallButtons(){document.querySelectorAll('[data-pwa-install]').forEach(b=>{if(b.dataset.pwaBound)return;b.dataset.pwaBound='1';b.addEventListener('click',install)})}
  function addInstallButton(){
    const footer=document.querySelector('.site-footer');if(!footer||footer.querySelector('[data-pwa-install-dynamic]')){bindInstallButtons();return}
    const b=document.createElement('button');b.type='button';b.className='pwa-install-btn hidden';b.dataset.pwaInstall='';b.dataset.pwaInstallDynamic='';b.textContent='Instalar Fila Cero';footer.appendChild(b);bindInstallButtons();
    if(deferredPrompt&&!window.matchMedia('(display-mode: standalone)').matches)b.classList.remove('hidden');
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;addInstallButton();document.querySelectorAll('[data-pwa-install-dynamic]').forEach(b=>b.classList.remove('hidden'))});
  window.addEventListener('appinstalled',()=>{document.querySelectorAll('[data-pwa-install-dynamic]').forEach(b=>b.classList.add('hidden'));toast('Fila Cero quedó instalada en tu dispositivo.')});
  register().then(()=>{addInstallButton();bindInstallButtons()});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{addInstallButton();bindInstallButtons()});else{addInstallButton();bindInstallButtons()}
  window.FCPWA={register,subscribePush,unsubscribePush,getPushStatus,install};
})();
