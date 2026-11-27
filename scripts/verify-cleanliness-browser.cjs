// UI fixtures only; database persistence covered by backend-auth-test.mjs.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const puppeteer=require(process.env.PUPPETEER_MODULE||'C:/Users/asus/AppData/Local/hermes/cache/pptr/node_modules/puppeteer-core');
(async()=>{
 const base=process.env.TEST_BASE||'http://127.0.0.1:4181';
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
 const dir=process.env.TEST_ARTIFACT_DIR||'C:/Users/asus/AppData/Local/hermes/cache/scratch/cleanliness';fs.mkdirSync(dir,{recursive:true});
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage();await page.setViewport({width:430,height:932});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const user={id:'cook',name:'Cook',email:'cook@test.invalid',role:'staff'};
 let attendance=[], reports=[], uploads=[], submissions=[], fail=true;
 await page.setRequestInterception(true);
 page.on('request',r=>{
  const p=new URL(r.url()).pathname;if(!p.startsWith('/api/'))return void r.continue();
  const send=(status,b)=>r.respond({status,contentType:'application/json',body:JSON.stringify(b)});
  if(p==='/api/auth/me')return send(200,{user,workspaces:[{id:'fixture',kitchenName:'Fixture'}]});
  if(p==='/api/state')return send(200,{kitchenName:'Fixture',users:[user],assignments:[{id:'shift',date,shift:'opening',staffIds:['cook'],picId:'cook'}],attendance,cleanlinessReports:reports,cleanlinessFollowups:[],itemReports:[]});
  if(p==='/api/photos'){const b=JSON.parse(r.postData());uploads.push(b);if(fail){fail=false;return send(503,{error:'Retry fixture'});}return send(201,{id:b.id});}
  if(p==='/api/cleanliness/my-checklist'){const b=JSON.parse(r.postData());submissions.push(b);attendance=[{id:'att',assignmentId:'shift',date,shift:'opening',staffId:'cook',checkInCleanliness:b.cleanliness}];return send(200,{ok:true});}
  if(p==='/api/cleanliness'){const b=JSON.parse(r.postData());submissions.push(b);reports=[{...b,id:'report',submittedAt:'06:00'}];return send(200,{ok:true});}
  return send(200,{tasks:[],progress:[]});
 });
 await page.goto(base);await page.evaluate(()=>{localStorage.setItem('kitchenlog_token_v1','fixture');localStorage.setItem('kitchenlog_ws_v1','fixture');});await page.reload({waitUntil:'networkidle2'});
 const click=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===t&&!b.disabled),{},text);await page.evaluate(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t&&!b.disabled).click(),text);};
 await click('Kebersihan');await page.waitForFunction(()=>document.body.textContent.includes('Checklist Kebersihan Saya'));
 await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Sudah Beres').forEach(b=>b.click()));
 await click('Simpan Checklist Saya');await page.waitForFunction(()=>document.body.textContent.includes('Foto dapur wajib diambil'));assert.equal(submissions.length,0);

 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);const s=c.captureStream(10);s.canvas=c;return s;};});
 await click('Buka Kamera');await page.waitForFunction(()=>document.querySelector('video')?.videoWidth>0);assert.ok(await page.$('[data-camera-guide=grid]'));assert.equal(await page.$('[data-camera-guide=oval]'),null);
 await (await page.$('[data-camera-guide=grid]')).scrollIntoView();await page.screenshot({path:dir+'/kitchen-grid.png'});
 await click('Ambil Foto');await click('Coba Lagi Unggah Foto');await page.waitForSelector('img[alt="Foto dapur (wajib)"]');assert.equal(uploads[0].id,uploads[1].id);
 await click('Simpan Checklist Saya');await page.waitForFunction(()=>document.body.textContent.includes('Checklist tersimpan.'));assert.ok(submissions[0].cleanliness.kitchenPhotoId);
 await click('Hari Ini');await click('Kirim Laporan Kebersihan');assert.equal(submissions.length,1);
 const file=dir+'/fixture.png';const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=640;const x=c.getContext('2d');x.fillStyle='#17665b';x.fillRect(0,0,640,640);x.fillStyle='white';x.font='32px sans-serif';x.fillText('FOTO UJI DAPUR — FIXTURE',60,320);return c.toDataURL('image/png').split(',')[1];});fs.writeFileSync(file,Buffer.from(fixture,'base64'));
 await (await page.$('input[aria-label="Foto Kondisi Umum Kitchen"]')).uploadFile(file);await page.waitForSelector('img[alt="Foto Kondisi Umum Kitchen"]');
 await (await page.$('img[alt="Foto Kondisi Umum Kitchen"]')).scrollIntoView();await page.screenshot({path:dir+'/pic-preview.png'});
 await click('Kirim Laporan Kebersihan');await page.waitForFunction(()=>document.body.textContent.includes('Laporan Kebersihan Sudah Dikirim'));assert.ok(submissions[1].generalPhotoId);
 await page.reload({waitUntil:'networkidle2'});await click('Kebersihan');await page.waitForSelector('img[alt="Foto dapur (wajib)"]');
 console.log('PASS UI required personal/PIC photos, grid camera, upload retry stable ID, previews, submission, reload; screenshots '+dir);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
