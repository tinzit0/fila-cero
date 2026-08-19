function localDateString(date){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
const NOW_DATE=new Date(),TOMORROW_DATE=new Date(NOW_DATE);TOMORROW_DATE.setDate(TOMORROW_DATE.getDate()+1);
const TODAY_STR=localDateString(NOW_DATE),TOMORROW_STR=localDateString(TOMORROW_DATE);
const SUPPORTED_COMMUNES=['Concepción','Talcahuano','Hualpén','San Pedro de la Paz','Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'];
const ICONS={'Dental':'🦷','Kinesiología':'◈','Veterinaria':'🐾','Psicología':'◎','Nutrición':'◇','Otro':'⚡'};
const sb=window.FC_SUPABASE;
const FCDB=window.FC_CONFIG?.db||{};
const T_BUSINESSES=FCDB.businessesTable||'fila_cero_businesses';
const T_SLOTS=FCDB.slotsTable||'fila_cero_slots';
const T_RESERVATIONS=FCDB.reservationsTable||'fila_cero_reservations';
const RPC_BOOK_SLOT=FCDB.bookingRpc||'fila_cero_book_slot';
const money=n=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const escapeHtml=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const formatDate=d=>new Intl.DateTimeFormat('es-CL',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${d}T12:00:00`));
const parseSlotDate=s=>new Date(`${s.date}T${s.time}:00`);
const isExpired=s=>parseSlotDate(s).getTime()<Date.now()-5*60*1000;
const googleMapsKey=()=>String(window.FC_CONFIG?.googleMapsApiKey||'').trim();
const safeHttpUrl=value=>{try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return''}};
const safeDigits=value=>String(value||'').replace(/\D/g,'');
const fullLocation=s=>`${s.address||''}${s.sector?`, ${s.sector}`:''}, ${s.city||'Concepción'}, Región del Biobío, Chile`;
const buildMapsSearchUrl=s=>`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullLocation(s))}`;
const businessLink=s=>s.businessId?`empresa.html?id=${encodeURIComponent(s.businessId)}`:'#';

function showToast(message){const t=document.getElementById('toast');if(!t)return;t.textContent=message;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),3600)}
function mapFallbackHtml(s){return `<div class="map-fallback"><div class="map-pin">⌖</div><h3>${escapeHtml(s.provider||s.name)}</h3><p>${escapeHtml(fullLocation(s))}</p><a class="btn btn-dark" href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener">Abrir en Google Maps <span>↗</span></a><p><small>Agrega tu API key de Google Maps en <b>config.js</b> para incrustar el mapa.</small></p></div>`}
function renderGoogleMap(container,s){if(!container||!s)return;const key=googleMapsKey();if(!key){container.innerHTML=mapFallbackHtml(s);return}const params=new URLSearchParams({key,q:fullLocation(s),zoom:'16'});container.innerHTML=`<iframe title="Mapa de ${escapeHtml(s.provider||s.name)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="https://www.google.com/maps/embed/v1/place?${params}"></iframe>`}
function normalizeSlot(row,business=null){const b=business||row.business||null;return {id:row.id,businessId:row.business_id,provider:b?.name||'Centro profesional',service:row.service,category:row.category,city:row.city,sector:row.sector||'',date:row.slot_date,time:String(row.start_time||'').slice(0,5),normalPrice:Number(row.normal_price||0),price:Number(row.fila_price||0),duration:Number(row.duration_minutes||30),address:row.address,status:row.status,createdAt:row.created_at,business:b||null}}
function humanError(err){const msg=String(err?.message||err||'Error inesperado');if(msg.includes('SLOT_UNAVAILABLE')||msg.includes('duplicate key value'))return 'Ese cupo acaba de ser reservado por otra persona.';if(msg.includes('Invalid login credentials'))return 'Correo o contraseña incorrectos.';return msg}

async function initTopbar(){const link=document.querySelector('[data-account-link]');if(!link||!window.FCAUTH)return;try{const session=await FCAUTH.getSession();link.href=session?'profesional.html':'login.html';link.textContent=session?'Mi empresa':'Crear cuenta / Iniciar sesión'}catch{link.href='login.html'}}

