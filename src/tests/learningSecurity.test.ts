import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import * as kingdom from '../../supabase/functions/learning/kingdom';

const code=ts.transpileModule(readFileSync('supabase/functions/learning/index.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function setup(authenticated=true) {
  const rpc=vi.fn(async (name:string) => ({data:name==='consume_backend_rate_limit'?true:{question:{},stats:{},reward:{},kingdom:{}},error:null}));
  const admin={rpc,auth:{getUser:async()=>({data:{user:authenticated?{id:'verified-owner'}:null},error:null})}};
  let handler!:(request:Request)=>Promise<Response>;
  new Function('require','exports','Deno',code)((name:string)=>{
    if(name==='npm:@supabase/supabase-js@2') return {createClient:()=>admin};
    if(name==='./kingdom.ts') return kingdom;
    return {};
  },{},{env:{get:()=> 'configured'},serve:(run:typeof handler)=>{handler=run;}});
  return {rpc,run:(body:unknown)=>handler(new Request('https://test.invalid/learning',{
    method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify(body),
  }))};
}
describe('Learning HTTP authorization and intent boundary',()=>{
  it('rejects an invalid session before any privileged RPC',async()=>{
    const app=setup(false); expect((await app.run({action:'answer'})).status).toBe(401); expect(app.rpc).not.toHaveBeenCalled();
  });
  it('uses the verified identity and ignores submitted rewards and user ID',async()=>{
    const app=setup(); expect((await app.run({action:'answer',questionId:'issued',selectedIndex:2,userId:'victim',correct:true,gold:99999})).status).toBe(200);
    expect(app.rpc).toHaveBeenCalledWith('record_question_answer',{p_user_id:'verified-owner',p_question_id:'issued',p_selected_index:2});
  });
  it.each([null,'0',4,-1,0.2])('rejects invalid answer index %s',async selectedIndex=>{
    const app=setup(); expect((await app.run({action:'answer',questionId:'issued',selectedIndex})).status).toBe(400);
    expect(app.rpc.mock.calls.some(([name])=>name==='record_question_answer')).toBe(false);
  });
  it.each(['upgrade','claim_daily'])('retires unsafe legacy action %s',async action=>{
    const app=setup(); expect((await app.run({action})).status).toBe(410);
    expect(app.rpc.mock.calls.map(([name])=>name)).toEqual(['consume_backend_rate_limit']);
  });
  it('rejects invented reward commands and oversized requests',async()=>{
    const app=setup();
    expect((await app.run({action:'kingdom_command',command:{type:'answer',correct:true}})).status).toBe(400);
    expect((await app.run({action:'chat',message:'x'.repeat(9000)})).status).toBe(413);
    expect(app.rpc.mock.calls.some(([name])=>name==='commit_kingdom_command')).toBe(false);
  });
});
