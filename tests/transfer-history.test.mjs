import test from "node:test";
import assert from "node:assert/strict";
import { transferRecord, mergeTransfer } from "../src/lib/transferHistoryPlan.js";

test("transfer history excludes file bytes and connection secrets", () => {
  const row = transferRecord({ id:"a", to:"b", toName:"Laptop", phase:"done", total:3, file:new Blob(["abc"]), sdp:"private", files:[{name:"../test.txt",size:3,mime:"text/plain",blob:new Blob(["abc"])}] }, "out", 10);
  assert.equal(row.files[0].name.includes("/"), false);
  assert.equal(row.size,3);
  assert.equal(JSON.stringify(row).includes("blob"),false);
  assert.equal(JSON.stringify(row).includes("private"),false);
  assert.equal(Object.hasOwn(row,"file"),false);
});
test("completion replaces pending record and preserves saved file references", () => {
  const old={id:"in:a",at:10,phase:"unknown",saved:{0:{fileId:"stored-id"}}};
  const rows=mergeTransfer([old],{id:"in:a",at:20,phase:"done"});
  assert.equal(rows.length,1);assert.equal(rows[0].at,10);assert.equal(rows[0].phase,"done");
  assert.equal(rows[0].saved[0].fileId,"stored-id");
});
test("history keeps newest 100 entries and separates directions", () => {
  let rows=[];
  for(let i=0;i<110;i++) rows=mergeTransfer(rows,{id:`out:${i}`,at:i+1});
  assert.equal(rows.length,100);assert.equal(rows.at(-1).id,"out:10");
  rows=mergeTransfer(rows,{id:"in:109",at:111});
  assert.ok(rows.some(x=>x.id==="out:109"));assert.equal(rows[0].id,"in:109");
});
