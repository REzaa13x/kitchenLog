import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttendanceFaceModal } from '../src/components/AttendanceFaceModal';
for (const mode of ['checkin','checkout'] as const) {
 const html=renderToStaticMarkup(<AttendanceFaceModal open mode={mode} staffName="Uji" shift="opening" currentTimeHHMM="12:00" onClose={()=>{}} onConfirm={async()=>({ok:true,message:''})}/>);
 assert.match(html,/Foto kondisi dapur \(opsional\)/);
 assert.match(html,/Foto wajah \(wajib\)/);
 assert.doesNotMatch(html,/<select|Checklist lengkap/);
 const confirmButton = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Konfirmasi(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0];
 assert.ok(confirmButton);
 assert.doesNotMatch(confirmButton, /\sdisabled(?:=|\s|>)/);
 assert.match(html,/Buka Kamera Dapur/);
 assert.match(html,/Buka Kamera Wajah/);
 assert.match(html,/attendance-kitchen-photo/);
}
console.log('PASS wajah wajib, dapur opsional, checklist terpisah pada kedua aksi');
