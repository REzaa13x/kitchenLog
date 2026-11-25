import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import mysql from 'mysql2/promise';
import { registerExtraRoutes } from '../server/routes-extra.js';
import { registerFrontend } from '../server/frontend.js';
import { registerPhotos, assertAttendancePhoto } from '../server/photos.js';
import { registerOperations } from '../server/operations.js';
import { isShift, lateMinutes, summarizeAttendance } from '../server/attendance-rules.js';
let roster=[{id:'S001',name:'Owner upstream',email:'admin@gmail.com',phone:'123',role:'admin',status:'active'},{id:'S981',name:'Fahreza',email:'fahreza@gmail.com',phone:null,role:'admin',status:'active'}];
let outage=false;
const upstream=http.createServer(async(req,res)=>{assert.equal(req.headers['x-api-key'],'test-only');res.setHeader('Content-Type','application/json');if(outage){res.writeHead(503);return res.end('{}');}if(req.method==='GET')return res.end(JSON.stringify({staff:roster}));let body='';for await(const chunk of req)body+=chunk;const b=JSON.parse(body);const staff=roster.find(s=>s.email===b.email);res.writeHead(staff&&b.password==='Up1234'?200:401);res.end(JSON.stringify(staff&&b.password==='Up1234'?{staff}:{}));});
upstream.listen(0,'127.0.0.1');await new Promise(r=>upstream.once('listening',r));
process.env.GEASTEATS_URL=`http://127.0.0.1:${upstream.address().port}`;process.env.DAPUROPS_INTEGRATION_KEY='test-only';process.env.GEASTEATS_WORKSPACE_ID='ws';
const database=`dapurops_geasteats_test_${crypto.randomBytes(6).toString('hex')}`;
const options={host:'127.0.0.1',user:'root',...(process.env.TEST_MYSQL_URL?Object.fromEntries((u=>[['host',u.hostname],['port',Number(u.port)||3306],['user',decodeURIComponent(u.username)],['password',decodeURIComponent(u.password)]])(new URL(process.env.TEST_MYSQL_URL))):{})};
const admin=await mysql.createConnection(options);await admin.query(`CREATE DATABASE \`${database}\``);await admin.query(`USE \`${database}\``);
const schema=(await fs.readFile(new URL('../database/dapurops-schema.sql',import.meta.url),'utf8')).replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/,'').replace(/USE `ngola_dapurops`;/,'');for(const sql of schema.split(';'))if(sql.trim())await admin.query(sql);
for(const name of ['20261123-staff-accounts.sql','20261123-attendance-cleanliness.sql','20261125-geasteats.sql','20261125-photos.sql','20261126-operations.sql']){try{for(const sql of (await fs.readFile(new URL('../database/migrations/'+name,import.meta.url),'utf8')).split(';'))if(sql.trim())await admin.query(sql);}catch(e){if(e.code!=='ENOENT')throw e;}}
const db=mysql.createPool({...options,database,dateStrings:true});
let createGeasteats;try{({createGeasteats}=await import('../server/geasteats.js'));}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const source=(await fs.readFile(new URL('../server/index.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/app\.listen\(PORT,[\s\S]*$/,'return {app,hashPassword};');
const {app,hashPassword}=new Function('express','mysql','crypto','registerExtraRoutes','createGeasteats','registerFrontend','registerPhotos','registerOperations','assertAttendancePhoto','isShift','lateMinutes','summarizeAttendance',source)(express,{createPool:()=>db},crypto,registerExtraRoutes,createGeasteats,registerFrontend,registerPhotos,registerOperations,assertAttendancePhoto,isShift,lateMinutes,summarizeAttendance);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
async function request(path,body,token,method='POST'){const r=await fetch(`http://127.0.0.1:${server.address().port}/api`+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}
try{
await admin.query("INSERT INTO users(id,email,password_hash,name,role) VALUES ('u_supervisor_75d4f29fee493805','admin@gmail.com',?,'Owner','supervisor'),('legacy','fahreza@gmail.com',?,'Legacy','staff')",[hashPassword('LocalPass123'),hashPassword('LocalPass123')]);
await admin.query("INSERT INTO workspaces(id,kitchen_name,owner_id,owner_email,member_emails,supervisor_emails) VALUES ('ws','Kitchen','u_supervisor_75d4f29fee493805','admin@gmail.com','admin@gmail.com,fahreza@gmail.com','admin@gmail.com')");
let login=await request('/auth/login',{email:'admin@gmail.com',password:'LocalPass123'});assert.equal(login.status,200);const token=login.body.token;
assert.equal((await request('/integrations/geasteats/sync',{},token)).status,200,'admin sync exists');
const [[legacy]]=await admin.query("SELECT * FROM users WHERE id='legacy'");assert.equal(legacy.geasteats_staff_id,null,'roster never claims legacy email');
const oldSession=await request('/auth/login',{email:'fahreza@gmail.com',password:'LocalPass123'});
assert.equal((await request('/auth/login',{email:'fahreza@gmail.com',password:'Up1234'})).status,200,'authenticated email safely links legacy');
assert.equal((await request('/auth/me',undefined,oldSession.body.token,'GET')).status,401,'linking revokes preexisting legacy sessions');
const [[linked]]=await admin.query("SELECT * FROM users WHERE id='legacy'");assert.equal(linked.geasteats_staff_id,'S981');
const signed=await request('/auth/login',{email:'fahreza@gmail.com',password:'Up1234'});assert.equal(signed.body.user.id,'legacy');assert.equal(signed.body.user.role,'staff','upstream admin cannot elevate');
assert.equal((await request('/auth/login',{email:'fahreza@gmail.com',password:'LocalPass123'})).status,401,'linked local hash disabled');
assert.equal((await request('/integrations/geasteats/sync',{},signed.body.token)).status,403,'sync admin only');
const state=await request('/state?workspaceId=ws',undefined,token,'GET');const member=state.body.users.find(u=>u.id==='legacy');
assert.equal((await request(`/staff/${member.staffId}`,{workspaceId:'ws',name:'Overwrite',password:'ResetPass123'},token,'PATCH')).status,403,'imported profiles immutable locally');
assert.equal((await request(`/staff/${member.staffId}?workspaceId=ws`,undefined,token,'DELETE')).status,403,'imported membership cannot be deleted');
roster.push({id:'SNEW',name:'Imported',email:'new@test.invalid',role:'admin',phone:'1'.repeat(50),status:'active'});
assert.equal((await request('/integrations/geasteats/sync',{},token)).status,200);
const [[imported]]=await admin.query("SELECT * FROM users WHERE geasteats_staff_id='SNEW'");assert.ok(imported);assert.match(imported.password_hash,/^scrypt\$/);assert.equal(imported.phone.length,50);
roster[1]={...roster[1],email:'renamed@test.invalid',name:'Renamed'};
assert.equal((await request('/integrations/geasteats/sync',{},token)).status,200);
const renamed=await request('/auth/login',{email:'renamed@test.invalid',password:'Up1234'});assert.equal(renamed.body.user.id,'legacy','immutable external identity survives email changes');
assert.equal((await request('/auth/me',undefined,renamed.body.token,'GET')).status,200);
outage=true;assert.equal((await request('/integrations/geasteats/sync',{},token)).status,503); // failed sync must not reuse cached authorization
await new Promise(r=>setTimeout(r,30100));
assert.equal((await request('/auth/me',undefined,renamed.body.token,'GET')).status,503,'expired upstream cache fails closed');
assert.equal((await request('/auth/login',{email:'admin@gmail.com',password:'LocalPass123'})).status,200,'unlinked legacy account independent during outage');
assert.equal((await request('/auth/login',{email:'renamed@test.invalid',password:'LocalPass123'})).status,503,'linked hash cannot bypass outage');
outage=false;roster[1].status='inactive';
assert.equal((await request('/auth/me',undefined,renamed.body.token,'GET')).status,401,'inactive revokes session');
const [[sessionCount]]=await admin.query("SELECT COUNT(*) AS n FROM sessions WHERE user_id='legacy'");assert.equal(sessionCount.n,0);
const owner=await request('/auth/login',{email:'admin@gmail.com',password:'Up1234'});assert.equal(owner.body.user.id,'u_supervisor_75d4f29fee493805');assert.equal(owner.body.user.role,'supervisor');
assert.ok(!JSON.stringify(owner.body).includes('password_hash'));assert.ok(!JSON.stringify(owner.body).includes('test-only'));
console.log('PASS Geasteats real MySQL + mock HTTP: sync, linking, immutable identity, role isolation, readonly accounts, outage, 30s TTL, session revocation');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await db.end();await admin.query(`DROP DATABASE \`${database}\``);await admin.end();}
