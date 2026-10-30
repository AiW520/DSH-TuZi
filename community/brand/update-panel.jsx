import React, { useEffect, useRef, useState } from 'react'
import { updateCopy } from './update-copy.mjs'

const button = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--dsh-line, #a6afa9)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' }
const locale = () => document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'

/** Nonblocking sidebar reminder and explicit, dismissible update details. */
export function UpdatePanel() {
  const api = window.dshCommunityUpdates
  const [state, setState] = useState(null), [open, setOpen] = useState(false)
  const [language, setLanguage] = useState(locale), [busy, setBusy] = useState(false)
  const [error, setError] = useState(false), [notice, setNotice] = useState('')
  const dialog = useRef(null), generation = useRef(0), requested = useRef(0), revision = useRef(-1)
  const copy = updateCopy[language]
  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(locale()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!api) return
    const epoch = ++generation.current
    const receive = value => {
      if (generation.current !== epoch || value.revision < revision.current) return
      revision.current = value.revision
      setState(value)
      if (value.openRequest > requested.current) {
        requested.current = value.openRequest; setOpen(true)
        // Consume the native menu request once, including across renderer reloads.
        api.action('acknowledge', undefined, value.openRequest).catch(() => { if (generation.current === epoch) setError(true) })
      }
    }
    const off = api.subscribe(receive)
    api.status().then(receive).catch(() => { if (generation.current === epoch) setError(true) })
    return () => { generation.current++; off() }
  }, [api])
  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [open])
  async function act(action) {
    const epoch = generation.current
    setBusy(true); setError(false); setNotice('')
    try {
      const next = await api.action(action, state?.release?.version)
      if (generation.current !== epoch) return
      if (next.revision >= revision.current) { revision.current = next.revision; setState(next) }
      if (action === 'download') setNotice('browserOpened')
      if (action === 'later') setNotice('snoozed')
      if (action === 'ignore') setNotice('ignored')
    } catch (_error) { if (generation.current === epoch) setError(true) }
    finally { if (generation.current === epoch) setBusy(false) }
  }
  if (!api) return null
  const available = state?.release && !state.suppressed
  const release = state?.release
  const status = !state || state.phase === 'idle' ? copy.idle : state.phase === 'checking' ? copy.checking
    : state.phase === 'current' ? copy.upToDate : state.phase === 'unavailable' ? (state.currentVersion ? copy.unavailable : copy.missingVersion)
    : state.phase === 'error' ? copy.failed : copy.available
  return <>
    <button type="button" style={{ ...button, width: '100%', marginTop: 5, fontSize: 12, fontWeight: 500 }}
      onClick={() => { setOpen(true); setError(false); setNotice('') }} aria-label={available ? copy.available : copy.title}>
      {available ? `↑ ${copy.available}` : copy.title}
    </button>
    {open && <dialog ref={dialog} aria-labelledby="community-update-title" onCancel={() => setOpen(false)}
      onClick={event => { if (event.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) setOpen(false) } }}
      style={{ width: 'min(520px, calc(100vw - 40px))', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 80px)', margin: 'auto', overflow: 'auto', padding: 22, borderRadius: 18, border: '1px solid var(--dsh-line, #a6afa9)', background: 'Canvas', color: 'CanvasText', colorScheme: 'light dark', fontSize: 13, fontFamily: 'inherit', fontWeight: 400, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 id="community-update-title" style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>{copy.title}</h2>
        <button type="button" style={button} aria-label={copy.close} onClick={() => setOpen(false)}>{copy.closeLabel}</button>
      </div>
      <p>{copy.policy}</p>
      <p>{copy.current}：{state?.currentVersion || '—'}<br />{state?.platform} · {state?.arch}</p>
      <p role="status" aria-live="polite">{status}</p>
      {state?.checkedAt && <p>{copy.lastChecked}：{new Date(state.checkedAt).toLocaleString(language)}</p>}
      {(error || state?.preferenceError) && <p role="alert" style={{ color: 'light-dark(#a32836, #ffb7bf)' }}>{state?.preferenceError ? copy.preferences : copy.actionFailed}</p>}
      {notice && <p role="status">{copy[notice]}</p>}
      {release && <>
        <h3 style={{ fontSize: 14, fontWeight: 500 }}>{copy.latest}：{release.version}</h3>
        <p style={{ whiteSpace: 'pre-wrap' }}>{release.notes || copy.fallbackNotes}</p>
        <p>{(release.bytes / 1024 / 1024).toFixed(1)} MB · {state.platform} {state.arch}</p>
        {release.signing === 'unsigned-test' && <p>{copy.unsigned}</p>}
        {state.suppressed && notice !== state.suppressed && <p>{copy[state.suppressed]}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <button type="button" style={button} disabled={busy} onClick={() => act('download')}>{copy.download}</button>
          <button type="button" style={button} disabled={busy} onClick={() => act('notes')}>{copy.notes}</button>
          <button type="button" style={button} disabled={busy} onClick={() => act('later')}>{copy.later}</button>
          <button type="button" style={button} disabled={busy} onClick={() => act('ignore')}>{copy.ignore}</button>
        </div>
      </>}
      <button type="button" style={button} disabled={busy || state?.phase === 'checking'} onClick={() => act('check')}>{copy.check}</button>
    </dialog>}
  </>
}
