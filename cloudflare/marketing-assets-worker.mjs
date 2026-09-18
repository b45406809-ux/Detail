const CONTENT_TYPES={pdf:'application/pdf',png:'image/png',json:'application/json; charset=utf-8'};
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    const key=url.pathname==='/'?'manifest.json':decodeURIComponent(url.pathname.replace(/^\/assets\//,'').replace(/^\//,''));
    if(!key||key.includes('..'))return new Response('Not found',{status:404});
    const value=await env.ASSETS.get(key,{type:'arrayBuffer'});
    if(!value)return new Response('Not found',{status:404});
    const extension=key.split('.').pop()?.toLowerCase()||'';
    return new Response(value,{headers:{'content-type':CONTENT_TYPES[extension]||'application/octet-stream','cache-control':'public, max-age=3600','access-control-allow-origin':'*','content-disposition':url.searchParams.get('download')==='1'?`attachment; filename="${key.split('/').pop()}"`:'inline'}});
  }
};
