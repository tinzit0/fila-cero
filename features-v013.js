(function(){
  const sb=window.FC_SUPABASE,cfg=window.FC_CONFIG||{},db=cfg.db||{};
  if(!sb)return;
  const T_BUSINESSES=db.businessesTable||'fila_cero_businesses';
  const T_SLOTS=db.slotsTable||'fila_cero_slots';
  const T_RESERVATIONS=db.reservationsTable||'fila_cero_reservations';
  const T_FAVORITES=db.favoritesTable||'fila_cero_favorites';
  const T_REVIEWS=db.reviewsTable||'fila_cero_reviews';
  const T_ALERTS=db.alertsTable||'fila_cero_alert_preferences';
  const T_NOTIFICATIONS=db.notificationsTable||'fila_cero_notifications';
  const T_REPORTS=db.reportsTable||'fila_cero_reports';
  const RPC_REVIEW=db.submitReviewRpc||'fila_cero_submit_review';
  const RPC_CLAIM=db.claimReservationsRpc||'fila_cero_claim_reservations';
  const RPC_STATS=db.businessStatsRpc||'fila_cero_business_stats';
  const RPC_VIEW=db.recordProfileViewRpc||'fila_cero_record_profile_view';
  const RPC_VERIFY=db.adminSetVerifiedRpc||'fila_cero_admin_set_verified';
  const RPC_ADMIN_REPORTS=db.adminListReportsRpc||'fila_cero_admin_list_reports';
  const RPC_ADMIN_REPORT_UPDATE=db.adminUpdateReportRpc||'fila_cero_admin_update_report';
  const COMMUNES=['Concepción','Talcahuano','Hualpén','San Pedro de la Paz','Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'];
  const CATEGORIES=['Psicología','Dental','Kinesiología','Veterinaria','Nutrición','Otro'];
  const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money=v=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(v||0));
  const date=v=>{try{return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`))}catch{return v||''}};
  const toast=m=>window.showToast?window.showToast(m):alert(m);
  async function session(){const {data}=await sb.auth.getSession();return data.session||null}

  function enhanceFooter(){
    $$('.site-footer').forEach(f=>{if(f.querySelector('.legal-links'))return;const row=document.createElement('div');row.className='legal-links';row.innerHTML='<a href="privacidad.html">Privacidad</a><a href="terminos.html">Términos</a><a href="contacto.html">Contacto</a>';f.appendChild(row)});
  }

  async function enhanceNav(){
    const nav=$('.topbar nav');if(!nav)return;
    const s=await session();
    let userLink=nav.querySelector('[data-user-account-link]');
    if(!userLink){userLink=document.createElement('a');userLink.setAttribute('data-user-account-link','');userLink.href=s?'cuenta.html':'login.html?mode=consumer&next=cuenta.html';userLink.innerHTML=s?'Mi cuenta <span class="notification-mini" data-notification-count></span>':'Cuenta personal';const business=nav.querySelector('[data-account-link]');nav.insertBefore(userLink,business||nav.firstChild)}
    if(s){userLink.href='cuenta.html';const biz=window.FCAUTH?await FCAUTH.hasBusiness().catch(()=>null):null;const businessLink=nav.querySelector('[data-account-link]');if(businessLink){businessLink.href=biz?'profesional.html':'login.html?mode=business&next=profesional.html';businessLink.textContent=biz?'Mi empresa':'Publicar horas'}}
  }

  async function loadReviewAggregates(){
    const {data,error}=await sb.from(T_REVIEWS).select('business_id,rating').eq('status','visible');if(error)return new Map();
    const m=new Map();(data||[]).forEach(r=>{const x=m.get(r.business_id)||{sum:0,count:0};x.sum+=Number(r.rating);x.count++;m.set(r.business_id,x)});return m;
  }

  async function enhanceMarketplace(){
    if(!$('#businessesGrid'))return;
    const s=await session();const user=s?.user||null;
    let favoriteIds=new Set();
    if(user){const {data}=await sb.from(T_FAVORITES).select('business_id').eq('user_id',user.id);favoriteIds=new Set((data||[]).map(x=>x.business_id))}
    const ratings=await loadReviewAggregates();
    const decorate=()=>{
      $$('[data-business-id]').forEach(card=>{
        const id=card.dataset.businessId;if(!id)return;
        const heading=card.querySelector('h3');const agg=ratings.get(id);
        if(heading&&agg&&!card.querySelector('.rating-summary')){const r=document.createElement('div');r.className='rating-summary';r.innerHTML=`<span>★ ${Number(agg.sum/agg.count).toFixed(1)}</span><small>${agg.count} reseña${agg.count===1?'':'s'}</small>`;heading.insertAdjacentElement('afterend',r)}
        if(card.classList.contains('business-directory-card')&&!card.querySelector('.favorite-btn')){const btn=document.createElement('button');btn.type='button';btn.className=`favorite-btn ${favoriteIds.has(id)?'active':''}`;btn.setAttribute('aria-label','Guardar en favoritos');btn.textContent=favoriteIds.has(id)?'♥':'♡';btn.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();if(!user){location.href='login.html?mode=consumer&next=cuenta.html';return}btn.disabled=true;if(favoriteIds.has(id)){await sb.from(T_FAVORITES).delete().eq('user_id',user.id).eq('business_id',id);favoriteIds.delete(id);btn.classList.remove('active');btn.textContent='♡';toast('Quitado de favoritos.')}else{await sb.from(T_FAVORITES).insert({user_id:user.id,business_id:id});favoriteIds.add(id);btn.classList.add('active');btn.textContent='♥';toast('Guardado en favoritos.')}btn.disabled=false});card.querySelector('.business-directory-cover')?.appendChild(btn)}
      });
    };
    decorate();const target=$('#businessesGrid');if(target)new MutationObserver(decorate).observe(target,{childList:true,subtree:true});
    if(user){const name=user.user_metadata?.fila_cero_display_name||user.user_metadata?.full_name||'';if($('#clientName')&&!$('#clientName').value)$('#clientName').value=name;if($('#clientEmail'))$('#clientEmail').value=user.email||''}
  }

  function reportDialog(businessId,businessName){
    let modal=$('#reportModalV13');if(!modal){modal=document.createElement('div');modal.id='reportModalV13';modal.className='modal hidden';modal.innerHTML='<div class="modal-card report-modal-card"><button class="modal-close" type="button">×</button><span class="eyebrow">MODERACIÓN</span><h2>Reportar perfil</h2><p>Cuéntanos qué ocurre. El administrador de Fila Cero podrá revisarlo.</p><label>Motivo<select id="reportReason"><option>Contenido inapropiado</option><option>Información falsa o engañosa</option><option>Suplantación o fraude</option><option>Spam</option><option>Otro</option></select></label><label>Detalle<textarea id="reportDetails" rows="4" maxlength="1200" placeholder="Describe brevemente el problema"></textarea></label><button id="sendReportBtn" class="btn btn-danger btn-full" type="button">Enviar reporte</button></div>';document.body.appendChild(modal);modal.querySelector('.modal-close').onclick=()=>modal.classList.add('hidden');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')})}
    modal.dataset.businessId=businessId;modal.dataset.businessName=businessName;modal.classList.remove('hidden');
    $('#sendReportBtn').onclick=async()=>{const s=await session();if(!s){location.href=`login.html?mode=consumer&next=${encodeURIComponent('cuenta.html')}`;return}const btn=$('#sendReportBtn');btn.disabled=true;const {error}=await sb.from(T_REPORTS).insert({reporter_user_id:s.user.id,business_id:businessId,reason:$('#reportReason').value,details:$('#reportDetails').value.trim()});btn.disabled=false;if(error)return toast(error.message);modal.classList.add('hidden');toast('Reporte enviado. Gracias por ayudar a cuidar Fila Cero.')};
  }

  async function enhanceBusinessProfile(){
    const root=$('#businessPublicPage');if(!root)return;const id=new URLSearchParams(location.search).get('id');if(!id)return;
    const [{data:b},{data:reviews},s]=await Promise.all([sb.from(T_BUSINESSES).select('*').eq('id',id).maybeSingle(),sb.from(T_REVIEWS).select('id,rating,comment,created_at').eq('business_id',id).eq('status','visible').order('created_at',{ascending:false}).limit(50),session()]);if(!b||b.profile_enabled===false)return;
    try{if(!sessionStorage.getItem(`fc-view-${id}`)){await sb.rpc(RPC_VIEW,{p_business_id:id});sessionStorage.setItem(`fc-view-${id}`,'1')}}catch{}
    const cover=$('.business-cover-copy');if(cover&&!cover.querySelector('.profile-social-actions')){const actions=document.createElement('div');actions.className='profile-social-actions';const fav=document.createElement('button');fav.className='btn btn-light favorite-profile-btn';fav.type='button';let isFav=false;if(s){const {data}=await sb.from(T_FAVORITES).select('id').eq('user_id',s.user.id).eq('business_id',id).maybeSingle();isFav=!!data}fav.textContent=isFav?'♥ Guardado':'♡ Guardar';fav.onclick=async()=>{if(!s){location.href='login.html?mode=consumer&next=cuenta.html';return}fav.disabled=true;if(isFav){await sb.from(T_FAVORITES).delete().eq('user_id',s.user.id).eq('business_id',id);isFav=false;fav.textContent='♡ Guardar'}else{await sb.from(T_FAVORITES).insert({user_id:s.user.id,business_id:id});isFav=true;fav.textContent='♥ Guardado'}fav.disabled=false};const report=document.createElement('button');report.type='button';report.className='btn btn-ghost-light';report.textContent='Reportar';report.onclick=()=>reportDialog(id,b.name);actions.append(fav,report);cover.appendChild(actions)}
    const avg=(reviews||[]).length?(reviews.reduce((a,r)=>a+Number(r.rating),0)/reviews.length):0;
    const main=$('.business-public-grid > div');if(main&&!$('#businessReviewsV13')){const sec=document.createElement('section');sec.id='businessReviewsV13';sec.className='public-section reviews-section';sec.innerHTML=`<div class="review-section-heading"><div><span class="eyebrow">RESEÑAS</span><h2>Experiencias de usuarios</h2></div><div class="rating-hero"><strong>${avg?avg.toFixed(1):'—'}</strong><span>${avg?'★★★★★'.slice(0,Math.round(avg)):'Sin calificaciones'}</span><small>${(reviews||[]).length} reseña${(reviews||[]).length===1?'':'s'}</small></div></div><div class="reviews-list">${(reviews||[]).length?(reviews||[]).map(r=>`<article class="review-card"><div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div><p>${esc(r.comment||'Atención calificada por un usuario de Fila Cero.')}</p><small>Usuario de Fila Cero · ${esc(new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(r.created_at)))}</small></article>`).join(''):'<div class="dashboard-empty"><strong>Aún no hay reseñas.</strong><span>Las personas podrán calificar después de asistir a una hora reservada.</span></div>'}</div>`;main.appendChild(sec)}
  }

  async function initAccount(){
    const root=$('#userAccountPage');if(!root)return;const s=await session();if(!s){location.href='login.html?mode=consumer&next=cuenta.html';return}const user=s.user;
    $('#accountEmail').textContent=user.email||'';$('#accountName').textContent=user.user_metadata?.fila_cero_display_name||user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split('@')[0]||'Mi cuenta';
    $('#accountLogout').onclick=async()=>{await sb.auth.signOut();location.href='index.html'};
    const biz=window.FCAUTH?await FCAUTH.hasBusiness().catch(()=>null):null;const businessBtn=$('#accountBusinessBtn');businessBtn.href=biz?'profesional.html':'login.html?mode=business&next=profesional.html';businessBtn.textContent=biz?'Abrir mi empresa ↗':'Crear perfil profesional ↗';
    try{await sb.rpc(RPC_CLAIM)}catch{}

    async function loadHistory(){
      const {data:reservations,error}=await sb.from(T_RESERVATIONS).select('*').eq('customer_user_id',user.id).order('created_at',{ascending:false});if(error){$('#accountReservations').innerHTML=`<p>${esc(error.message)}</p>`;return}const rs=reservations||[];if(!rs.length){$('#accountReservations').innerHTML='<div class="dashboard-empty"><strong>Tu historial está vacío.</strong><span>Las reservas hechas con este correo aparecerán aquí.</span></div>';return}
      const slotIds=[...new Set(rs.map(r=>r.slot_id))];const {data:slots}=await sb.from(T_SLOTS).select('*').in('id',slotIds);const slotMap=new Map((slots||[]).map(x=>[x.id,x]));const businessIds=[...new Set(rs.map(r=>r.business_id))];const {data:businesses}=await sb.from(T_BUSINESSES).select('id,name,is_verified').in('id',businessIds);const bm=new Map((businesses||[]).map(x=>[x.id,x]));const {data:reviews}=await sb.from(T_REVIEWS).select('reservation_id,rating,comment').eq('user_id',user.id);const rm=new Map((reviews||[]).map(x=>[x.reservation_id,x]));
      $('#accountReservations').innerHTML=rs.map(r=>{const sl=slotMap.get(r.slot_id),b=bm.get(r.business_id),review=rm.get(r.id),past=sl?new Date(`${sl.slot_date}T${String(sl.start_time).slice(0,5)}`)<=new Date():false;return `<article class="account-reservation-card"><div><span class="reservation-status">${esc(String(r.status).toUpperCase())}</span><h3>${esc(sl?.service||'Reserva')}</h3><p>${esc(b?.name||'Centro')} ${b?.is_verified?'<span class="verified-inline">✓</span>':''}</p><small>${sl?`${date(sl.slot_date)} · ${esc(String(sl.start_time).slice(0,5))} · ${esc(sl.city)}`:''}</small></div><div class="account-reservation-actions">${b?`<a class="action-btn" href="empresa.html?id=${encodeURIComponent(b.id)}">Ver perfil</a>`:''}${past&&r.status!=='cancelled'?`<button class="action-btn review-reservation-btn" data-id="${esc(r.id)}" data-rating="${review?.rating||''}" data-comment="${esc(review?.comment||'')}">${review?'Editar reseña':'Calificar'}</button>`:''}</div></article>`}).join('');
      $$('.review-reservation-btn').forEach(btn=>btn.onclick=()=>openReview(btn.dataset.id,btn.dataset.rating,btn.dataset.comment));
    }
    function openReview(id,rating='',comment=''){const modal=$('#reviewModal');modal.dataset.reservationId=id;$('#reviewRating').value=rating||5;$('#reviewComment').value=comment||'';modal.classList.remove('hidden')}
    $('#closeReviewModal').onclick=()=>$('#reviewModal').classList.add('hidden');$('#reviewModal').addEventListener('click',e=>{if(e.target.id==='reviewModal')e.currentTarget.classList.add('hidden')});$('#saveReviewBtn').onclick=async()=>{const b=$('#saveReviewBtn');b.disabled=true;const {error}=await sb.rpc(RPC_REVIEW,{p_reservation_id:$('#reviewModal').dataset.reservationId,p_rating:Number($('#reviewRating').value),p_comment:$('#reviewComment').value.trim()});b.disabled=false;if(error)return toast(error.message);$('#reviewModal').classList.add('hidden');toast('Reseña guardada.');await loadHistory()};

    async function loadFavorites(){const {data:favs}=await sb.from(T_FAVORITES).select('business_id').eq('user_id',user.id).order('created_at',{ascending:false});const ids=(favs||[]).map(x=>x.business_id);if(!ids.length){$('#accountFavorites').innerHTML='<div class="dashboard-empty"><strong>Sin favoritos todavía.</strong><span>Guarda centros desde el directorio o sus perfiles.</span></div>';return}const {data:businesses}=await sb.from(T_BUSINESSES).select('*').in('id',ids);const map=new Map((businesses||[]).map(x=>[x.id,x]));$('#accountFavorites').innerHTML=ids.map(id=>map.get(id)).filter(Boolean).map(b=>`<article class="favorite-account-card"><div><h3>${esc(b.name)} ${b.is_verified?'<span class="verified-badge">✓ Verificado</span>':''}</h3><p>${esc(b.category)} · ${esc(b.city)}</p></div><div><a class="action-btn" href="empresa.html?id=${encodeURIComponent(b.id)}">Ver perfil</a><button class="action-btn danger remove-favorite" data-id="${esc(b.id)}">Quitar</button></div></article>`).join('');$$('.remove-favorite').forEach(btn=>btn.onclick=async()=>{await sb.from(T_FAVORITES).delete().eq('user_id',user.id).eq('business_id',btn.dataset.id);loadFavorites()})}

    const cat=$('#alertCategory'),city=$('#alertCity');cat.innerHTML='<option value="">Cualquier servicio</option>'+CATEGORIES.map(x=>`<option>${esc(x)}</option>`).join('');city.innerHTML='<option value="">Cualquier comuna</option>'+COMMUNES.map(x=>`<option>${esc(x)}</option>`).join('');
    async function loadAlerts(){const {data}=await sb.from(T_ALERTS).select('*').eq('user_id',user.id).order('created_at',{ascending:false});$('#alertList').innerHTML=(data||[]).length?(data||[]).map(a=>`<article class="alert-row"><div><strong>${esc(a.category||'Todos los servicios')}</strong><span>${esc(a.city||'Todo Gran Concepción')}</span></div><button class="action-btn danger delete-alert" data-id="${esc(a.id)}">Eliminar</button></article>`).join(''):'<div class="dashboard-empty"><strong>No tienes alertas.</strong><span>Crea una y te avisaremos cuando aparezca un cupo que coincida.</span></div>';$$('.delete-alert').forEach(btn=>btn.onclick=async()=>{await sb.from(T_ALERTS).delete().eq('id',btn.dataset.id);loadAlerts()})}
    $('#addAlertBtn').onclick=async()=>{const {error}=await sb.from(T_ALERTS).insert({user_id:user.id,category:cat.value||null,city:city.value||null,enabled:true});if(error)return toast(error.message);toast('Alerta creada.');await loadAlerts()};

    async function loadNotifications(){const {data}=await sb.from(T_NOTIFICATIONS).select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);const rows=data||[];$('#notificationCount').textContent=rows.filter(n=>!n.read_at).length;$('#notificationList').innerHTML=rows.length?rows.map(n=>`<article class="notification-row ${n.read_at?'':'unread'}"><div><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${esc(new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(n.created_at)))}</small></div>${n.slot_id?`<a class="action-btn" href="index.html?book=${encodeURIComponent(n.slot_id)}">Ver hora</a>`:''}</article>`).join(''):'<div class="dashboard-empty"><strong>Sin notificaciones.</strong><span>Las nuevas horas que coincidan con tus alertas aparecerán aquí.</span></div>'}
    $('#markNotificationsRead').onclick=async()=>{await sb.from(T_NOTIFICATIONS).update({read_at:new Date().toISOString()}).eq('user_id',user.id).is('read_at',null);loadNotifications()};
    $('#enableBrowserNotifications').onclick=async()=>{if(!('Notification'in window))return toast('Este navegador no admite notificaciones.');const p=await Notification.requestPermission();toast(p==='granted'?'Notificaciones del navegador habilitadas.':'No se otorgó permiso para notificaciones.')};
    const ch=sb.channel(`fc-notifications-${user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:T_NOTIFICATIONS,filter:`user_id=eq.${user.id}`},payload=>{const n=payload.new;if('Notification'in window&&Notification.permission==='granted')new Notification(n.title,{body:n.body});loadNotifications()}).subscribe();window.addEventListener('beforeunload',()=>sb.removeChannel(ch));
    await Promise.all([loadHistory(),loadFavorites(),loadAlerts(),loadNotifications()]);
  }

  async function initProfessionalStats(){
    const root=$('#businessStatsV13');if(!root)return;
    async function load(){const {data,error}=await sb.rpc(RPC_STATS);if(error){root.innerHTML='<div class="dashboard-empty"><strong>Estadísticas no disponibles.</strong><span>Ejecuta el SQL Patch v0.13 en Supabase.</span></div>';return}const x=Array.isArray(data)?data[0]:data;if(!x)return;$('#statViews').textContent=Number(x.profile_views||0);$('#statReservations').textContent=Number(x.reservations_total||0);$('#statRating').textContent=Number(x.rating_average||0)?`${Number(x.rating_average).toFixed(1)} ★`:'—';$('#statConversion').textContent=`${Number(x.conversion_rate||0).toFixed(1)}%`;$('#statsDetail').innerHTML=`<div><span>Horas publicadas</span><strong>${Number(x.slots_total||0)}</strong></div><div><span>Horas activas</span><strong>${Number(x.slots_active||0)}</strong></div><div><span>Confirmadas</span><strong>${Number(x.reservations_confirmed||0)}</strong></div><div><span>Canceladas</span><strong>${Number(x.reservations_cancelled||0)}</strong></div><div><span>Reseñas</span><strong>${Number(x.reviews_total||0)}</strong></div>`}
    await load();const ch=sb.channel('fc-business-stats-live').on('postgres_changes',{event:'*',schema:'public',table:T_RESERVATIONS},load).on('postgres_changes',{event:'*',schema:'public',table:T_REVIEWS},load).on('postgres_changes',{event:'*',schema:'public',table:T_SLOTS},load).subscribe();window.addEventListener('beforeunload',()=>{try{sb.removeChannel(ch)}catch{}})
  }

  async function initAdminExtras(){
    if(!$('#adminPage'))return;let reports=[];
    async function decorate(){const cards=$$('.admin-business-card');cards.forEach(card=>{if(card.querySelector('.verify-admin-btn'))return;const id=card.dataset.businessId;const row=window.__fcAdminBusinesses?.find?.(x=>x.id===id);const actions=card.querySelector('.admin-business-actions');if(!actions)return;const btn=document.createElement('button');btn.type='button';btn.className='action-btn verify-admin-btn';btn.textContent=row?.is_verified?'Quitar verificación':'✓ Verificar';btn.onclick=async()=>{btn.disabled=true;const {error}=await sb.rpc(RPC_VERIFY,{p_business_id:id,p_verified:!(row?.is_verified)});if(error){btn.disabled=false;return toast(error.message)}location.reload()};actions.prepend(btn)})}
    const list=$('#adminBusinessList');if(list)new MutationObserver(decorate).observe(list,{childList:true,subtree:true});
    async function loadReports(){const {data,error}=await sb.rpc(RPC_ADMIN_REPORTS);if(error){$('#adminReportsList').innerHTML=`<p>${esc(error.message)}</p>`;return}reports=data||[];$('#adminReportCount').textContent=reports.filter(r=>r.status==='open').length;$('#adminReportsList').innerHTML=reports.length?reports.map(r=>`<article class="admin-report-card"><div><span class="reservation-status">${esc(r.status.toUpperCase())}</span><h3>${esc(r.business_name)}</h3><strong>${esc(r.reason)}</strong><p>${esc(r.details||'Sin detalle adicional.')}</p><small>Reportado por ${esc(r.reporter_email||'usuario')} · ${esc(new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.created_at)))}</small></div><div class="admin-report-actions"><a class="action-btn" href="empresa.html?id=${encodeURIComponent(r.business_id)}" target="_blank">Ver perfil</a><button class="action-btn report-status" data-id="${esc(r.id)}" data-status="reviewed">Revisado</button><button class="action-btn report-status" data-id="${esc(r.id)}" data-status="dismissed">Descartar</button><button class="action-btn report-status" data-id="${esc(r.id)}" data-status="actioned">Acción tomada</button></div></article>`).join(''):'<div class="dashboard-empty"><strong>No hay reportes.</strong><span>Todo tranquilo por ahora.</span></div>';$$('.report-status').forEach(btn=>btn.onclick=async()=>{await sb.rpc(RPC_ADMIN_REPORT_UPDATE,{p_report_id:btn.dataset.id,p_status:btn.dataset.status});loadReports()})}
    await loadReports();setTimeout(decorate,500);
  }

  async function initGlobalNotifications(){
    const s=await session();if(!s)return;
    async function refresh(){const {count}=await sb.from(T_NOTIFICATIONS).select('*',{count:'exact',head:true}).eq('user_id',s.user.id).is('read_at',null);$$('[data-notification-count]').forEach(x=>{x.textContent=count?String(count):'';x.classList.toggle('hidden',!count)})}
    await refresh();
    if(!$('#userAccountPage')){const ch=sb.channel(`fc-global-notifications-${s.user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:T_NOTIFICATIONS,filter:`user_id=eq.${s.user.id}`},payload=>{const n=payload.new;if('Notification'in window&&Notification.permission==='granted')new Notification(n.title,{body:n.body});refresh()}).subscribe();window.addEventListener('beforeunload',()=>{try{sb.removeChannel(ch)}catch{}})}
  }

  document.addEventListener('DOMContentLoaded',()=>{enhanceFooter();enhanceNav().catch(()=>{});enhanceMarketplace().catch(console.error);enhanceBusinessProfile().catch(console.error);initAccount().catch(console.error);initProfessionalStats().catch(console.error);initAdminExtras().catch(console.error);initGlobalNotifications().catch(()=>{})});
})();
