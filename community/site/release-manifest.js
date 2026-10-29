import { qualifiedReleases } from './release-platform.js';

/** Retry transient transport failures three times total; never retry invalid manifests.
 * @param {object} options Optional request, delay and progress adapters.
 * @returns {Promise<object[]>} Qualified release entries.
 */
export async function loadReleases({ request = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), onRetry = () => {} } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await request('releases.json', { cache: 'no-cache', signal: AbortSignal.timeout(12000) });
    } catch (error) {
      if (attempt === 2) throw error;
    }
    if (response?.ok) return qualifiedReleases(await response.json());
    if (response && (!([408, 429, 500, 502, 503, 504].includes(response.status)) || attempt === 2)) {
      throw new Error(`Release manifest unavailable (${response.status})`);
    }
    onRetry(attempt + 2);
    await pause(1000 * (attempt + 1));
  }
  throw new Error('Release manifest unavailable');
}
