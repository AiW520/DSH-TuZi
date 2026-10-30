import React from 'react'
import mark from '../../apps/desktop/resources/community-mark.svg'
import { PetToggle } from './pet-toggle.jsx'
import { UpdatePanel } from './update-panel.jsx'

export const inject = ['slots']

function Mark({ size, className }) {
  return <img width={size} height={size} className={className} src={`data:image/svg+xml,${encodeURIComponent(mark)}`} alt="" />
}

function Name() {
  return <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.025em' }}>DSH-TuZi</span>
}

export function apply(ctx) {
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: 'community-updates' }, UpdatePanel))
  ctx.slots.inject('sidebar.footer.action', () =>
    ctx.slots.register({ name: 'sidebar.footer.action', id: 'cloud-bunny-toggle' }, PetToggle))
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, Mark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, Name)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, Mark))
}
