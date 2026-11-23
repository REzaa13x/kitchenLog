import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttendanceFaceModal } from '../src/components/AttendanceFaceModal';
for (const mode of ['checkin','checkout'] as const) {
 const html=renderToStaticMarkup(<AttendanceFaceModal open mode={mode} staffName="Uji" shift="opening" currentTimeHHMM="12:00" onClose={()=>{}} onConfirm={async()=>({ok:true,message:''})}/>);
 assert.match(html,/Checklist kebersihan wajib/);
 assert.match(html,/Foto kondisi dapur/);
 assert.equal((html.match(/Pilih kondisi/g)||[]).length,6);
}
console.log('PASS checklist dan foto dapur wajib pada check-in dan check-out');
