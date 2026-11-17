export async function get(path:string,query='') {
 const response=await fetch('/api'+path+(query?'?'+query:''));
 if(!response.ok)throw new Error('API '+response.status+' — données indisponibles');
 return response.json();
}