async function initMarketplace(){
  const grid=document.getElementById('slotsGrid');if(!grid||!sb)return;
  const serviceFilter=document.getElementById('serviceFilter'),cityFilter=document.getElementById('cityFilter'),timeFilter=document.getElementById('timeFilter'),sortSelect=document.getElementById('sortSelect'),resultsText=document.getElementById('resultsText'),empty=document.getElementById('emptyState'),modal=document.getElementById('bookingModal'),mapModal=document.getElementById('mapModal');
  let slots=[],selectedSlot=null,loading=false;

  async function loadSlots(){
    if(loading)return;loading=true;
    const {data,error}=await sb.from(T_SLOTS).select('id,business_id,service,category,city,sector,address,slot_date,start_time,duration_minutes,normal_price,fila_price,status,created_at').eq('status','active').gte('slot_date',TODAY_STR).order('slot_date',{ascending:true}).order('start_time',{ascending:true});
    if(error){loading=false;console.error(error);resultsText.textContent='No pudimos cargar los cupos. Revisa que hayas ejecutado el SQL v0.7 de Fila Cero.';return}
    const rows=data||[];
    const businessIds=[...new Set(rows.map(r=>r.business_id).filter(Boolean))];
    const businessMap=new Map();
    if(businessIds.length){
      const bizReq=await sb.from(T_BUSINESSES).select('id,name,category,description,whatsapp,instagram,website,portfolio_urls,is_active').in('id',businessIds);
      if(bizReq.error){loading=false;console.error(bizReq.error);resultsText.textContent='No pudimos cargar los centros profesionales.';return}
      (bizReq.data||[]).forEach(b=>businessMap.set(b.id,b));
    }
    loading=false;
    slots=rows.map(r=>normalizeSlot(r,businessMap.get(r.business_id)||null)).filter(s=>s.business&&SUPPORTED_COMMUNES.includes(s.city)&&!isExpired(s));
    render();renderReservations();
  }

  function filteredSlots(){
    let items=slots.slice(),service=serviceFilter.value,commune=cityFilter.value,tf=timeFilter.value;
    if(service!=='todos')items=items.filter(s=>s.category===service);
    if(commune!=='todas')items=items.filter(s=>s.city===commune);
    const now=new Date();
    if(tf==='2h')items=items.filter(s=>{const d=parseSlotDate(s);return d>=now&&d-now<=7200000});
    if(tf==='hoy')items=items.filter(s=>s.date===TODAY_STR);
    if(tf==='manana')items=items.filter(s=>s.date===TOMORROW_STR);
    if(sortSelect.value==='precio')items.sort((a,b)=>a.price-b.price);
    else if(sortSelect.value==='reciente')items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    else items.sort((a,b)=>parseSlotDate(a)-parseSlotDate(b));
    return items;
  }

  function renderLatestSlot(){const box=document.getElementById('latestSlotCard');if(!box)return;const items=slots.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)),s=items[0];const count=document.getElementById('heroActiveCount');if(count)count.textContent=slots.length;if(!s){box.innerHTML='<p class="provider">No hay cupos activos en este momento.</p>';return}box.innerHTML=`<div class="category-line">${escapeHtml(s.category)} · ${escapeHtml(s.city)}</div><h3>${escapeHtml(s.service)}</h3><p class="provider">${escapeHtml(s.provider)}</p><div class="slot-time-big">${formatDate(s.date)} · ${escapeHtml(s.time)}</div><div class="showcase-bottom"><div><div class="price">${money(s.price)}</div><small>${escapeHtml(s.address)}</small></div><a class="map-link latest-map-link" href="#">Ver ubicación ↗</a></div>`;box.querySelector('.latest-map-link')?.addEventListener('click',e=>{e.preventDefault();openMap(s.id)})}

  function render(){
    const items=filteredSlots(),zone=cityFilter.value==='todas'?'en Gran Concepción':`en ${cityFilter.value}`;
    resultsText.textContent=`${items.length} ${items.length===1?'cupo disponible':'cupos disponibles'} ${zone}.`;
    empty.classList.toggle('hidden',items.length>0);
    grid.innerHTML=items.map(s=>{const savings=s.normalPrice>0?Math.max(0,Math.round((1-s.price/s.normalPrice)*100)):0;return `<article class="slot-card"><div class="slot-top"><div class="service-icon">${ICONS[s.category]||'⚡'}</div><span class="badge-live">● DISPONIBLE</span></div><div><h3>${escapeHtml(s.service)}</h3><a class="provider provider-link" href="${businessLink(s)}">${escapeHtml(s.provider)} ↗</a></div><div class="meta-list"><div class="meta-row">◷ <span>${formatDate(s.date)} · <strong>${escapeHtml(s.time)}</strong> · ${Number(s.duration)} min</span></div><div class="meta-row">⌖ <span>${escapeHtml(s.address)}${s.sector?` · ${escapeHtml(s.sector)}`:''}<br><b>${escapeHtml(s.city)}</b></span></div></div><div class="location-actions"><button class="map-btn show-map-btn" type="button" data-id="${escapeHtml(s.id)}">⌖ Ver mapa</button><a class="map-btn" href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener">Cómo llegar ↗</a></div><div class="slot-bottom"><div><div class="price-old">${money(s.normalPrice)}</div><div class="price-new">${money(s.price)}</div>${savings?`<div class="savings">${savings}% menos que el valor normal</div>`:''}</div><button class="btn btn-accent reserve-btn" data-id="${escapeHtml(s.id)}">Reservar <span>→</span></button></div></article>`}).join('');
    grid.querySelectorAll('.reserve-btn').forEach(b=>b.addEventListener('click',()=>openBooking(b.dataset.id)));
    grid.querySelectorAll('.show-map-btn').forEach(b=>b.addEventListener('click',()=>openMap(b.dataset.id)));
    renderLatestSlot();
  }

  function openBooking(id){selectedSlot=slots.find(s=>s.id===id);if(!selectedSlot)return showToast('Ese cupo ya no está disponible.');document.getElementById('bookingSummary').innerHTML=`<strong>${escapeHtml(selectedSlot.service)}</strong><div><a class="provider-link" href="${businessLink(selectedSlot)}">${escapeHtml(selectedSlot.provider)} ↗</a></div><div>${formatDate(selectedSlot.date)} · ${escapeHtml(selectedSlot.time)} · ${Number(selectedSlot.duration)} min</div><div class="summary-address">⌖ ${escapeHtml(fullLocation(selectedSlot))}</div><div style="margin-top:9px;font-weight:950;font-size:22px">${money(selectedSlot.price)}</div>`;renderGoogleMap(document.getElementById('bookingMap'),selectedSlot);modal.classList.remove('hidden')}
  function openMap(id){const s=slots.find(x=>x.id===id);if(!s)return;document.getElementById('mapTitle').textContent=s.provider;document.getElementById('mapModalMeta').innerHTML=`${escapeHtml(s.service)} · ${escapeHtml(fullLocation(s))} · <a href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener"><strong>Abrir navegación ↗</strong></a>`;renderGoogleMap(document.getElementById('mapModalContent'),s);mapModal.classList.remove('hidden')}

  document.getElementById('closeModal').addEventListener('click',()=>modal.classList.add('hidden'));modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
  document.getElementById('closeMapModal').addEventListener('click',()=>mapModal.classList.add('hidden'));mapModal.addEventListener('click',e=>{if(e.target===mapModal)mapModal.classList.add('hidden')});
  document.getElementById('bookingForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!selectedSlot)return;
    const button=e.submitter||e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Reservando…';
    try{
      const {data,error}=await sb.rpc(RPC_BOOK_SLOT,{p_slot_id:selectedSlot.id,p_client_name:clientName.value.trim(),p_client_email:clientEmail.value.trim(),p_client_phone:clientPhone.value.trim()});
      if(error)throw error;
      const receipt={id:data?.[0]?.reservation_id||crypto.randomUUID?.()||String(Date.now()),slot:{...selectedSlot},clientName:clientName.value.trim(),createdAt:new Date().toISOString(),status:'confirmed'};
      const current=JSON.parse(localStorage.getItem('fc_my_reservations')||'[]');current.push(receipt);localStorage.setItem('fc_my_reservations',JSON.stringify(current));
      e.target.reset();modal.classList.add('hidden');showToast('¡Reserva confirmada! El centro ya puede verla en su panel.');await loadSlots();
    }catch(err){showToast(humanError(err));await loadSlots()}finally{button.disabled=false;button.innerHTML='Confirmar reserva <span>→</span>'}
  });

  document.getElementById('searchForm').addEventListener('submit',e=>{e.preventDefault();render();document.getElementById('disponibles').scrollIntoView()});
  [serviceFilter,cityFilter,timeFilter,sortSelect].forEach(el=>el.addEventListener('change',render));
  document.querySelectorAll('.chip').forEach(chip=>chip.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');serviceFilter.value=chip.dataset.service;render()}));

  function renderReservations(){const box=document.getElementById('reservationsList');if(!box)return;let rs=[];try{rs=JSON.parse(localStorage.getItem('fc_my_reservations')||'[]')}catch{}if(!rs.length){box.innerHTML='<div class="empty"><div class="empty-icon">◇</div><h3>Aún no tienes reservas</h3><p>Cuando tomes un cupo aparecerá aquí.</p></div>';return}box.innerHTML=rs.slice().reverse().map(r=>{const s=r.slot;return s?`<article class="reservation-item"><div><h3>${escapeHtml(s.service)} · ${escapeHtml(s.provider)}</h3><p>${formatDate(s.date)} · ${escapeHtml(s.time)} · ${escapeHtml(s.city)} · ${money(s.price)}</p></div><span class="reservation-status">CONFIRMADA</span></article>`:''}).join('')}

  const channel=sb.channel('fila-cero-marketplace').on('postgres_changes',{event:'*',schema:'public',table:T_SLOTS},()=>loadSlots()).on('postgres_changes',{event:'UPDATE',schema:'public',table:T_BUSINESSES},()=>loadSlots()).subscribe();
  window.addEventListener('beforeunload',()=>{try{sb.removeChannel(channel)}catch{}});
  await loadSlots();
  const q=new URLSearchParams(location.search).get('book');if(q)setTimeout(()=>openBooking(q),150);
}

