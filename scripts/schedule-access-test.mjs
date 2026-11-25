// Real MySQL + HTTP; isolated disposable database. Run: node scripts/schedule-access-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import mysql from 'mysql2/promise';
import { registerExtraRoutes } from '../server/routes-extra.js';

export async function createFixture() {
  const config = process.env.TEST_MYSQL_URL ? ((u) => ({host:u.hostname,port:Number(u.port)||3306,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}))(new URL(process.env.TEST_MYSQL_URL)) : {host:'127.0.0.1',user:'root'};
  const database = `dapurops_schedule_test_${crypto.randomBytes(6).toString('hex')}`;
  const admin = await mysql.createConnection(config);
  await admin.query(`CREATE DATABASE \`${database}\``);
  const db = mysql.createPool({...config,database,dateStrings:true});
  let server;
  const close = async () => { if(server) { server.closeAllConnections(); await new Promise(r=>server.close(r)); } await db.end(); await admin.query(`DROP DATABASE \`${database}\``); await admin.end(); };
  try {
    const schema = await fs.readFile(new URL('../database/dapurops-schema.sql',import.meta.url),'utf8');
    for(const sql of schema.replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/,'').replace(/USE `ngola_dapurops`;/,'').split(';')) if(sql.trim()) await db.query(sql);
    await db.query("INSERT INTO users (id,email,password_hash,name,role) VALUES ('admin','admin@test.invalid','unused','Admin','supervisor'),('alice','alice@test.invalid','unused','Alice','staff'),('bob','bob@test.invalid','unused','Bob','staff'),('outsider','out@test.invalid','unused','Outside','staff')");
    await db.query("INSERT INTO workspaces (id,kitchen_name,owner_id,owner_email,member_emails,supervisor_emails) VALUES ('ws','Kitchen','admin','admin@test.invalid','admin@test.invalid,alice@test.invalid,bob@test.invalid','admin@test.invalid'),('other','Other','outsider','out@test.invalid','out@test.invalid','')");
    await db.query("INSERT INTO staff (id,workspace_id,name,email,role,job_title) VALUES ('staff-alice','ws','Alice','alice@test.invalid','staff','Cook'),('staff-bob','ws','Bob','bob@test.invalid','staff','Cook'),('staff-outside','other','Outside','out@test.invalid','staff','Cook')");
    const app = express(); app.use(express.json());
    registerExtraRoutes(app,{
      getPool:()=>db,uid:p=>`${p}-${crypto.randomUUID()}`,wibNow:()=>({date:'2026-11-25',time:'12:00'}),
      requireAuth:async(req,res,next)=>{ const [[user]]=await db.query('SELECT * FROM users WHERE id=?',[req.headers['x-test-user']||'admin']); if(!user)return res.status(401).json({error:'Unauthorized'});req.user=user;next(); },
      loadWorkspace:async(id,email,workspaceId)=>{ const [[workspace]]=await db.query('SELECT * FROM workspaces WHERE id=?',[workspaceId]);return !workspace?{error:'Missing',status:404}:!workspace.member_emails.split(',').includes(email)?{error:'Forbidden',status:403}:{workspace,isSupervisor:id==='admin'&&workspaceId==='ws'}; }
    });
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const request=async(path,body,user='admin')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:'POST',headers:{'Content-Type':'application/json','x-test-user':user},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
    return {db,request,close};
  } catch(error) { await close();throw error; }
}

async function run() {
  const {db,request,close}=await createFixture();
  try {
    const schedule={workspaceId:'ws',date:'2026-11-25',shift:'opening',staffIds:['alice'],picId:'alice'};
    assert.equal((await request('/assignments',{...schedule,date:'2026-02-30'})).status,400,'reject impossible calendar date');
    for(const invalid of [{staffIds:['outsider'],picId:'outsider'},{staffIds:['staff-outside'],picId:'staff-outside'},{staffIds:['alice','alice']},{staffIds:['alice','staff-alice']},{staffIds:Array(101).fill('alice')},{staffIds:[4]},{picId:'bob'}]) assert.equal((await request('/assignments',{...schedule,...invalid})).status,400,'reject invalid membership/PIC');
    const created=await request('/assignments',{...schedule,staffIds:['staff-alice'],picId:'alice'});assert.equal(created.status,201);
    const repeated=await request('/assignments',schedule);assert.equal(repeated.body.id,created.body.id,'upsert returns persisted ID');
    await db.query("INSERT INTO attendance (id,workspace_id,assignment_id,att_date,shift,staff_id,staff_email,check_in_time) VALUES ('present','ws',?,'2026-11-25','opening','staff-alice','alice@test.invalid','08:00')",[created.body.id]);
    assert.equal((await request('/assignments',{...schedule,staffIds:['bob'],picId:'bob'})).status,409,'attendance freezes schedule');
    assert.equal((await request('/assignments',schedule)).status,201,'exact no-op allowed');
    const absence={workspaceId:'ws',assignmentId:created.body.id,staffId:'alice',status:'Izin',note:'Medical appointment'};
    for(const note of ['', ' ', 4, 'x'.repeat(1001)]) assert.equal((await request('/attendance/absence',{...absence,note})).status,400,'absence requires bounded reason');
    assert.equal((await request('/attendance/absence',{...absence,staffId:'staff-outside'})).status,400,'absence cannot resolve foreign staff');
    assert.equal((await request('/attendance/absence',{...absence,staffId:'bob'})).status,403,'absence requires assigned staff');
    assert.equal((await request('/attendance/absence',absence)).status,409,'cannot overwrite legacy present attendance');
    await db.query("INSERT INTO assignments (id,workspace_id,shift_date,shift,staff_ids,pic_id) VALUES ('absent','ws','2026-11-26','opening','staff-alice','staff-alice')");
    assert.equal((await request('/attendance/absence',{...absence,assignmentId:'absent'})).status,200,'canonical user resolves assigned legacy ID');
    const [[absent]]=await db.query("SELECT * FROM attendance WHERE assignment_id='absent'");assert.equal(absent.staff_id,'alice');assert.equal(absent.staff_email,'alice@test.invalid');
    assert.equal((await request('/assignments',{...schedule,date:'2026-11-26',staffIds:['bob'],picId:'bob'})).status,409,'absence history freezes schedule');
    console.log('PASS schedule trust boundaries (MySQL + HTTP)');
  } finally {await close();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) await run();
