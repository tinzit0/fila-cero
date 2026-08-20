(function(){
  const DEFAULT_TZ='America/Santiago';
  function pad(v){return String(v).padStart(2,'0')}
  function localParts(dateStr,timeStr){
    const [y,m,d]=String(dateStr||'').split('-').map(Number),[hh,mm]=String(timeStr||'00:00').split(':').map(Number);
    return {y,m,d,hh:mm?hh:hh||0,mm:mm||0};
  }
  function zonedInstant(dateStr,timeStr,timeZone=DEFAULT_TZ){
    const p=localParts(dateStr,timeStr);let guess=Date.UTC(p.y,p.m-1,p.d,p.hh,p.mm,0);
    const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<3;i++){
      const parts=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
      const displayedAsUtc=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second||0);
      const targetAsUtc=Date.UTC(p.y,p.m-1,p.d,p.hh,p.mm,0);
      guess+=targetAsUtc-displayedAsUtc;
    }
    return new Date(guess);
  }
  function utcStamp(d){return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`}
  function dateRange(x){const start=zonedInstant(x.date,x.time,x.timeZone||DEFAULT_TZ),end=new Date(start.getTime()+Number(x.duration||30)*60000);return [utcStamp(start),utcStamp(end)]}
  function title(x){return `${x.service||'Reserva'} · ${x.businessName||'Fila Cero'}`}
  function description(x){return `Reserva realizada mediante Fila Cero.${x.price?` Valor: ${x.price}.`:''}${x.notes?` ${x.notes}`:''}`}
  function googleUrl(x){
    const [start,end]=dateRange(x);const q=new URLSearchParams({action:'TEMPLATE',text:title(x),dates:`${start}/${end}`,details:description(x),location:x.location||'',ctz:x.timeZone||DEFAULT_TZ});
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
  }
  function esc(s){return String(s||'').replace(/\\/g,'\\\\').replace(/([,;])/g,'\\$1').replace(/\r?\n/g,'\\n')}
  function ics(x){const [start,end]=dateRange(x);return ['BEGIN:VCALENDAR','VERSION:2.0','CALSCALE:GREGORIAN','METHOD:PUBLISH','PRODID:-//Fila Cero//Reserva//ES','BEGIN:VEVENT',`UID:${crypto.randomUUID?crypto.randomUUID():Date.now()}@fila-cero`,`DTSTAMP:${utcStamp(new Date())}`,`DTSTART:${start}`,`DTEND:${end}`,`SUMMARY:${esc(title(x))}`,`LOCATION:${esc(x.location||'')}`,`DESCRIPTION:${esc(description(x))}`,'END:VEVENT','END:VCALENDAR'].join('\r\n')}
  function downloadIcs(x){const blob=new Blob([ics(x)],{type:'text/calendar;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='reserva-fila-cero.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  window.FCCALENDAR={googleUrl,downloadIcs,dateRange};
})();