async function initProfessional(){
  const form=document.getElementById('publishForm');if(!form||!sb||!window.FCAUTH)return;
  let business;
  try{business=await FCAUTH.requireBusiness();if(!business)return}catch(err){showToast(humanError(err));return}
  const user=await FCAUTH.currentUser();let slots=[],reservations=[];
  const today=TODAY_STR;slotDate.min=today;slotDate.value=today;
  businessHeroName.textContent=business.name;publicProfileLink.href=`empresa.html?id=${encodeURIComponent(business.id)}`;profilePreviewButton.href=publicProfileLink.href;
  logoutBtn.addEventListener('click',async()=>{try{await FCAUTH.logout();location.href='login.html'}catch(err){showToast(humanError(err))}});

  function mapOwnedSlot(row){return normalizeSlot(row,business)}
  function profileScore(b){const fields=['name','category','city','address','description','whatsapp'];return Math.round(fields.filter(k=>String(b[k]||'').trim()).length/fields.length*100)}
  function loadProfile(){profileName.value=business.name||'';profileCategory.value=business.category||'Otro';profileDescription.value=business.description||'';profileCity.value=business.city||'Concepción';profileSector.value=business.sector||'';profileAddress.value=business.address||'';profileWhatsapp.value=business.whatsapp||'';profileInstagram.value=business.instagram||'';profileWebsite.value=business.website||'';const p=business.portfolio||[];portfolio1.value=p[0]||'';portfolio2.value=p[1]||'';portfolio3.value=p[2]||'';profileCompletion.textContent=`${profileScore(business)}%`;businessHeroName.textContent=business.name}

  async function loadDashboard(){
    const slotReq=await sb.from(T_SLOTS).select('*').eq('business_id',business.id).order('created_at',{ascending:false});
    if(slotReq.error)throw slotReq.error;
    slots=(slotReq.data||[]).map(mapOwnedSlot);
    const resReq=await sb.from(T_RESERVATIONS).select('id,slot_id,business_id,client_name,client_email,client_phone,status,created_at').eq('business_id',business.id).order('created_at',{ascending:false});
    if(resReq.error)throw resReq.error;
    reservations=resReq.data||[];
    renderPro();
  }

  function renderLivePreview(){const box=professionalLivePreview,s=slots.filter(s=>s.status==='active'&&!isExpired(s)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];if(!s){box.innerHTML='<div class="preview-empty">Publica tu primer cupo para verlo aquí.</div>';return}box.innerHTML=`<article class="preview-card"><div class="preview-top"><div class="service-icon">${ICONS[s.category]||'⚡'}</div><span class="badge-live">● DISPONIBLE</span></div><h3>${escapeHtml(s.service)}</h3><p>${escapeHtml(s.provider)}</p><div class="preview-time">${formatDate(s.date)} · ${escapeHtml(s.time)}</div><p>⌖ ${escapeHtml(s.address)}, ${escapeHtml(s.city)}</p><div class="preview-bottom"><div><div class="price-old">${money(s.normalPrice)}</div><div class="preview-price">${money(s.price)}</div></div><span class="reservation-status">EN VIVO</span></div></article>`}
  function renderReservationsForBusiness(){const box=businessReservations;if(!reservations.length){box.innerHTML='<div class="dashboard-empty"><strong>Aún no hay horas reservadas.</strong><span>Cuando una persona tome uno de tus cupos, aparecerá aquí con sus datos de contacto.</span></div>';return}box.innerHTML=reservations.map(r=>{const s=slots.find(x=>x.id===r.slot_id);return `<article class="booking-row"><div class="booking-client"><span class="client-avatar">${escapeHtml((r.client_name||'?')[0])}</span><div><strong>${escapeHtml(r.client_name)}</strong><small>${escapeHtml(r.client_email)} · ${escapeHtml(r.client_phone)}</small></div></div><div><strong>${escapeHtml(s?.service||'Cupo reservado')}</strong><small>${s?.date?formatDate(s.date):''} · ${escapeHtml(String(s?.time||''))}</small></div><div><span class="reservation-status">${escapeHtml(String(r.status||'confirmed').toUpperCase())}</span></div></article>`}).join('')}
  function renderPro(){const active=slots.filter(s=>s.status==='active'&&!isExpired(s)),booked=slots.filter(s=>s.status==='reserved');activeSlotsCount.textContent=active.length;bookedSlotsCount.textContent=reservations.filter(r=>r.status==='confirmed').length;if(!slots.length)professionalSlots.innerHTML='<p class="muted-small">Todavía no has publicado cupos.</p>';else professionalSlots.innerHTML=slots.map(s=>`<div class="pro-slot"><strong>${escapeHtml(s.service)}</strong><small>${formatDate(s.date)} · ${escapeHtml(s.time)} · ${escapeHtml(s.city)}<br>${money(s.price)}</small><div class="pro-slot-actions"><span class="reservation-status">${s.status==='reserved'?'RESERVADO':s.status==='cancelled'?'CANCELADO':isExpired(s)?'VENCIDO':'ACTIVO'}</span>${s.status==='active'?`<button class="delete-btn" data-id="${escapeHtml(s.id)}">Cancelar cupo</button>`:''}</div></div>`).join('');professionalSlots.querySelectorAll('.delete-btn').forEach(btn=>btn.addEventListener('click',async()=>{const {error}=await sb.from(T_SLOTS).update({status:'cancelled'}).eq('id',btn.dataset.id).eq('business_id',business.id);if(error)return showToast(humanError(error));showToast('Cupo cancelado.');await loadDashboard()}));renderLivePreview();renderReservationsForBusiness()}

  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!business.address||!business.city)return showToast('Completa primero la dirección y comuna de tu perfil público.');
    const payload={business_id:business.id,service:serviceName.value.trim(),category:category.value,city:business.city,sector:business.sector||'',address:business.address,slot_date:slotDate.value,start_time:slotTime.value,duration_minutes:Number(duration.value),normal_price:Number(normalPrice.value),fila_price:Number(filaPrice.value),status:'active'};
    if(payload.fila_price>payload.normal_price)return showToast('El precio Fila Cero no puede superar el precio normal.');
    if(new Date(`${payload.slot_date}T${payload.start_time}:00`)<new Date(Date.now()-300000))return showToast('La hora debe ser futura.');
    const button=e.submitter||e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Publicando…';
    try{const {error}=await sb.from(T_SLOTS).insert(payload);if(error)throw error;form.reset();slotDate.value=today;duration.value='60';showToast('¡Hora publicada en Supabase! Ya aparece en el marketplace.');await loadDashboard()}catch(err){showToast(humanError(err))}finally{button.disabled=false;button.innerHTML='Publicar hora <span>→</span>'}
  });

  businessProfileForm.addEventListener('submit',async e=>{
    e.preventDefault();const button=e.submitter||e.currentTarget.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Guardando…';
    try{
      let portfolio=[portfolio1.value.trim(),portfolio2.value.trim(),portfolio3.value.trim()].map(safeHttpUrl).filter(Boolean);
      const fileInput=document.getElementById('portfolioFiles');
      if(fileInput?.files?.length){portfolio=await FCAUTH.uploadPortfolio(fileInput.files)}
      business=await FCAUTH.updateBusiness({name:profileName.value.trim(),category:profileCategory.value,description:profileDescription.value.trim(),city:profileCity.value,sector:profileSector.value.trim(),address:profileAddress.value.trim(),whatsapp:safeDigits(profileWhatsapp.value),instagram:profileInstagram.value.replace(/^@/,'').trim(),website:safeHttpUrl(profileWebsite.value),portfolio_urls:portfolio.slice(0,3)});
      await sb.from(T_SLOTS).update({city:business.city,sector:business.sector||'',address:business.address}).eq('business_id',business.id).eq('status','active');
      publicProfileLink.href=`empresa.html?id=${encodeURIComponent(business.id)}`;profilePreviewButton.href=publicProfileLink.href;loadProfile();showToast('Perfil público guardado en Supabase.');await loadDashboard()
    }catch(err){showToast(humanError(err))}finally{button.disabled=false;button.innerHTML='Guardar perfil público <span>→</span>'}
  });

  const channel=sb.channel(`fila-cero-business-${business.id}`).on('postgres_changes',{event:'*',schema:'public',table:T_SLOTS,filter:`business_id=eq.${business.id}`},()=>loadDashboard()).on('postgres_changes',{event:'*',schema:'public',table:T_RESERVATIONS,filter:`business_id=eq.${business.id}`},()=>loadDashboard()).on('postgres_changes',{event:'UPDATE',schema:'public',table:T_BUSINESSES,filter:`id=eq.${business.id}`},async()=>{business=await FCAUTH.currentBusiness();loadProfile()}).subscribe();
  window.addEventListener('beforeunload',()=>{try{sb.removeChannel(channel)}catch{}});
  loadProfile();try{await loadDashboard()}catch(err){showToast(humanError(err))}
}

