(function(){
  const sb = window.FC_SUPABASE;
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

  async function ensureBusiness(user,businessName=''){
    if(!user) return null;
    let {data,error}=await sb.from('businesses').select('*').eq('owner_id',user.id).maybeSingle();
    if(error) throw error;
    if(data) return normalizeBusiness(data);

    const fallback=(businessName || user.user_metadata?.business_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Mi empresa').trim();
    const created=await sb.from('businesses').insert({owner_id:user.id,name:fallback}).select().single();
    if(created.error) throw created.error;
    return normalizeBusiness(created.data);
  }

  async function currentBusiness(){
    const user=await currentUser();
    if(!user) return null;
    return ensureBusiness(user);
  }

  async function createAccount({businessName,email,password}){
    assertClient();
    const {data,error}=await sb.auth.signUp({
      email:String(email||'').trim().toLowerCase(),
      password:String(password||''),
      options:{data:{business_name:String(businessName||'Mi empresa').trim()}}
    });
    if(error) throw error;
    if(data?.session && data?.user) await ensureBusiness(data.user,businessName);
    return {user:data?.user||null,session:data?.session||null,needsEmailConfirmation:!!data?.user&&!data?.session};
  }

  async function login(email,password){
    assertClient();
    const {data,error}=await sb.auth.signInWithPassword({
      email:String(email||'').trim().toLowerCase(),
      password:String(password||'')
    });
    if(error) throw error;
    if(data?.user) await ensureBusiness(data.user);
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
    const clean={...patch};
    delete clean.id; delete clean.owner_id; delete clean.created_at; delete clean.updated_at;
    const {data,error}=await sb.from('businesses').update(clean).eq('owner_id',user.id).select().single();
    if(error) throw error;
    return normalizeBusiness(data);
  }

  async function getBusiness(id){
    assertClient();
    if(!id) return null;
    const {data,error}=await sb.from('businesses').select('*').eq('id',id).maybeSingle();
    if(error) throw error;
    return data?normalizeBusiness(data):null;
  }

  async function googleLogin(){
    assertClient();
    if(location.protocol==='file:'){
      throw new Error('Google Login necesita abrir Fila Cero desde http://localhost o desde tu dominio, no con doble clic en el HTML. Revisa README-SUPABASE.txt.');
    }
    const redirectTo=new URL('profesional.html',window.location.href).href;
    const {data,error}=await sb.auth.signInWithOAuth({
      provider:'google',
      options:{redirectTo}
    });
    if(error) throw error;
    return data;
  }

  async function requireBusiness(){
    const session=await getSession();
    if(!session){
      window.location.href='login.html?next=profesional.html';
      return null;
    }
    return ensureBusiness(session.user);
  }

  async function uploadPortfolio(files){
    assertClient();
    const user=await currentUser();
    if(!user) throw new Error('Debes iniciar sesión para subir imágenes.');
    const selected=Array.from(files||[]).slice(0,3);
    const urls=[];
    for(let i=0;i<selected.length;i++){
      const file=selected[i];
      if(file.size>5*1024*1024) throw new Error(`${file.name}: máximo 5 MB por imagen.`);
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error(`${file.name}: usa JPG, PNG o WEBP.`);
      const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
      const path=`${user.id}/${Date.now()}-${i}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const {error}=await sb.storage.from('business-portfolio').upload(path,file,{cacheControl:'3600',upsert:false});
      if(error) throw error;
      const {data}=sb.storage.from('business-portfolio').getPublicUrl(path);
      if(data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }

  function normalizeBusiness(b){
    if(!b)return null;
    return {
      ...b,
      ownerId:b.owner_id,
      portfolio:Array.isArray(b.portfolio_urls)?b.portfolio_urls:[]
    };
  }

  window.FCAUTH={
    COMMUNES,getSession,currentUser,currentBusiness,createAccount,login,logout,
    updateBusiness,getBusiness,googleLogin,requireBusiness,uploadPortfolio,normalizeBusiness
  };
})();
