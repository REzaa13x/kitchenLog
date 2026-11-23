import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttendanceFaceModal } from '../src/components/AttendanceFaceModal';
for (const mode of ['checkin','checkout'] as const) {
 const html=renderToStaticMarkup(<AttendanceFaceModal open mode={mode} staffName="Uji" shift="opening" currentTimeHHMM="12:00" onClose={()=>{}} onConfirm={async()=>({ok:true,message:''})}/>);
 assert.match(html,/1\. Checklist kebersihan wajib/);
 assert.match(html,/2\. Foto kondisi dapur/);
 assert.match(html,/3\. Foto wajah/);
 assert.match(html,/Checklist lengkap: 0\/6/);
 const confirmButton = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Konfirmasi(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0];
 assert.ok(confirmButton);
 assert.doesNotMatch(confirmButton, /\sdisabled(?:=|\s|>)/);
 assert.match(html,/Buka Kamera Dapur/);
 assert.match(html,/Buka Kamera Wajah/);
 assert.equal((html.match(/Pilih kondisi/g)||[]).length,6);
}
console.log('PASS checklist dan foto dapur wajib pada check-in dan check-out');
