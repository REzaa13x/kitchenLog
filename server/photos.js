const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
function decodePhoto(value) {
 if(typeof value !== 'string' || value.length > 700000) return null;
 const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match) return null;
 const data=Buffer.from(match[2],'base64');
 if(data.length > 512*1024 || data.toString('base64')!==match[2]) return null;
 const mime=match[1];
 // ponytail: signature/container validation, not image decoding; add a decoder if pixel validation becomes necessary.
 const valid=mime==='image/png' ? data.length>=24 && data.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) && data.toString('ascii',12,16)==='IHDR'
 : mime==='image/jpeg' ? data.length>=4 && data[0]===255 && data[1]===216 && data[2]===255 && data[data.length-2]===255 && data[data.length-1]===217
 : data.length>=16 && data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP' && ['VP8 ','VP8L','VP8X'].includes(data.toString('ascii',12,16)) && data.readUInt32LE(4)===data.length-8;
 return valid ? {data,mime} : null;
}
/**
 * Pastikan foto milik pengguna ini di workspace ini. `private_photos` adalah
 * bukti baru; `photos` lama tetap boleh dipakai bila pengunggahnya sama.
 */
export async function assertAttendancePhoto(connection, workspaceId, userId, photoId) {
 if(validId(workspaceId) && validId(photoId)) {
  const [rows]=await connection.query('SELECT id FROM private_photos WHERE workspace_id=? AND user_id=? AND id=? LIMIT 1',[workspaceId,userId,photoId]);
  if(rows.length) return;
 }
 throw Object.assign(new Error('Foto absensi belum tersimpan atau bukan milik Anda.'),{status:400});
}
export function registerPhotos(app, { getPool, requireAuth, loadWorkspace }) {
 app.post('/api/photos', requireAuth, async (req, res) => {
  try {
   const {workspaceId,id,dataUrl,source}=req.body ?? {};
   const decoded=decodePhoto(dataUrl);
   if(!validId(workspaceId)||!validId(id)||!['camera','upload'].includes(source)||!decoded) return res.status(400).json({error:'Foto tidak valid (maksimal 512KB).'});
   const access=await loadWorkspace(req.user.id,req.user.email,workspaceId);
   if(access.error) return res.status(access.status).json({error:access.error});
   const db=getPool();
   const [legacyClash]=await db.query('SELECT id FROM photos WHERE workspace_id=? AND BINARY id=BINARY ? LIMIT 1',[workspaceId,id]);
   if(legacyClash.length) return res.status(409).json({error:'ID foto sudah dipakai bukti lama. Gunakan foto baru.'});
   try {
    await db.query('INSERT INTO private_photos (workspace_id,id,user_id,source,mime_type,data) VALUES (?,?,?,?,?,?)',[workspaceId,id,req.user.id,source,decoded.mime,decoded.data]);
    return res.status(201).json({id});
   } catch(err) {
    if(err.code!=='ER_DUP_ENTRY') throw err;
    const [[existing]]=await db.query('SELECT user_id,source,mime_type,data FROM private_photos WHERE workspace_id=? AND id=?',[workspaceId,id]);
    if(existing?.user_id===req.user.id && existing.source===source && existing.mime_type===decoded.mime && existing.data.equals(decoded.data)) return res.json({id});
    return res.status(409).json({error:'ID foto sudah digunakan. Gunakan foto baru.'});
   }
  } catch { res.status(500).json({error:'Gagal menyimpan foto.'}); }
 });
 app.get('/api/photos/:id', requireAuth, async (req,res)=>{
  res.set('Cache-Control','private, no-store');
  try {
   const {workspaceId}=req.query;
   if(!validId(workspaceId)||!validId(req.params.id)) return res.status(400).json({error:'ID foto tidak valid.'});
   const access=await loadWorkspace(req.user.id,req.user.email,workspaceId);
   if(access.error) return res.status(access.status).json({error:access.error});
   const [[photo]]=await getPool().query('SELECT id,user_id,source,mime_type,data,created_at FROM private_photos WHERE workspace_id=? AND id=?',[workspaceId,req.params.id]);
   if(!photo) {
    const [[legacy]]=await getPool().query('SELECT id,source,data_url,uploader_email,created_at FROM photos WHERE workspace_id=? AND BINARY id=BINARY ?',[workspaceId,req.params.id]);
    if(legacy && (access.isSupervisor || String(legacy.uploader_email).toLowerCase()===req.user.email.toLowerCase()) && decodePhoto(legacy.data_url)) return res.json({id:legacy.id,source:legacy.source,dataUrl:legacy.data_url,createdAt:legacy.created_at});
   }
   if(!photo || (photo.user_id!==req.user.id && !access.isSupervisor)) return res.status(404).json({error:'Foto tidak ditemukan.'});
   return res.json({id:photo.id,source:photo.source,dataUrl:`data:${photo.mime_type};base64,${photo.data.toString('base64')}`,createdAt:photo.created_at});
  } catch { res.status(500).json({error:'Gagal memuat foto.'}); }
 });
}
/**
 * Rute lama `/api/photos` diganti rute privat di atas. Bila id sudah dipakai
 * bukti lama (`photos`), tolak agar bukti lama tidak bisa ditimpa/dipalsukan.
 */
export async function legacyPhotoIdTaken(connection, workspaceId, id) {
 if(!validId(workspaceId)||!validId(id)) return false;
 const [rows]=await connection.query('SELECT id FROM photos WHERE workspace_id=? AND BINARY id=BINARY ? LIMIT 1',[workspaceId,id]);
 return rows.length>0;
}
