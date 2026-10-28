import React from 'react'
import mark from '../../apps/desktop/resources/community-mark.svg'

export const inject = ['slots']

function Mark({ size, className }) {
  return <img width={size} height={size} className={className} src={`data:image/svg+xml,${encodeURIComponent(mark)}`} alt="" />
}

function Name() {
  return <span style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.025em' }}>DSH-TuZi</span>
}

export function apply(ctx) {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, Mark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, Name)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, Mark))
}
