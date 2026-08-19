(function(){
  const sb = window.FC_SUPABASE;
  const cfg = window.FC_CONFIG || {};
  const db = cfg.db || {};
  const T_BUSINESSES = db.businessesTable || 'fila_cero_businesses';
  const PORTFOLIO_BUCKET = db.portfolioBucket || 'fila-cero-portfolio';
  const RPC_DELETE_MY_BUSINESS = db.deleteMyBusinessRpc || 'fila_cero_delete_my_business';
  const RPC_ADMIN_STATUS = db.adminStatusRpc || 'fila_cero_is_admin';
  const RPC_BLOCKED_STATUS = db.blockedStatusRpc || 'fila_cero_is_current_user_blocked';
  const RPC_ADMIN_LIST_BUSINESSES = db.adminListBusinessesRpc || 'fila_cero_admin_list_businesses';
  const RPC_ADMIN_DELETE_BUSINESS = db.adminDeleteBusinessRpc || 'fila_cero_admin_delete_business';
  const RPC_ADMIN_LIST_BLOCKED = db.adminListBlockedRpc || 'fila_cero_admin_list_blocked';
  const RPC_ADMIN_UNBLOCK = db.adminUnblockRpc || 'fila_cero_admin_unblock_owner';
  const RPC_CLAIM_RESERVATIONS = db.claimReservationsRpc || 'fila_cero_claim_reservations';
  const COMMUNES=['Concepción','Talcahuano','Hualpén','San Pedro de la Paz','Chiguayante','Penco','Tomé','Hualqui','Coronel','Lota','Santa Juana'];

  function assertClient(){
    if(!sb) throw new Error('No se pudo conectar con Supabase. Revisa config.js y tu conexión a internet.');
  }

  async function getSession(){
    assertClient();
    const {data,error}=await sb.auth.getSession();
    if(error) throw error;
    return data.session || null;
  }

  async function currentUser(){
    assertClient();
    const {data,error}=await sb.auth.getUser();
    if(error && error.name!=='AuthSessionMissingError') throw error;
    return data?.user || null;
  }


  async function isAdmin(){
    const session=await getSession();
    if(!session) return false;
    const {data,error}=await sb.rpc(RPC_ADMIN_STATUS);
    if(error) throw error;
    return data===true;
  }

  async function isBlocked(){
    const session=await getSession();
    if(!session) return false;
    const {data,error}=await sb.rpc(RPC_BLOCKED_STATUS);
    if(error) throw error;
    return data===true;
  }

  // IMPORTANTE: no existe trigger global de auth.users para Fila Cero.
  // El perfil se crea únicamente cuando una persona entra a ESTA aplicación.
  async function ensureBusiness(user,businessName=''){
    if(!user) return null;

    let {data,error}=await sb.from(T_BUSINESSES).select('*').eq('owner_id',user.id).maybeSingle();
    if(error) throw error;
    if(data) return normalizeBusiness(data);

    if(await isBlocked()) throw new Error('FILA_CERO_ACCOUNT_BLOCKED');

    const fallback=(
      businessName ||
      user.user_metadata?.fila_cero_business_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Mi empresa'
    ).trim();

    const created=await sb
      .from(T_BUSINESSES)
      .insert({owner_id:user.id,name:fallback})
      .select()
      .single();

    if(created.error){
      // Si dos pestañas intentaron crear el perfil a la vez, recuperar el ya creado.
      if(String(created.error.code)==='23505'){
        const retry=await sb.from(T_BUSINESSES).select('*').eq('owner_id',user.id).single();
        if(retry.error) throw retry.error;
        return normalizeBusiness(retry.data);
      }
      throw created.error;
    }
    return normalizeBusiness(created.data);
  }

  async function currentBusiness(){
    const user=await currentUser();
    if(!user) return null;
    return ensureBusiness(user);
  }

  async function createAccount({businessName,name,email,password,accountType='business'}){
    assertClient();
    const isBusiness=accountType!=='consumer';
    const displayName=String(name||businessName||'').trim();
    const destination=isBusiness?'profesional.html':'cuenta.html';
    const {data,error}=await sb.auth.signUp({
      email:String(email||'').trim().toLowerCase(),
      password:String(password||''),
      options:{
        emailRedirectTo:new URL(destination,getAppBaseUrl()).href,
        data:{
          fila_cero_business_name:isBusiness?String(businessName||displayName||'Mi empresa').trim():'',
          fila_cero_display_name:displayName,
          fila_cero_account_type:isBusiness?'business':'consumer',
          fila_cero_source:'fila-cero'
        }
      }
    });
    if(error) throw error;
    if(isBusiness && data?.session && data?.user) await ensureBusiness(data.user,businessName||displayName);
    return {user:data?.user||null,session:data?.session||null,needsEmailConfirmation:!!data?.user&&!data?.session,destination};
  }

  async function login(email,password){
    assertClient();
    const {data,error}=await sb.auth.signInWithPassword({
      email:String(email||'').trim().toLowerCase(),password:String(password||'')
    });
    if(error) throw error;
    return data;
  }

  async function logout(){
    assertClient();
    const {error}=await sb.auth.signOut();
    if(error) throw error;
  }

  async function updateBusiness(patch){
    const user=await currentUser();
    if(!user) throw new Error('Debes iniciar sesión.');
    // Solo enviamos columnas que realmente existen en fila_cero_businesses.
    // Esto evita que campos de presentación como `provider` rompan el guardado.
    const allowed=new Set([
      'name','category','description','city','sector','address','whatsapp','instagram',
      'website','portfolio_urls','latitude','longitude','is_active','profile_enabled'
    ]);
    const clean=Object.fromEntries(Object.entries(patch||{}).filter(([key])=>allowed.has(key)));

    const {data,error}=await sb
      .from(T_BUSINESSES)
      .update(clean)
      .eq('owner_id',user.id)
      .select()
      .single();

    if(error) throw error;
    return normalizeBusiness(data);
  }

  async function getBusiness(id){
    assertClient();
    if(!id) return null;
    const {data,error}=await sb.from(T_BUSINESSES).select('*').eq('id',id).maybeSingle();
    if(error) throw error;
    return data?normalizeBusiness(data):null;
  }

  function getAppBaseUrl(){
    // En desarrollo local, regresar al localhost actual.
    if(location.protocol!=='file:' && ['localhost','127.0.0.1'].includes(location.hostname)){
      return `${location.origin}/`;
    }

    const configured=String(cfg.appBaseUrl||'').trim();
    if(configured){
      try{return new URL(configured).href}catch(_e){}
    }

    if(location.protocol!=='file:') return new URL('.',window.location.href).href;
    return 'https://fila-cero.concepcion.workers.dev/';
  }

  async function googleLogin(destination='profesional.html'){
    assertClient();
    if(location.protocol==='file:'){
      throw new Error('Google Login necesita abrir Fila Cero desde un dominio HTTPS o localhost, no con doble clic en el HTML.');
    }
    const safeDestination=['profesional.html','cuenta.html'].includes(destination)?destination:'profesional.html';
    const redirectTo=new URL(safeDestination,getAppBaseUrl()).href;
    const {data,error}=await sb.auth.signInWithOAuth({
      provider:'google',
      options:{redirectTo,queryParams:{prompt:'select_account'}}
    });
    if(error) throw error;
    return data;
  }


  async function hasBusiness(){
    const user=await currentUser();
    if(!user)return null;
    const {data,error}=await sb.from(T_BUSINESSES).select('*').eq('owner_id',user.id).maybeSingle();
    if(error)throw error;
    return data?normalizeBusiness(data):null;
  }

  async function sendPasswordReset(email){
    assertClient();
    const redirectTo=new URL('nueva-contrasena.html',getAppBaseUrl()).href;
    const {data,error}=await sb.auth.resetPasswordForEmail(String(email||'').trim().toLowerCase(),{redirectTo});
    if(error)throw error;
    return data;
  }

  async function updatePassword(password){
    assertClient();
    const {data,error}=await sb.auth.updateUser({password:String(password||'')});
    if(error)throw error;
    return data;
  }

  async function claimReservations(){
    const {data,error}=await sb.rpc(RPC_CLAIM_RESERVATIONS);
    if(error)throw error;
    return Number(data||0);
  }

  async function requireBusiness(){
    const session=await getSession();
    if(!session){
      window.location.href='login.html?next=profesional.html';
      return null;
    }
    try{
      return await ensureBusiness(session.user);
    }catch(err){
      if(String(err?.message||'').includes('FILA_CERO_ACCOUNT_BLOCKED')){
        await sb.auth.signOut();
        window.location.href='login.html?blocked=1';
        return null;
      }
      throw err;
    }
  }

  async function requireAdmin(){
    const session=await getSession();
    if(!session){
      window.location.href='login.html?next=admin.html';
      return null;
    }
    if(!(await isAdmin())){
      window.location.href='profesional.html';
      return null;
    }
    return session.user;
  }

  async function uploadPortfolio(files){
    assertClient();
    const user=await currentUser();
    if(!user) throw new Error('Debes iniciar sesión para subir imágenes.');

    const selected=Array.from(files||[]).slice(0,12);
    const urls=[];
    for(let i=0;i<selected.length;i++){
      const file=selected[i];
      if(file.size>5*1024*1024) throw new Error(`${file.name}: máximo 5 MB por imagen.`);
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error(`${file.name}: usa JPG, PNG o WEBP.`);

      const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=`${user.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const {error}=await sb.storage.from(PORTFOLIO_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false});
      if(error) throw error;
      const {data}=sb.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path);
      if(data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }


  async function removePortfolioFolder(ownerId){
    if(!ownerId) return;
    const {data,error}=await sb.storage.from(PORTFOLIO_BUCKET).list(String(ownerId),{
      limit:1000,
      offset:0,
      sortBy:{column:'name',order:'asc'}
    });
    if(error) throw error;
    const paths=(data||[]).filter(item=>item?.id!==null).map(item=>`${ownerId}/${item.name}`);
    if(!paths.length) return;
    const removed=await sb.storage.from(PORTFOLIO_BUCKET).remove(paths);
    if(removed.error) throw removed.error;
  }

  async function deleteMyBusiness(){
    const user=await currentUser();
    if(!user) throw new Error('AUTH_REQUIRED');
    await removePortfolioFolder(user.id);
    const {data,error}=await sb.rpc(RPC_DELETE_MY_BUSINESS);
    if(error) throw error;
    await logout();
    return data;
  }

  async function adminListBusinesses(){
    const {data,error}=await sb.rpc(RPC_ADMIN_LIST_BUSINESSES);
    if(error) throw error;
    return data||[];
  }

  async function adminDeleteBusiness(businessId,{blockOwner=true,reason='Contenido o uso no permitido en Fila Cero'}={}){
    if(!businessId) throw new Error('BUSINESS_ID_REQUIRED');
    const businesses=await adminListBusinesses();
    const target=businesses.find(item=>item.id===businessId);
    if(target?.owner_id) await removePortfolioFolder(target.owner_id);
    const {data,error}=await sb.rpc(RPC_ADMIN_DELETE_BUSINESS,{
      p_business_id:businessId,
      p_block_owner:!!blockOwner,
      p_reason:String(reason||'').trim()||'Moderación de Fila Cero'
    });
    if(error) throw error;
    return data;
  }

  async function adminListBlocked(){
    const {data,error}=await sb.rpc(RPC_ADMIN_LIST_BLOCKED);
    if(error) throw error;
    return data||[];
  }

  async function adminUnblockOwner(ownerId){
    const {data,error}=await sb.rpc(RPC_ADMIN_UNBLOCK,{p_owner_id:ownerId});
    if(error) throw error;
    return data===true;
  }

  function normalizeBusiness(b){
    if(!b)return null;
    return {
      ...b,
      ownerId:b.owner_id,
      portfolio:Array.isArray(b.portfolio_urls)?b.portfolio_urls:[],
      profileEnabled:b.profile_enabled!==false
    };
  }

  window.FCAUTH={
    COMMUNES,
    getSession,
    currentUser,
    currentBusiness,
    hasBusiness,
    isAdmin,
    isBlocked,
    createAccount,
    login,
    logout,
    updateBusiness,
    getBusiness,
    googleLogin,
    sendPasswordReset,
    updatePassword,
    claimReservations,
    requireBusiness,
    requireAdmin,
    uploadPortfolio,
    removePortfolioFolder,
    deleteMyBusiness,
    adminListBusinesses,
    adminDeleteBusiness,
    adminListBlocked,
    adminUnblockOwner,
    normalizeBusiness
  };
})();