async function initBusinessProfile(){
  const root=document.getElementById('businessPublicPage');if(!root||!sb||!window.FCAUTH)return;
  const id=new URLSearchParams(location.search).get('id');let business;
  try{business=await FCAUTH.getBusiness(id)}catch(err){console.error(err)}
  if(!business){root.innerHTML='<section class="section"><div class="empty"><h2>Perfil no encontrado</h2><p>Este centro todavía no tiene un perfil público disponible.</p><a class="btn btn-dark" href="index.html">Volver al marketplace</a></div></section>';return}

  async function loadPublicSlots(){const {data,error}=await sb.from(T_SLOTS).select('*').eq('business_id',business.id).eq('status','active').gte('slot_date',TODAY_STR).order('slot_date',{ascending:true}).order('start_time',{ascending:true});if(error)throw error;return (data||[]).map(r=>normalizeSlot(r,business)).filter(s=>!isExpired(s))}
  function renderBusiness(){businessName.textContent=business.name;businessCategoryBadge.textContent=(business.category||'CENTRO PROFESIONAL').toUpperCase();businessLocation.textContent=`${business.sector?business.sector+' · ':''}${business.city}`;businessDescription.textContent=business.description||'Este centro todavía no ha agregado una descripción pública.';businessAvatar.textContent=(business.name||'FC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();asideBusinessName.textContent=business.name;asideAddress.textContent=`${business.address||'Dirección por completar'}${business.sector?`, ${business.sector}`:''}, ${business.city}`;
    const contacts=[];const wa=safeDigits(business.whatsapp);if(wa)contacts.push(`<a class="btn btn-whatsapp" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp <span>↗</span></a>`);const ig=String(business.instagram||'').replace(/[^a-zA-Z0-9._]/g,'');if(ig)contacts.push(`<a class="btn btn-outline" href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram <span>↗</span></a>`);const web=safeHttpUrl(business.website);if(web)contacts.push(`<a class="btn btn-outline" href="${escapeHtml(web)}" target="_blank" rel="noopener">Sitio web <span>↗</span></a>`);businessContacts.innerHTML=contacts.join('')||'<span class="muted-small">Este centro todavía no ha publicado canales de contacto.</span>';
    const portfolio=(business.portfolio||[]).map(safeHttpUrl).filter(Boolean);businessPortfolio.innerHTML=portfolio.length?portfolio.map((url,i)=>`<figure class="portfolio-item"><img src="${escapeHtml(url)}" alt="Portafolio de ${escapeHtml(business.name)} ${i+1}" loading="lazy"><figcaption>Portafolio ${i+1}</figcaption></figure>`).join(''):'<div class="portfolio-placeholder"><span>＋</span><p>Este centro todavía no ha agregado fotografías.</p></div>';
    renderGoogleMap(businessMap,{...business,provider:business.name})
  }
  async function renderSlots(){try{const slots=await loadPublicSlots();businessSlots.innerHTML=slots.length?slots.map(s=>`<article class="profile-slot"><div><span class="viz-category">${escapeHtml(s.category)}</span><h3>${escapeHtml(s.service)}</h3><p>${formatDate(s.date)} · <strong>${escapeHtml(s.time)}</strong> · ${Number(s.duration)} min</p></div><div class="profile-slot-price"><strong>${money(s.price)}</strong><a class="btn btn-accent btn-small" href="index.html?book=${encodeURIComponent(s.id)}">Reservar</a></div></article>`).join(''):'<div class="dashboard-empty"><strong>Sin cupos disponibles por ahora.</strong><span>Puedes contactar directamente al centro o volver más tarde.</span></div>'}catch(err){businessSlots.innerHTML='<div class="dashboard-empty"><strong>No pudimos cargar los cupos.</strong><span>Intenta nuevamente en unos segundos.</span></div>';console.error(err)}}
  renderBusiness();await renderSlots();
  const channel=sb.channel(`fila-cero-profile-${business.id}`).on('postgres_changes',{event:'*',schema:'public',table:T_SLOTS,filter:`business_id=eq.${business.id}`},renderSlots).on('postgres_changes',{event:'UPDATE',schema:'public',table:T_BUSINESSES,filter:`id=eq.${business.id}`},async()=>{business=await FCAUTH.getBusiness(business.id);renderBusiness()}).subscribe();
  window.addEventListener('beforeunload',()=>{try{sb.removeChannel(channel)}catch{}})
}

document.addEventListener('DOMContentLoaded',()=>{
  initTopbar();
  initMarketplace().catch(console.error);
  initProfessional().catch(console.error);
  initBusinessProfile().catch(console.error);
});
