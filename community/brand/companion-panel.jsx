import React, { useEffect, useRef, useState } from 'react'

import { DEFAULT_SETTINGS as defaults, COMPANION_REASONS as reasons } from '../pet/src/companion-contract.mjs'
const field = { display: 'grid', gap: 5, marginBottom: 12 }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--dsh-line, #a6afa9)', color: 'inherit', background: 'transparent', font: 'inherit' }
const buttonStyle = { ...inputStyle, width: 'auto', cursor: 'pointer' }

export function CompanionPanel() {
  const dialog = useRef(null), requests = useRef(new Set()), mounted = useRef(false), epoch = useRef(0)
  const [open, setOpen] = useState(false), [settings, setSettings] = useState(defaults)
  const [data, setData] = useState(null), [providers, setProviders] = useState([])
  const [busy, setBusy] = useState(false), [chatting, setChatting] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [text, setText] = useState('')
  async function api(path = '', options = {}) {
    const controller = new AbortController(); requests.current.add(controller)
    const timer = setTimeout(() => controller.abort(), path === '/think' ? 65000 : 15000)
    try {
      const response = await fetch('/dsh-pet-7340/companion' + path, { cache: 'no-store', ...options, signal: controller.signal })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || '请求失败，请重试')
      return body
    } finally { clearTimeout(timer); requests.current.delete(controller) }
  }
  function receive(result) { setData(result); setSettings(result.settings) }
  async function load() {
    const current = epoch.current; const active = () => mounted.current && epoch.current === current
    setBusy(true); setError('')
    try { const result = await api(); if (active()) receive(result) }
    catch (e) { if (active()) setError(e.name === 'AbortError' ? '读取超时，请重试' : e.message) }
    finally { if (active()) setBusy(false) }
  }
  useEffect(() => {
    if (!open) return
    mounted.current = true; const current = ++epoch.current; const active = () => mounted.current && epoch.current === current; dialog.current.showModal(); setChatting(false); void load()
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000)
    fetch('/dsh-pet-7340/models', { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error('模型列表读取失败')
      const body = await r.json(); if (active()) setProviders(body.providers || [])
    }).catch(e => { if (active() && !controller.signal.aborted) setError(e.message) }).finally(() => clearTimeout(timer))
    return () => { mounted.current = false; epoch.current++; controller.abort(); clearTimeout(timer); for (const c of requests.current) c.abort(); requests.current.clear(); dialog.current?.close() }
  }, [open])
  async function save(value = settings) {
    const current = epoch.current; const active = () => mounted.current && epoch.current === current
    setBusy(true); setError(''); setNotice('')
    try { const result = await api('', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) }); if (active()) { receive(result); setNotice('陪伴设置已保存') } }
    catch (e) { if (active()) setError(e.message) }
    finally { if (active()) setBusy(false) }
  }
  async function chat(event) {
    const current = epoch.current; const active = () => mounted.current && epoch.current === current
    event.preventDefault(); setChatting(true); setError(''); setNotice('')
    try {
      const result = await api('/think', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trigger: 'chat', text }) })
      if (!active()) return
      if (!result.ok) setError(reasons[result.reason] || result.message || '暂时无法回应')
      else { setText(''); setNotice('云朵兔回应了你') }
      const fresh = await api(); if (active()) setData(fresh)
    } catch (e) { if (active()) setError(e.name === 'AbortError' ? '请求已取消或超时' : e.message) }
    finally { if (active()) setChatting(false) }
  }
  async function clear() {
    const current = epoch.current; const active = () => mounted.current && epoch.current === current
    setBusy(true); setError('')
    try { const result = await api('/memory', { method: 'DELETE' }); if (active()) { receive(result); setNotice('称呼、偏好和聊天记忆已清空；今日用量保留') } }
    catch (e) { if (active()) setError(e.message) }
    finally { if (active()) setBusy(false) }
  }
  const change = (key, value) => setSettings(s => ({ ...s, [key]: value }))
  const models = providers.find(p => p.id === settings.provider)?.models || []
  return <>
    <button type="button" onClick={() => setOpen(true)} title="陪伴设置与聊天" aria-label="陪伴设置与聊天" style={{ ...buttonStyle, width: '100%', marginTop: 5, fontSize: 12 }}>陪伴设置</button>
    {open && <dialog ref={dialog} onCancel={() => setOpen(false)} onClick={e => { if (e.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setOpen(false) } }}
      style={{ width: 'min(520px, calc(100vw - 40px))', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 80px)', margin: 'auto', padding: 22, borderRadius: 18, border: '1px solid #9eafa3', background: 'Canvas', color: 'CanvasText', colorScheme: 'light dark', fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><strong style={{ fontWeight: 500, fontSize: 18 }}>云朵兔 · 陪伴时光</strong><button style={buttonStyle} onClick={() => setOpen(false)} aria-label="关闭陪伴设置">关闭</button></div>
      <p>小动作在本地运行。AI 使用你选择的模型，最多保留最近 5 轮聊天；只发送你输入的话、保存的偏好和简单互动事件。</p>
      {error && <p role="alert" style={{ color: 'light-dark(#a32836, #ffb7bf)' }}>{error} <button style={buttonStyle} onClick={load} disabled={busy}>重新读取</button></p>}
      {notice && <p role="status">{notice}</p>}
      {!data ? <p aria-busy={busy}>正在读取陪伴设置…</p> : <>
        <label style={field}>活跃程度<select style={inputStyle} value={settings.activity} onChange={e => change('activity', e.target.value)}><option value="quiet">安静 · 只保留任务反馈</option><option value="balanced">自然 · 偶尔活动</option><option value="lively">活泼 · 更多小动作</option></select></label>
        <label style={{ display: 'block', marginBottom: 12 }}><input type="checkbox" checked={settings.enabled} onChange={e => change('enabled', e.target.checked)} /> 开启 AI 陪伴</label>
        <label style={field}>供应商<select aria-label="供应商" style={inputStyle} value={settings.provider} onChange={e => setSettings(s => ({ ...s, provider: e.target.value, model: '' }))}><option value="">请选择已配置的供应商</option>{settings.provider && !providers.some(p => p.id === settings.provider) && <option value={settings.provider}>{settings.provider}（当前保存）</option>}{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label style={field}>陪伴模型<select aria-label="陪伴模型" style={inputStyle} value={settings.model} onChange={e => change('model', e.target.value)}><option value="">请选择模型</option>{settings.model && !models.some(m => m.id === settings.model) && <option value={settings.model}>{settings.model}（当前保存）</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label style={field}>每日调用上限（自动互动和聊天合计）<input style={inputStyle} type="number" min="1" max="200" value={settings.dailyLimit} onChange={e => change('dailyLimit', Number(e.target.value))} /></label>
        <p>今日已请求 {data.usage.calls} 次。主动回应至少间隔 10 分钟；失败也计入次数。模型不可用时保留本地动作，不切换其他模型。</p>
        <label style={field}>希望兔兔怎样称呼你<input style={inputStyle} maxLength={40} value={settings.nickname} onChange={e => change('nickname', e.target.value)} /></label>
        <label style={field}>想让它记住的偏好<textarea style={inputStyle} rows={2} maxLength={600} value={settings.preferences} onChange={e => change('preferences', e.target.value)} placeholder="例如：喜欢安静、喜欢被叫小林" /></label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}><button style={buttonStyle} disabled={busy} onClick={() => save()}>保存设置</button><button style={buttonStyle} disabled={busy || !data.settings.enabled} onClick={() => save({ ...data.settings, enabled: false })}>立即关闭 AI</button><button style={buttonStyle} disabled={busy} onClick={clear}>清空记忆</button></div>
        <hr style={{ opacity: .25, margin: '18px 0' }} />
        <div aria-label="陪伴聊天记录" style={{ maxHeight: 170, overflow: 'auto' }}>{data.history.length ? data.history.map((m,i) => <p key={i} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong style={{ fontWeight: 500 }}>{m.role === 'user' ? '你' : '云朵兔'}：</strong>{m.content}</p>) : <p>还没有聊天记忆，和它打个招呼吧。</p>}</div>
        <form onSubmit={chat}><label style={field}>和云朵兔说句话<input style={inputStyle} value={text} maxLength={1000} onChange={e => setText(e.target.value)} disabled={!data.settings.enabled} /></label><button style={buttonStyle} disabled={chatting || busy || !data.settings.enabled || !text.trim()}>{chatting ? '正在等兔兔回应…' : '发送'}</button></form>
      </>}
    </dialog>}
  </>
}
