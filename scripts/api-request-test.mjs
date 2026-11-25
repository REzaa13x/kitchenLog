import assert from 'node:assert/strict';
import { apiRequest } from '../src/lib/apiRequest.ts';
const original=globalThis.fetch;
try{globalThis.fetch=async()=>new Response('<html>gateway</html>');await assert.rejects(()=>apiRequest('/api',{}),/JSON|server/);globalThis.fetch=async()=>new Response(JSON.stringify({error:'Sesi berakhir'}),{status:401});await assert.rejects(()=>apiRequest('/api',{}),e=>e.status===401);globalThis.fetch=async(_url,opts)=>{assert.ok(opts.signal);return new Response(JSON.stringify({ok:true}));};assert.deepEqual(await apiRequest('/api',{}),{ok:true});console.log('PASS JSON gate, HTTP errors, bounded network request');}finally{globalThis.fetch=original;}
