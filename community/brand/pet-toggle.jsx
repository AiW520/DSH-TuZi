import React, { useEffect, useRef, useState } from 'react'
import { CompanionPanel } from './companion-panel.jsx'

const labels = {
  zh: { name: '云朵兔', loading: '读取开关…', show: '开启桌面云朵兔', hide: '关闭桌面云朵兔', saving: '正在保存…', missing: '云朵兔未启用', failed: '无法读取开关，点击重试', saveFailed: '保存失败，请重试', on: '已开启', off: '已关闭' },
  en: { name: 'Cloud bunny', loading: 'Loading…', show: 'Show desktop bunny', hide: 'Hide desktop bunny', saving: 'Saving…', missing: 'Bunny plugin unavailable', failed: 'Could not load. Click to retry', saveFailed: 'Could not save. Try again', on: 'On', off: 'Off' },
}

/** Persistent visibility control remains accessible after the helper window is hidden. */
export function PetToggle({ wide }) {
  const text = labels[navigator.language.startsWith('zh') ? 'zh' : 'en']
  const [pet, setPet] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [error, setError] = useState('')
  const pending = useRef(null)
  const active = useRef(true)
  async function request(display) {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setPhase(display === undefined ? 'loading' : 'saving')
    setError('')
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch('/dsh-pet-7340/' + (display === undefined ? 'config' : 'pet-display'), {
        method: display === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal,
        ...(display === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'cloud-bunny', display }) }),
      })
      if (!response.ok) throw new Error('Pet configuration unavailable')
      const config = await response.json()
      if (config.ok === false) throw new Error('Pet configuration not saved')
      const found = Object.values(config).flatMap(value => value?.pets || []).find(item => item.id === 'cloud-bunny')
      if (!active.current || pending.current !== controller) return
      setPet(found || null)
      setPhase(found ? 'ready' : 'missing')
    } catch (failure) {
      if (!active.current || pending.current !== controller) return
      setPhase('error')
      setError(display === undefined ? text.failed : text.saveFailed)
    } finally {
      clearTimeout(timer)
      if (pending.current === controller) pending.current = null
    }
  }
  useEffect(() => {
    active.current = true
    void request()
    const refresh = () => { if (!document.hidden) void request() }
    window.addEventListener('focus', refresh)
    return () => { active.current = false; pending.current?.abort(); pending.current = null; window.removeEventListener('focus', refresh) }
  }, [])
  const on = pet?.display === 'desktop' || pet?.display === 'both'
  const busy = phase === 'loading' || phase === 'saving'
  const title = error || (phase === 'missing' ? text.missing : on ? text.hide : text.show)
  const toggle = () => {
    if (phase === 'error' || phase === 'missing') { void request(); return }
    const display = on ? pet.display === 'both' ? 'web' : 'none' : pet.display === 'web' ? 'both' : 'desktop'
    void request(display)
  }
  return <div style={{ padding: wide ? '4px 8px' : '4px', width: '100%' }}>
    <button type="button" aria-label={title} aria-pressed={on} disabled={busy} title={title} onClick={toggle}
      style={{ display: 'flex', alignItems: 'center', justifyContent: wide ? 'space-between' : 'center', gap: 8, width: '100%', minHeight: 36, padding: '6px 8px', border: '1px solid currentColor', borderRadius: 9, background: 'transparent', color: 'inherit', opacity: busy ? .55 : .85, cursor: busy ? 'wait' : 'pointer', fontSize: 12 }}>
      <span>{wide ? text.name : '🐰'}</span>{wide && <span>{busy ? text[phase] : on ? text.on : text.off}</span>}
    </button>
    {error && wide && <small role="status">{error}</small>}
    <CompanionPanel />
  </div>
}
