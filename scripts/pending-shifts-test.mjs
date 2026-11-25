import assert from 'node:assert/strict';
import { visibleAssignments } from '../src/utils/visibleAssignments.ts';
const assignments=[{id:'old',date:'2026-11-24',staffIds:['u']},{id:'today',date:'2026-11-25',staffIds:['u']},{id:'future',date:'2026-11-26',staffIds:['u']}];
assert.deepEqual(visibleAssignments(assignments,[{assignmentId:'old',staffId:'u',checkInTime:'16:00',checkOutTime:null}],'u','2026-11-25').map(a=>a.id),['old','today']);
assert.deepEqual(visibleAssignments(assignments,[{assignmentId:'old',staffId:'u',checkInTime:'16:00',checkOutTime:'17:00'}],'u','2026-11-25').map(a=>a.id),['today']);console.log('PASS pending prior shift visible until checkout');
