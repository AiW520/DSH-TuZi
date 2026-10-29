export const ACTIONS = ['blink', 'hop', 'tilt', 'stretch', 'nap', 'wave', 'stroll'];
export const DEFAULT_SETTINGS = Object.freeze({ enabled: false, activity: 'balanced', provider: '', model: '', dailyLimit: 12, nickname: '', preferences: '' });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export function settingsFrom(value = {}) {
  if (!object(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key))) throw new Error('陪伴设置格式不正确');
  const s = { ...DEFAULT_SETTINGS, ...value };
  if (typeof s.enabled !== 'boolean' || !['quiet', 'balanced', 'lively'].includes(s.activity)) throw new Error('请选择有效的陪伴模式');
  for (const key of ['provider', 'model', 'nickname', 'preferences']) if (typeof s[key] !== 'string') throw new Error('设置内容必须是文字');
  for (const key of ['provider', 'model', 'nickname', 'preferences']) s[key] = s[key].trim();
  if (!!s.provider !== !!s.model || s.provider.length > 200 || s.model.length > 200 || (s.enabled && !s.model)) throw new Error('开启 AI 前请选择供应商和模型');
  if (!Number.isInteger(s.dailyLimit) || s.dailyLimit < 1 || s.dailyLimit > 200) throw new Error('每日调用上限应为 1–200');
  if (s.nickname.length > 40 || s.preferences.length > 600) throw new Error('称呼最多 40 字，偏好最多 600 字');
  return s;
}
export function parseDecision(text) {
  const raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!object(raw) || !ACTIONS.includes(raw.action) || !['calm', 'happy', 'curious', 'sleepy'].includes(raw.mood) || typeof raw.text !== 'string' || raw.text.length > 240) throw new Error('模型未返回有效的陪伴动作');
  return { action: raw.action, mood: raw.mood, text: raw.text.trim() };
}

export const COMPANION_REASONS = Object.freeze({ disabled: '先在主界面开启 AI 陪伴、选择模型，并显示桌面云朵兔', quiet: '正在安静陪伴，本地动作仍可用', busy: '上一条回应还在生成，请稍候', 'daily-limit': '今天已达到调用上限，本地动作继续运行', cooldown: '刚刚聊过，稍等几秒再试', cancelled: '请求已取消或超时，本地动作继续运行', 'model-error': 'AI 暂时无法回应，请检查所选模型' });
