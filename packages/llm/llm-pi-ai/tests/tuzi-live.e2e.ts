import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId, AttachmentStore, ImageVariantId } from '@deepseek-ai/dsh-attachment'
import type { ImageAttachmentRef, ImageRequestTarget, SaveImageAttachment } from '@deepseek-ai/dsh-attachment'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { assemble } from './assemble.ts'

const key = process.env.DSH_TUZI_LIVE_KEY
const model = process.env.DSH_TUZI_LIVE_MODEL ?? 'gpt-6.1-terra'

it.skipIf(key === undefined)('discovers and sends an image through the TuZi custom route', async () => {
  if (key === undefined) throw new Error('TuZi live test key is missing')
  const data = new Uint8Array(await readFile(new URL('./fixtures/qr-code.png', import.meta.url)))
  const ref: ImageAttachmentRef = {
    attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
    mediaType: 'image/png', bytes: data.byteLength, width: 256, height: 256, name: 'qr-code.png',
  }
  class FixtureStore extends AttachmentStore {
    readonly imageLimits = {
      maxImageBytes: data.byteLength, maxImagesPerMessage: 1, maxMessageImageBytes: data.byteLength,
      maxImagePixels: 256 * 256, maxImageDimension: 256, mediaTypes: ['image/png'] as const,
    }
    validateImage(_input: SaveImageAttachment): Promise<void> { return Promise.reject(new Error('read-only fixture')) }
    saveImage(_input: SaveImageAttachment): Promise<ImageAttachmentRef> { return Promise.reject(new Error('read-only fixture')) }
    readImage(_ref: ImageAttachmentRef) { return Promise.resolve({ ref, data }) }
    override readImageRequest(_ref: ImageAttachmentRef, _target: ImageRequestTarget) {
      return Promise.resolve({
        variantId: ImageVariantId(`sha256:${'f'.repeat(64)}`), attachment: ref, data,
        mediaType: ref.mediaType, bytes: data.byteLength, width: 256, height: 256,
        depth: 'uchar' as const, space: 'srgb' as const, hasAlpha: true,
      })
    }
  }
  const ctx = new Context()
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmPiAi, { providers: {
      tuzi: { api: 'openai-completions', baseURL: 'https://api.tu-zi.com/v1', apiKeyEnv: 'DSH_TUZI_LIVE_KEY', models: [{ id: model, input: ['text', 'image'] }] },
    } })
    await ctx.plugin(FixtureStore)
    const listed = await ctx.llm.discoverModels('llm-pi-ai', { baseURL: 'https://api.tu-zi.com/v1', api: 'openai-completions', apiKey: key })
    expect(listed.find(entry => entry.id === model)?.inputModalities).toContain('image')
    const result = await assemble(ctx, {
      provider: 'tuzi', model, maxTokens: 128,
      messages: [createUserMessage({
        content: [
          { type: 'text', text: 'What type of machine-readable symbol is shown? Reply with exactly: QR code' },
          { type: 'image', attachment: ref },
        ],
        source: { kind: 'model', provider: 'tuzi', model },
      })],
    })
    expect(result.finish).toMatchObject({ kind: 'stop' })
    expect(result.message.content.filter(block => block.type === 'text').map(block => block.text).join('').toLowerCase()).toContain('qr code')
  } finally {
    await ctx.fiber.dispose()
  }
})
