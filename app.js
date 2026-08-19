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
const RPC_CANCEL_RESERVATION=FCDB.cancelReservationRpc||'fila_cero_cancel_reservation';
const RPC_DELETE_RESERVATION=FCDB.deleteReservationRpc||'fila_cero_delete_reservation';
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
const businessLink=s=>s.businessId&&s.business?.profile_enabled!==false?`empresa.html?id=${encodeURIComponent(s.businessId)}`:'#';
const MAP_CFG=window.FC_CONFIG?.maps||{};
const geocodeCache=new Map();
let lastGeocodeRequest=0;

function showToast(message){const t=document.getElementById('toast');if(!t)return;t.textContent=message;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),3600)}
function ensurePortfolioLightbox(){
  let box=document.getElementById('portfolioLightbox');if(box)return box;
  box=document.createElement('div');box.id='portfolioLightbox';box.className='portfolio-lightbox hidden';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.innerHTML=`<button class="portfolio-lightbox-close" type="button" aria-label="Cerrar">×</button><button class="portfolio-lightbox-nav prev" type="button" aria-label="Imagen anterior">‹</button><div class="portfolio-lightbox-stage"><img alt="Imagen ampliada del portafolio"><div class="portfolio-lightbox-caption"></div></div><button class="portfolio-lightbox-nav next" type="button" aria-label="Imagen siguiente">›</button>`;document.body.appendChild(box);return box
}
function openPortfolioViewer(urls,startIndex=0,title='Portafolio'){
  const items=(urls||[]).map(safeHttpUrl).filter(Boolean);if(!items.length)return;
  const box=ensurePortfolioLightbox(),img=box.querySelector('img'),caption=box.querySelector('.portfolio-lightbox-caption');let index=Math.max(0,Math.min(Number(startIndex)||0,items.length-1));
  const paint=()=>{img.src=items[index];img.alt=`${title} — imagen ${index+1} de ${items.length}`;caption.textContent=`${title} · ${index+1} / ${items.length}`;box.querySelector('.prev').disabled=items.length<2;box.querySelector('.next').disabled=items.length<2};
  const close=()=>{box.classList.add('hidden');document.body.classList.remove('lightbox-open')};
  const prev=()=>{index=(index-1+items.length)%items.length;paint()};const next=()=>{index=(index+1)%items.length;paint()};
  box.querySelector('.portfolio-lightbox-close').onclick=close;box.querySelector('.prev').onclick=prev;box.querySelector('.next').onclick=next;box.onclick=e=>{if(e.target===box)close()};box.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='ArrowLeft')prev();if(e.key==='ArrowRight')next()};
  box.classList.remove('hidden');document.body.classList.add('lightbox-open');box.tabIndex=-1;box.focus();paint()
}
function bindPortfolioViewer(root,urls,title='Portafolio'){
  if(!root)return;root.querySelectorAll('[data-portfolio-index]').forEach(el=>el.addEventListener('click',()=>openPortfolioViewer(urls,Number(el.dataset.portfolioIndex||0),title)))
}
function mapFallbackHtml(s){return `<div class="map-fallback"><div class="map-pin">⌖</div><h3>${escapeHtml(s.provider||s.name)}</h3><p>${escapeHtml(fullLocation(s))}</p><a class="btn btn-dark" href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener">Abrir en Google Maps <span>↗</span></a><p><small>No pudimos ubicar automáticamente esta dirección. Puedes abrirla directamente en Google Maps.</small></p></div>`}
function osmEmbedUrl(lat,lon){const y=Number(lat),x=Number(lon),dx=.009,dy=.0055;const bbox=[x-dx,y-dy,x+dx,y+dy].join(',');return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${y},${x}`)}`}
async function geocodeLocation(s){
  const lat=Number(s?.latitude),lon=Number(s?.longitude);
  if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)>0&&Math.abs(lon)>0)return {lat,lon,source:'stored'};
  const query=fullLocation(s).trim();if(!query)return null;
  if(geocodeCache.has(query))return geocodeCache.get(query);
  try{const cached=JSON.parse(localStorage.getItem('fc_geocode_cache')||'{}');if(cached[query]){geocodeCache.set(query,cached[query]);return cached[query]}}catch{}
  const wait=Math.max(0,1100-(Date.now()-lastGeocodeRequest));if(wait)await new Promise(r=>setTimeout(r,wait));lastGeocodeRequest=Date.now();
  try{
    const endpoint=String(MAP_CFG.geocoderUrl||'https://nominatim.openstreetmap.org/search');
    const params=new URLSearchParams({format:'jsonv2',limit:'1',countrycodes:'cl',q:query});
    const res=await fetch(`${endpoint}?${params}`,{headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error(`Geocoding ${res.status}`);
    const data=await res.json();const first=Array.isArray(data)?data[0]:null;if(!first)return null;
    const result={lat:Number(first.lat),lon:Number(first.lon),source:'nominatim'};if(!Number.isFinite(result.lat)||!Number.isFinite(result.lon))return null;
    geocodeCache.set(query,result);
    try{const cached=JSON.parse(localStorage.getItem('fc_geocode_cache')||'{}');cached[query]=result;localStorage.setItem('fc_geocode_cache',JSON.stringify(cached))}catch{}
    return result;
  }catch(err){console.warn('Fila Cero: no se pudo geocodificar la dirección.',err);return null}
}
async function renderLocationMap(container,s){
  if(!container||!s)return;container.innerHTML='<div class="map-loading"><span></span><strong>Ubicando centro…</strong></div>';
  const key=googleMapsKey();
  if(key){const params=new URLSearchParams({key,q:fullLocation(s),zoom:'16'});container.innerHTML=`<iframe title="Mapa de ${escapeHtml(s.provider||s.name)}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" src="https://www.google.com/maps/embed/v1/place?${params}"></iframe>`;return}
  const coords=await geocodeLocation(s);
  if(coords){container.innerHTML=`<iframe title="Mapa de ${escapeHtml(s.provider||s.name)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" src="${osmEmbedUrl(coords.lat,coords.lon)}"></iframe><div class="map-provider-note">Mapa: OpenStreetMap · <a href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a></div>`;return}
  container.innerHTML=mapFallbackHtml(s);
}
function normalizeSlot(row,business=null){const b=business||row.business||null;return {id:row.id,businessId:row.business_id,provider:b?.name||'Centro profesional',service:row.service,category:row.category,city:row.city,sector:row.sector||'',date:row.slot_date,time:String(row.start_time||'').slice(0,5),normalPrice:Number(row.normal_price||0),price:Number(row.fila_price||0),duration:Number(row.duration_minutes||30),address:row.address,status:row.status,createdAt:row.created_at,latitude:Number(b?.latitude)||null,longitude:Number(b?.longitude)||null,business:b||null}}
function humanError(err){const msg=String(err?.message||err||'Error inesperado');const low=msg.toLowerCase();if(msg.includes('SLOT_UNAVAILABLE')||msg.includes('duplicate key value'))return 'Ese cupo acaba de ser reservado por otra persona.';if(msg.includes('Invalid login credentials'))return 'Correo o contraseña incorrectos.';if(low.includes('email rate limit exceeded'))return 'No pudimos enviar el correo de confirmación en este momento. Intenta más tarde o continúa con Google.';if(low.includes('unsupported provider')||low.includes('provider is not enabled'))return 'Google aún no está activado en Supabase. Habilita Authentication → Sign In / Providers → Google.';if(msg.includes('RESERVATION_NOT_OWNED'))return 'No tienes permiso para gestionar esa reserva.';if(msg.includes('FILA_CERO_ACCOUNT_BLOCKED'))return 'Esta cuenta está bloqueada dentro de Fila Cero por moderación.';if(msg.includes('FILA_CERO_ADMIN_REQUIRED'))return 'Esta sección es exclusiva del administrador de Fila Cero.';if(msg.includes('CANNOT_BLOCK_FILA_CERO_ADMIN'))return 'No puedes bloquear una cuenta administradora de Fila Cero.';return msg}

async function initTopbar(){const link=document.querySelector('[data-account-link]');if(!link||!window.FCAUTH)return;try{const session=await FCAUTH.getSession();link.href=session?'profesional.html':'login.html';link.textContent=session?'Mi empresa':'Crear cuenta / Iniciar sesión'}catch{link.href='login.html'}}

async function initMarketplace(){
  const grid=document.getElementById('slotsGrid');if(!grid||!sb)return;
  const serviceFilter=document.getElementById('serviceFilter'),cityFilter=document.getElementById('cityFilter'),timeFilter=document.getElementById('timeFilter'),sortSelect=document.getElementById('sortSelect'),resultsText=document.getElementById('resultsText'),empty=document.getElementById('emptyState'),modal=document.getElementById('bookingModal'),mapModal=document.getElementById('mapModal'),businessesGrid=document.getElementById('businessesGrid'),businessesEmpty=document.getElementById('businessesEmpty');
  let slots=[],allBusinesses=[],selectedSlot=null,loading=false;

  async function loadSlots(){
    if(loading)return;loading=true;
    const slotPromise=sb.from(T_SLOTS).select('id,business_id,service,category,city,sector,address,slot_date,start_time,duration_minutes,normal_price,fila_price,status,created_at').eq('status','active').gte('slot_date',TODAY_STR).order('slot_date',{ascending:true}).order('start_time',{ascending:true});
    const businessPromise=sb.from(T_BUSINESSES).select('id,name,category,description,city,sector,address,whatsapp,instagram,website,portfolio_urls,latitude,longitude,is_active,profile_enabled,created_at').eq('is_active',true).order('created_at',{ascending:false}).limit(100);
    const [slotReq,bizReq]=await Promise.all([slotPromise,businessPromise]);
    if(slotReq.error){loading=false;console.error(slotReq.error);resultsText.textContent='No pudimos cargar los cupos. Revisa la conexión con Supabase.';return}
    if(bizReq.error){loading=false;console.error(bizReq.error);resultsText.textContent='No pudimos cargar los perfiles profesionales.';return}
    const rows=slotReq.data||[];allBusinesses=(bizReq.data||[]).filter(b=>SUPPORTED_COMMUNES.includes(b.city));
    const businessMap=new Map(allBusinesses.map(b=>[b.id,b]));
    loading=false;
    slots=rows.map(r=>normalizeSlot(r,businessMap.get(r.business_id)||null)).filter(s=>s.business&&SUPPORTED_COMMUNES.includes(s.city)&&!isExpired(s));
    render();renderReservations();renderBusinessDirectory();
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

  function renderBusinessDirectory(){
    if(!businessesGrid)return;
    const visibleBusinesses=allBusinesses.filter(b=>b.profile_enabled!==false);
    businessesEmpty?.classList.toggle('hidden',visibleBusinesses.length>0);
    const activeCounts=new Map();slots.forEach(s=>activeCounts.set(s.businessId,(activeCounts.get(s.businessId)||0)+1));
    businessesGrid.innerHTML=visibleBusinesses.map(b=>{
      const portfolio=Array.isArray(b.portfolio_urls)?b.portfolio_urls.map(safeHttpUrl).filter(Boolean):[];
      const initial=(b.name||'FC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
      const image=portfolio[0]?`<img src="${escapeHtml(portfolio[0])}" alt="${escapeHtml(b.name)}" loading="lazy">`:`<span>${escapeHtml(initial)}</span>`;
      const count=activeCounts.get(b.id)||0;const wa=safeDigits(b.whatsapp);
      return `<article class="business-directory-card"><a class="business-directory-cover" href="empresa.html?id=${encodeURIComponent(b.id)}">${image}<span class="business-directory-category">${escapeHtml(b.category||'Profesional')}</span></a><div class="business-directory-body"><div><h3>${escapeHtml(b.name)}</h3><p class="business-directory-location">⌖ ${escapeHtml(b.sector?b.sector+' · ':'')}${escapeHtml(b.city||'Gran Concepción')}</p></div><p class="business-directory-description">${escapeHtml((b.description||'Perfil profesional en Fila Cero.').slice(0,150))}</p><div class="business-directory-meta"><span><strong>${count}</strong> ${count===1?'cupo activo':'cupos activos'}</span>${wa?`<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ↗</a>`:''}</div><a class="btn btn-dark btn-full" href="empresa.html?id=${encodeURIComponent(b.id)}">Ver perfil y disponibilidad <span>→</span></a></div></article>`
    }).join('');
  }

  function renderLatestSlot(){const box=document.getElementById('latestSlotCard');if(!box)return;const items=slots.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)),s=items[0];const count=document.getElementById('heroActiveCount');if(count)count.textContent=slots.length;if(!s){box.innerHTML='<p class="provider">No hay cupos activos en este momento.</p>';return}box.innerHTML=`<div class="category-line">${escapeHtml(s.category)} · ${escapeHtml(s.city)}</div><h3>${escapeHtml(s.service)}</h3><p class="provider">${escapeHtml(s.provider)}</p><div class="slot-time-big">${formatDate(s.date)} · ${escapeHtml(s.time)}</div><div class="showcase-bottom"><div><div class="price">${money(s.price)}</div><small>${escapeHtml(s.address)}</small></div><a class="map-link latest-map-link" href="#">Ver ubicación ↗</a></div>`;box.querySelector('.latest-map-link')?.addEventListener('click',e=>{e.preventDefault();openMap(s.id)})}

  function render(){
    const items=filteredSlots(),zone=cityFilter.value==='todas'?'en Gran Concepción':`en ${cityFilter.value}`;
    resultsText.textContent=`${items.length} ${items.length===1?'cupo disponible':'cupos disponibles'} ${zone}.`;
    empty.classList.toggle('hidden',items.length>0);
    grid.innerHTML=items.map(s=>{const savings=s.normalPrice>0?Math.max(0,Math.round((1-s.price/s.normalPrice)*100)):0;return `<article class="slot-card"><div class="slot-top"><div class="service-icon">${ICONS[s.category]||'⚡'}</div><span class="badge-live">● DISPONIBLE</span></div><div><h3>${escapeHtml(s.service)}</h3>${s.business?.profile_enabled===false?`<span class="provider">${escapeHtml(s.provider)}</span><span class="profile-private-chip">Perfil no público</span>`:`<a class="provider provider-link" href="${businessLink(s)}">${escapeHtml(s.provider)} ↗</a>`}</div><div class="meta-list"><div class="meta-row">◷ <span>${formatDate(s.date)} · <strong>${escapeHtml(s.time)}</strong> · ${Number(s.duration)} min</span></div><div class="meta-row">⌖ <span>${escapeHtml(s.address)}${s.sector?` · ${escapeHtml(s.sector)}`:''}<br><b>${escapeHtml(s.city)}</b></span></div></div><div class="location-actions"><button class="map-btn show-map-btn" type="button" data-id="${escapeHtml(s.id)}">⌖ Ver mapa</button><a class="map-btn" href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener">Cómo llegar ↗</a></div><div class="slot-bottom"><div><div class="price-old">${money(s.normalPrice)}</div><div class="price-new">${money(s.price)}</div>${savings?`<div class="savings">${savings}% menos que el valor normal</div>`:''}</div><button class="btn btn-accent reserve-btn" data-id="${escapeHtml(s.id)}">Reservar <span>→</span></button></div></article>`}).join('');
    grid.querySelectorAll('.reserve-btn').forEach(b=>b.addEventListener('click',()=>openBooking(b.dataset.id)));
    grid.querySelectorAll('.show-map-btn').forEach(b=>b.addEventListener('click',()=>openMap(b.dataset.id)));
    renderLatestSlot();
  }

  function openBooking(id){
    selectedSlot=slots.find(s=>s.id===id);if(!selectedSlot)return showToast('Ese cupo ya no está disponible.');
    const b=selectedSlot.business||{};const savings=selectedSlot.normalPrice>0?Math.max(0,Math.round((1-selectedSlot.price/selectedSlot.normalPrice)*100)):0;
    document.getElementById('bookingSummary').innerHTML=`<span class="booking-category">${escapeHtml(selectedSlot.category)} · ${escapeHtml(selectedSlot.city)}</span><strong>${escapeHtml(selectedSlot.service)}</strong><div class="booking-date-line">${formatDate(selectedSlot.date)} · <b>${escapeHtml(selectedSlot.time)}</b> · ${Number(selectedSlot.duration)} min</div><div class="summary-address">⌖ ${escapeHtml(fullLocation(selectedSlot))}</div><div class="booking-price-row"><div><span>${selectedSlot.normalPrice>selectedSlot.price?money(selectedSlot.normalPrice):''}</span><strong>${money(selectedSlot.price)}</strong></div>${savings?`<b>${savings}% ahorro</b>`:''}</div>`;
    const wa=safeDigits(b.whatsapp),ig=String(b.instagram||'').replace(/[^a-zA-Z0-9._]/g,''),web=safeHttpUrl(b.website),portfolio=(Array.isArray(b.portfolio_urls)?b.portfolio_urls:[]).map(safeHttpUrl).filter(Boolean);
    const links=[];if(wa)links.push(`<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ↗</a>`);if(ig)links.push(`<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram ↗</a>`);if(web)links.push(`<a href="${escapeHtml(web)}" target="_blank" rel="noopener">Sitio web ↗</a>`);
    const bookingInfo=document.getElementById('bookingBusinessInfo');bookingInfo.innerHTML=`<div class="booking-business-head"><div class="booking-business-avatar">${escapeHtml((b.name||'FC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</div><div><span>TE ATIENDE</span><a href="${businessLink(selectedSlot)}">${escapeHtml(selectedSlot.provider)} ↗</a><small>${escapeHtml(b.category||selectedSlot.category)} · ${escapeHtml(b.sector?b.sector+' · ':'')}${escapeHtml(b.city||selectedSlot.city)}</small></div></div>${b.description?`<p>${escapeHtml(b.description)}</p>`:''}${portfolio.length?`<div class="booking-mini-portfolio">${portfolio.slice(0,6).map((url,i)=>`<button class="booking-mini-photo" type="button" data-portfolio-index="${i}" aria-label="Ver imagen ${i+1}"><img src="${escapeHtml(url)}" alt="${escapeHtml(selectedSlot.provider)} ${i+1}" loading="lazy"></button>`).join('')}</div>`:''}${links.length?`<div class="booking-business-links">${links.join('')}</div>`:''}`;bindPortfolioViewer(bookingInfo,portfolio,selectedSlot.provider);
    renderLocationMap(document.getElementById('bookingMap'),selectedSlot);modal.classList.remove('hidden')
  }
  function openMap(id){const s=slots.find(x=>x.id===id);if(!s)return;document.getElementById('mapTitle').textContent=s.provider;document.getElementById('mapModalMeta').innerHTML=`${escapeHtml(s.service)} · ${escapeHtml(fullLocation(s))} · <a href="${buildMapsSearchUrl(s)}" target="_blank" rel="noopener"><strong>Abrir navegación ↗</strong></a>`;renderLocationMap(document.getElementById('mapModalContent'),s);mapModal.classList.remove('hidden')}

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

  const channel=sb.channel('fila-cero-marketplace').on('postgres_changes',{event:'*',schema:'public',table:T_SLOTS},()=>loadSlots()).on('postgres_changes',{event:'*',schema:'public',table:T_BUSINESSES},()=>loadSlots()).subscribe();
  window.addEventListener('beforeunload',()=>{try{sb.removeChannel(channel)}catch{}});
  await loadSlots();
  const q=new URLSearchParams(location.search).get('book');if(q)setTimeout(()=>openBooking(q),150);
}

async function initProfessional(){
  const form=document.getElementById('publishForm');if(!form||!sb||!window.FCAUTH)return;
  let business;
  try{business=await FCAUTH.requireBusiness();if(!business)return}catch(err){showToast(humanError(err));return}
  const user=await FCAUTH.currentUser();let slots=[],reservations=[],portfolioState=[];
  try{if(await FCAUTH.isAdmin()){const adminLink=document.getElementById('adminPanelLink');if(adminLink)adminLink.classList.remove('hidden')}}catch(err){console.warn('No se pudo comprobar rol admin',err)}
  const today=TODAY_STR;slotDate.min=today;slotDate.value=today;
  businessHeroName.textContent=business.name;publicProfileLink.href=`empresa.html?id=${encodeURIComponent(business.id)}`;profilePreviewButton.href=publicProfileLink.href;
  logoutBtn.addEventListener('click',async()=>{try{await FCAUTH.logout();location.href='login.html'}catch(err){showToast(humanError(err))}});
  const deleteMyBusinessBtn=document.getElementById('deleteMyBusinessBtn');
  deleteMyBusinessBtn?.addEventListener('click',async()=>{
    const typed=prompt('Esta acción borrará tu perfil, cupos, reservas y fotos de Fila Cero. Escribe ELIMINAR para confirmar.');
    if(typed!=='ELIMINAR') return;
    if(!confirm('Última confirmación: ¿eliminar definitivamente tu empresa de Fila Cero?')) return;
    deleteMyBusinessBtn.disabled=true;deleteMyBusinessBtn.textContent='Eliminando…';
    try{await FCAUTH.deleteMyBusiness();location.href='login.html?deleted=1'}catch(err){deleteMyBusinessBtn.disabled=false;deleteMyBusinessBtn.textContent='Eliminar mi empresa';showToast(humanError(err))}
  });

  function mapOwnedSlot(row){return normalizeSlot(row,business)}
  function profileScore(b){const fields=['name','category','city','address','description','whatsapp'];return Math.round(fields.filter(k=>String(b[k]||'').trim()).length/fields.length*100)}
  function renderPortfolioManager(){
    const box=document.getElementById('portfolioManagerPreview');if(!box)return;
    if(!portfolioState.length){box.innerHTML='<div class="portfolio-manager-empty">Aún no hay imágenes guardadas.</div>';return}
    box.innerHTML=portfolioState.map((url,i)=>`<div class="portfolio-manager-item"><button class="portfolio-manager-open" type="button" data-portfolio-index="${i}"><img src="${escapeHtml(url)}" alt="Imagen ${i+1} del portafolio"></button><button class="portfolio-manager-remove" type="button" data-remove-index="${i}">Quitar</button></div>`).join('');
    bindPortfolioViewer(box,portfolioState,business.name||'Portafolio');box.querySelectorAll('[data-remove-index]').forEach(btn=>btn.addEventListener('click',()=>{portfolioState.splice(Number(btn.dataset.removeIndex),1);renderPortfolioManager()}))
  }
  function loadProfile(){
    portfolioState=(business.portfolio||[]).map(safeHttpUrl).filter(Boolean).slice(0,12);
    profileName.value=business.name||'';profileCategory.value=business.category||'Otro';profileDescription.value=business.description||'';profileCity.value=business.city||'Concepción';profileSector.value=business.sector||'';profileAddress.value=business.address||'';profileWhatsapp.value=business.whatsapp||'';profileInstagram.value=business.instagram||'';profileWebsite.value=business.website||'';portfolio1.value='';portfolio2.value='';portfolio3.value='';profileCompletion.textContent=`${profileScore(business)}%`;businessHeroName.textContent=business.name;renderPortfolioManager();const enabled=business.profile_enabled!==false;const toggle=document.getElementById('profileEnabledToggle');const label=document.getElementById('profileVisibilityLabel');const help=document.getElementById('profileVisibilityHelp');if(toggle)toggle.checked=enabled;if(label)label.textContent=enabled?'Habilitado':'Deshabilitado';if(help)help.textContent=enabled?'Tu empresa aparece en el directorio y las personas pueden abrir tu perfil público.':'Tu perfil está oculto del directorio. Puedes seguir publicando y gestionando horas desde este panel.';publicProfileLink.style.display=enabled?'':'none';profilePreviewButton.textContent=enabled?'Abrir mi perfil público ↗':'Perfil público deshabilitado';profilePreviewButton.classList.toggle('disabled-link',!enabled);profilePreviewButton.setAttribute('aria-disabled',enabled?'false':'true');
    const card=document.getElementById('dashboardProfileCard');if(card){dashboardProfileAvatar.textContent=(business.name||'FC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();dashboardProfileName.textContent=business.name||'Mi empresa';dashboardProfileMeta.textContent=`${business.category||'Profesional'} · ${business.sector?business.sector+' · ':''}${business.city||'Gran Concepción'} · ${business.address||'Dirección por completar'}`;const links=[];const wa=safeDigits(business.whatsapp);if(wa)links.push(`<a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ↗</a>`);const ig=String(business.instagram||'').replace(/[^a-zA-Z0-9._]/g,'');if(ig)links.push(`<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram ↗</a>`);if(business.profile_enabled!==false)links.push(`<a href="empresa.html?id=${encodeURIComponent(business.id)}">Ver perfil público ↗</a>`);else links.push('<span class="profile-private-chip">Perfil público deshabilitado</span>');dashboardProfileLinks.innerHTML=links.join('');renderLocationMap(dashboardProfileMap,{...business,provider:business.name})}
  }

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
  function renderReservationsForBusiness(){
    const box=businessReservations;if(!reservations.length){box.innerHTML='<div class="dashboard-empty"><strong>Aún no hay horas reservadas.</strong><span>Cuando una persona tome uno de tus cupos, aparecerá aquí con sus datos de contacto.</span></div>';return}
    box.innerHTML=reservations.map(r=>{const s=slots.find(x=>x.id===r.slot_id);const phone=safeDigits(r.client_phone);const created=r.created_at?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.created_at)):'';const confirmed=r.status==='confirmed';return `<article class="booking-row booking-row-rich"><div class="booking-client"><span class="client-avatar">${escapeHtml((r.client_name||'?')[0])}</span><div><strong>${escapeHtml(r.client_name)}</strong><small>${escapeHtml(r.client_email)}</small><small>${escapeHtml(r.client_phone)}</small><div class="booking-client-actions">${phone?`<a href="https://wa.me/${phone}" target="_blank" rel="noopener">WhatsApp ↗</a>`:''}<a href="mailto:${encodeURIComponent(r.client_email||'')}">Correo ↗</a></div></div></div><div class="booking-service-detail"><span class="eyebrow">${confirmed?'CITA RESERVADA':'CITA CANCELADA'}</span><strong>${escapeHtml(s?.service||'Cupo reservado')}</strong><small>${s?.date?formatDate(s.date):''} · ${escapeHtml(String(s?.time||''))} · ${Number(s?.duration||0)} min</small><small>⌖ ${escapeHtml(s?fullLocation(s):business.address||'')}</small><small>${created?`Reservada: ${escapeHtml(created)}`:''}</small></div><div class="booking-row-side"><strong>${s?money(s.price):''}</strong><span class="reservation-status">${escapeHtml(String(r.status||'confirmed').toUpperCase())}</span><div class="management-actions">${confirmed?`<button class="action-btn cancel-reservation-btn" type="button" data-id="${escapeHtml(r.id)}">Cancelar cita</button>`:''}<button class="action-btn danger delete-reservation-btn" type="button" data-id="${escapeHtml(r.id)}">Eliminar cita</button></div></div></article>`}).join('');
    box.querySelectorAll('.cancel-reservation-btn').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('¿Cancelar esta cita? La hora dejará de estar disponible.'))return;btn.disabled=true;const {error}=await sb.rpc(RPC_CANCEL_RESERVATION,{p_reservation_id:btn.dataset.id});if(error){btn.disabled=false;return showToast(humanError(error))}showToast('Cita cancelada.');await loadDashboard()}));
    box.querySelectorAll('.delete-reservation-btn').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('¿Eliminar definitivamente esta cita y su cupo asociado? Esta acción no se puede deshacer.'))return;btn.disabled=true;const {error}=await sb.rpc(RPC_DELETE_RESERVATION,{p_reservation_id:btn.dataset.id});if(error){btn.disabled=false;return showToast(humanError(error))}showToast('Cita eliminada definitivamente.');await loadDashboard()}))
  }
  function renderPro(){
    const active=slots.filter(s=>s.status==='active'&&!isExpired(s));activeSlotsCount.textContent=active.length;bookedSlotsCount.textContent=reservations.filter(r=>r.status==='confirmed').length;
    if(!slots.length)professionalSlots.innerHTML='<p class="muted-small">Todavía no has publicado cupos.</p>';else professionalSlots.innerHTML=slots.map(s=>`<div class="pro-slot"><strong>${escapeHtml(s.service)}</strong><small>${formatDate(s.date)} · ${escapeHtml(s.time)} · ${escapeHtml(s.city)}<br>${money(s.price)}</small><div class="pro-slot-actions"><span class="reservation-status">${s.status==='reserved'?'RESERVADO':s.status==='cancelled'?'CANCELADO':isExpired(s)?'VENCIDO':'ACTIVO'}</span><div class="management-actions">${s.status==='active'?`<button class="action-btn cancel-slot-btn" type="button" data-id="${escapeHtml(s.id)}">Cancelar cupo</button>`:''}<button class="action-btn danger delete-slot-btn" type="button" data-id="${escapeHtml(s.id)}">Eliminar</button></div></div></div>`).join('');
    professionalSlots.querySelectorAll('.cancel-slot-btn').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('¿Cancelar este cupo? Dejará de mostrarse en el marketplace.'))return;btn.disabled=true;const {error}=await sb.from(T_SLOTS).update({status:'cancelled'}).eq('id',btn.dataset.id).eq('business_id',business.id);if(error){btn.disabled=false;return showToast(humanError(error))}showToast('Cupo cancelado.');await loadDashboard()}));
    professionalSlots.querySelectorAll('.delete-slot-btn').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('¿Eliminar este cupo definitivamente? Si tiene una reserva asociada también se eliminará.'))return;btn.disabled=true;const {error}=await sb.from(T_SLOTS).delete().eq('id',btn.dataset.id).eq('business_id',business.id);if(error){btn.disabled=false;return showToast(humanError(error))}showToast('Cupo eliminado.');await loadDashboard()}));renderLivePreview();renderReservationsForBusiness()
  }

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
      const manual=[portfolio1.value.trim(),portfolio2.value.trim(),portfolio3.value.trim()].map(safeHttpUrl).filter(Boolean);
      const fileInput=document.getElementById('portfolioFiles');let uploaded=[];
      if(fileInput?.files?.length){uploaded=await FCAUTH.uploadPortfolio(fileInput.files)}
      const portfolio=[...new Set([...portfolioState,...manual,...uploaded])].slice(0,12);
      const profileDraft={name:profileName.value.trim(),category:profileCategory.value,description:profileDescription.value.trim(),city:profileCity.value,sector:profileSector.value.trim(),address:profileAddress.value.trim(),whatsapp:safeDigits(profileWhatsapp.value),instagram:profileInstagram.value.replace(/^@/,'').trim(),website:safeHttpUrl(profileWebsite.value),portfolio_urls:portfolio,profile_enabled:document.getElementById('profileEnabledToggle')?.checked!==false};
      const oldLocation=fullLocation(business),newLocation=fullLocation(profileDraft);const coords=await geocodeLocation(profileDraft);
      business=await FCAUTH.updateBusiness({...profileDraft,latitude:coords?.lat??(oldLocation===newLocation?business.latitude:null),longitude:coords?.lon??(oldLocation===newLocation?business.longitude:null)});
      await sb.from(T_SLOTS).update({city:business.city,sector:business.sector||'',address:business.address}).eq('business_id',business.id).eq('status','active');
      publicProfileLink.href=`empresa.html?id=${encodeURIComponent(business.id)}`;profilePreviewButton.href=publicProfileLink.href;if(fileInput)fileInput.value='';portfolioState=business.portfolio||[];loadProfile();showToast(business.profile_enabled===false?'Perfil guardado y ocultado del público.':'Perfil público guardado y habilitado.');await loadDashboard()
    }catch(err){showToast(humanError(err))}finally{button.disabled=false;button.innerHTML='Guardar perfil público <span>→</span>'}
  });

  const profileEnabledToggle=document.getElementById('profileEnabledToggle');
  profileEnabledToggle?.addEventListener('change',async()=>{
    const desired=profileEnabledToggle.checked;profileEnabledToggle.disabled=true;
    try{business=await FCAUTH.updateBusiness({profile_enabled:desired});loadProfile();showToast(desired?'Perfil público habilitado.':'Perfil público deshabilitado. Tu dashboard y tus horas siguen activos.')}catch(err){profileEnabledToggle.checked=!desired;showToast(humanError(err))}finally{profileEnabledToggle.disabled=false}
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
  if(business.profile_enabled===false){root.innerHTML='<section class="section"><div class="empty"><h2>Perfil no disponible</h2><p>Esta empresa decidió ocultar temporalmente su perfil público en Fila Cero.</p><a class="btn btn-dark" href="index.html">Buscar horas disponibles</a></div></section>';return}

  async function loadPublicSlots(){const {data,error}=await sb.from(T_SLOTS).select('*').eq('business_id',business.id).eq('status','active').gte('slot_date',TODAY_STR).order('slot_date',{ascending:true}).order('start_time',{ascending:true});if(error)throw error;return (data||[]).map(r=>normalizeSlot(r,business)).filter(s=>!isExpired(s))}
  function renderBusiness(){businessName.textContent=business.name;businessCategoryBadge.textContent=(business.category||'CENTRO PROFESIONAL').toUpperCase();businessLocation.textContent=`${business.sector?business.sector+' · ':''}${business.city}`;businessDescription.textContent=business.description||'Este centro todavía no ha agregado una descripción pública.';businessAvatar.textContent=(business.name||'FC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();asideBusinessName.textContent=business.name;asideAddress.textContent=`${business.address||'Dirección por completar'}${business.sector?`, ${business.sector}`:''}, ${business.city}`;
    const contacts=[];const wa=safeDigits(business.whatsapp);if(wa)contacts.push(`<a class="btn btn-whatsapp" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp <span>↗</span></a>`);const ig=String(business.instagram||'').replace(/[^a-zA-Z0-9._]/g,'');if(ig)contacts.push(`<a class="btn btn-outline" href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">Instagram <span>↗</span></a>`);const web=safeHttpUrl(business.website);if(web)contacts.push(`<a class="btn btn-outline" href="${escapeHtml(web)}" target="_blank" rel="noopener">Sitio web <span>↗</span></a>`);businessContacts.innerHTML=contacts.join('')||'<span class="muted-small">Este centro todavía no ha publicado canales de contacto.</span>';
    const portfolio=(business.portfolio||[]).map(safeHttpUrl).filter(Boolean);businessPortfolio.innerHTML=portfolio.length?portfolio.map((url,i)=>`<button class="portfolio-slide" type="button" data-portfolio-index="${i}" aria-label="Ver imagen ${i+1} de ${portfolio.length}"><img src="${escapeHtml(url)}" alt="Portafolio de ${escapeHtml(business.name)} ${i+1}" loading="lazy"><span>${i+1} / ${portfolio.length}</span></button>`).join(''):'<div class="portfolio-placeholder"><span>＋</span><p>Este centro todavía no ha agregado fotografías.</p></div>';bindPortfolioViewer(businessPortfolio,portfolio,business.name);
    renderLocationMap(businessMap,{...business,provider:business.name})
  }
  async function renderSlots(){try{const slots=await loadPublicSlots();businessSlots.innerHTML=slots.length?slots.map(s=>`<article class="profile-slot"><div><span class="viz-category">${escapeHtml(s.category)}</span><h3>${escapeHtml(s.service)}</h3><p>${formatDate(s.date)} · <strong>${escapeHtml(s.time)}</strong> · ${Number(s.duration)} min</p></div><div class="profile-slot-price"><strong>${money(s.price)}</strong><a class="btn btn-accent btn-small" href="index.html?book=${encodeURIComponent(s.id)}">Reservar</a></div></article>`).join(''):'<div class="dashboard-empty"><strong>Sin cupos disponibles por ahora.</strong><span>Puedes contactar directamente al centro o volver más tarde.</span></div>'}catch(err){businessSlots.innerHTML='<div class="dashboard-empty"><strong>No pudimos cargar los cupos.</strong><span>Intenta nuevamente en unos segundos.</span></div>';console.error(err)}}
  renderBusiness();await renderSlots();
  const channel=sb.channel(`fila-cero-profile-${business.id}`).on('postgres_changes',{event:'*',schema:'public',table:T_SLOTS,filter:`business_id=eq.${business.id}`},renderSlots).on('postgres_changes',{event:'UPDATE',schema:'public',table:T_BUSINESSES,filter:`id=eq.${business.id}`},async()=>{business=await FCAUTH.getBusiness(business.id);renderBusiness()}).subscribe();
  window.addEventListener('beforeunload',()=>{try{sb.removeChannel(channel)}catch{}})
}


async function initAdmin(){
  const root=document.getElementById('adminPage');if(!root||!sb||!window.FCAUTH)return;
  let user;
  try{user=await FCAUTH.requireAdmin();if(!user)return}catch(err){showToast(humanError(err));return}
  const list=document.getElementById('adminBusinessList');
  const blockedList=document.getElementById('adminBlockedList');
  const search=document.getElementById('adminBusinessSearch');
  const logout=document.getElementById('adminLogoutBtn');
  let businesses=[],blocked=[];

  logout?.addEventListener('click',async()=>{try{await FCAUTH.logout();location.href='login.html'}catch(err){showToast(humanError(err))}});

  const dateTime=v=>{try{return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v))}catch{return String(v||'')}};
  const ownerInitial=b=>(b.name||b.owner_email||'FC').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

  function renderBlocked(){
    adminBlockedCount.textContent=blocked.length;
    if(!blocked.length){blockedList.innerHTML='<div class="dashboard-empty"><strong>No hay cuentas bloqueadas.</strong><span>Los bloqueos de moderación aparecerán aquí.</span></div>';return}
    blockedList.innerHTML=blocked.map(b=>`<article class="admin-blocked-row"><div><strong>${escapeHtml(b.email||'Cuenta sin correo')}</strong><span>${escapeHtml(b.reason||'Moderación de Fila Cero')}</span><small>Bloqueado: ${escapeHtml(dateTime(b.blocked_at))}</small></div><button class="action-btn admin-unblock-btn" type="button" data-owner-id="${escapeHtml(b.owner_id)}">Desbloquear</button></article>`).join('');
    blockedList.querySelectorAll('.admin-unblock-btn').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('¿Desbloquear esta cuenta para que pueda volver a crear una empresa en Fila Cero?'))return;btn.disabled=true;try{await FCAUTH.adminUnblockOwner(btn.dataset.ownerId);showToast('Cuenta desbloqueada.');await loadAdmin()}catch(err){btn.disabled=false;showToast(humanError(err))}}));
  }

  function filteredBusinesses(){
    const q=String(search?.value||'').trim().toLowerCase();
    if(!q)return businesses;
    return businesses.filter(b=>[b.name,b.owner_email,b.category,b.city,b.sector,b.address,b.description].some(v=>String(v||'').toLowerCase().includes(q)));
  }

  function renderBusinesses(){
    const rows=filteredBusinesses();
    adminBusinessCount.textContent=businesses.length;
    adminPublicCount.textContent=businesses.filter(b=>b.profile_enabled!==false&&b.is_active!==false).length;
    if(!rows.length){list.innerHTML='<div class="dashboard-empty"><strong>No encontramos empresas.</strong><span>Prueba con otro término de búsqueda.</span></div>';return}
    list.innerHTML=rows.map(b=>{
      const portfolio=Array.isArray(b.portfolio_urls)?b.portfolio_urls.map(safeHttpUrl).filter(Boolean):[];
      const status=b.is_active===false?'INACTIVA':b.profile_enabled===false?'PERFIL OCULTO':'PÚBLICA';
      const wa=safeDigits(b.whatsapp);
      return `<article class="admin-business-card" data-business-id="${escapeHtml(b.id)}">
        <div class="admin-business-head"><div class="business-avatar compact-avatar">${escapeHtml(ownerInitial(b))}</div><div><div class="admin-status-line"><span class="reservation-status">${escapeHtml(status)}</span><span>${escapeHtml(b.category||'Otro')}</span></div><h3>${escapeHtml(b.name||'Mi empresa')}</h3><p>${escapeHtml(b.owner_email||'Correo no disponible')}</p></div></div>
        <div class="admin-business-body"><p>${escapeHtml(b.description||'Sin descripción pública.')}</p><div class="admin-meta-grid"><span><b>Comuna</b>${escapeHtml(b.city||'—')}</span><span><b>Sector</b>${escapeHtml(b.sector||'—')}</span><span><b>Cupos</b>${Number(b.slots_total||0)}</span><span><b>Reservas</b>${Number(b.reservations_total||0)}</span></div><small>⌖ ${escapeHtml(b.address||'Dirección sin completar')}</small></div>
        ${portfolio.length?`<div class="admin-portfolio" data-admin-gallery="${escapeHtml(b.id)}">${portfolio.slice(0,4).map((url,i)=>`<button type="button" class="booking-mini-photo" data-portfolio-index="${i}"><img src="${escapeHtml(url)}" alt="Portafolio de ${escapeHtml(b.name)} ${i+1}" loading="lazy"></button>`).join('')}</div>`:''}
        <div class="admin-business-actions">${b.profile_enabled!==false?`<a class="action-btn" href="empresa.html?id=${encodeURIComponent(b.id)}" target="_blank" rel="noopener">Ver perfil ↗</a>`:''}${wa?`<a class="action-btn" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp ↗</a>`:''}<button class="action-btn danger admin-delete-only" type="button" data-id="${escapeHtml(b.id)}" data-name="${escapeHtml(b.name)}">Eliminar empresa</button><button class="btn btn-danger admin-delete-block" type="button" data-id="${escapeHtml(b.id)}" data-name="${escapeHtml(b.name)}">Eliminar y bloquear</button></div>
      </article>`;
    }).join('');

    rows.forEach(b=>{const box=list.querySelector(`[data-admin-gallery="${CSS.escape(b.id)}"]`);const portfolio=Array.isArray(b.portfolio_urls)?b.portfolio_urls.map(safeHttpUrl).filter(Boolean):[];if(box&&portfolio.length)bindPortfolioViewer(box,portfolio,b.name)});

    list.querySelectorAll('.admin-delete-only').forEach(btn=>btn.addEventListener('click',async()=>{
      if(!confirm(`¿Eliminar ${btn.dataset.name} de Fila Cero? El usuario podrá crear otra empresa más adelante.`))return;
      btn.disabled=true;try{await FCAUTH.adminDeleteBusiness(btn.dataset.id,{blockOwner:false,reason:'Eliminación administrativa'});showToast('Empresa eliminada de Fila Cero.');await loadAdmin()}catch(err){btn.disabled=false;showToast(humanError(err))}
    }));
    list.querySelectorAll('.admin-delete-block').forEach(btn=>btn.addEventListener('click',async()=>{
      const reason=prompt(`Motivo de moderación para ${btn.dataset.name}:`,'Contenido o uso no permitido en Fila Cero');if(reason===null)return;
      const typed=prompt('Esta acción elimina todos sus datos de Fila Cero y bloquea que recree la empresa. Escribe BLOQUEAR para confirmar.');if(typed!=='BLOQUEAR')return;
      btn.disabled=true;try{await FCAUTH.adminDeleteBusiness(btn.dataset.id,{blockOwner:true,reason});showToast('Empresa eliminada y cuenta bloqueada en Fila Cero.');await loadAdmin()}catch(err){btn.disabled=false;showToast(humanError(err))}
    }));
  }

  async function loadAdmin(){
    try{
      const [businessRows,blockedRows]=await Promise.all([FCAUTH.adminListBusinesses(),FCAUTH.adminListBlocked()]);
      businesses=businessRows||[];blocked=blockedRows||[];renderBusinesses();renderBlocked();
    }catch(err){showToast(humanError(err));console.error(err)}
  }

  search?.addEventListener('input',renderBusinesses);
  await loadAdmin();
}

document.addEventListener('DOMContentLoaded',()=>{
  initTopbar();
  initMarketplace().catch(console.error);
  initProfessional().catch(console.error);
  initBusinessProfile().catch(console.error);
  initAdmin().catch(console.error);
});
