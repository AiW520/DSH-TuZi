import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanionService } from '../pet/src/companion-service.mjs';
const require=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const {chromium}=require('playwright'); const {build}=createRequire(require.resolve('tsx/package.json'))('esbuild');
const root=await mkdtemp(join(tmpdir(),'bunny-panel-'));
let started, release, hold=false;const began=new Promise(r=>started=r);
const service=new CompanionService({file:join(root,'settings.json'),environment:()=>({visible:true,busy:false}),generate:async()=>{if(hold){started();await new Promise(r=>release=r);}return JSON.stringify({action:'wave',mood:'happy',text:'小林你好呀'});}});
const component=fileURLToPath(new URL('../brand/companion-panel.jsx',import.meta.url));
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CompanionPanel} from ${JSON.stringify(component)};createRoot(document.getElementById('root')).render(<React.StrictMode><CompanionPanel/></React.StrictMode>);`,loader:'jsx',resolveDir:fileURLToPath(new URL('../../apps/web/',import.meta.url))},bundle:true,platform:'browser',write:false,format:'iife',alias:{react:require.resolve('react')}});
const server=createServer(async(req,res)=>{
 const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 try {
  if(req.url==='/app.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(bundle.outputFiles[0].text);return;}
  if(req.url==='/dsh-pet-7340/models')return json({providers:[{id:'tuzi',name:'TuZi',models:[{id:'test',name:'测试模型'}]}]});
  if(req.url.startsWith('/dsh-pet-7340/companion')){
   let body='';for await(const chunk of req)body+=chunk;
   if(req.method==='GET')return json(await service.get());
   if(req.method==='PUT')return json(await service.update(JSON.parse(body)));
   if(req.method==='DELETE')return json(await service.clearMemory());
   return json(await service.think(JSON.parse(body)));
  }
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/app.js"></script>');
 }catch(e){json({error:e.message},400);}
});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:process.env.DSH_TEST_BROWSER_CHANNEL||'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1000,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'陪伴设置与聊天'}).click();
 await page.getByLabel('开启 AI 陪伴').check();await page.getByRole('button',{name:'保存设置',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'请选择供应商和模型'}).waitFor();
 await page.getByLabel('供应商',{exact:true}).selectOption('tuzi');await page.getByLabel('陪伴模型',{exact:true}).selectOption('test');
 await page.getByLabel('希望兔兔怎样称呼你').fill('小林');await page.getByLabel('想让它记住的偏好').fill('喜欢安静');
 await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.getByRole('status').filter({hasText:'已保存'}).waitFor();
 await page.getByLabel('和云朵兔说句话').fill('你好');await page.getByRole('button',{name:'发送',exact:true}).click();
 await page.getByLabel('陪伴聊天记录').getByText('小林你好呀',{exact:false}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
 await page.getByRole('button',{name:'陪伴设置与聊天'}).click();await page.getByLabel('希望兔兔怎样称呼你').waitFor();assert.equal(await page.getByLabel('希望兔兔怎样称呼你').inputValue(),'小林');
 await page.getByRole('button',{name:'清空记忆',exact:true}).click();await page.getByRole('status').filter({hasText:'已清空'}).waitFor();assert.equal((await service.get()).history.length,0);assert.equal((await service.get()).usage.calls,1);
 // Ensure disable remains usable while a provider is slow.
 service.data.usage.lastCall=0;hold=true;
 await page.getByLabel('和云朵兔说句话').fill('慢回复');await page.getByRole('button',{name:'发送',exact:true}).click();await began;
 await page.getByRole('button',{name:'立即关闭 AI',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('input[type=checkbox]').checked);release();
 assert.equal((await service.get()).settings.enabled,false);
 const out=fileURLToPath(new URL('../../../outputs/cloud-bunny-ai/',import.meta.url));await mkdir(out,{recursive:true});
 await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:join(out,'settings-dark.png')});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light'});await page.screenshot({path:join(out,'settings-mobile.png')});
 assert(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.deepEqual(errors,[]);
 console.log('PASS companion settings, model selection, validation, chat, memory, slow-call disable, Escape, dark/mobile layout.');
}finally{service.dispose();release?.();if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
