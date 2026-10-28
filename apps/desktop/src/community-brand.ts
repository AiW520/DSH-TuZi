/** Build-time identity shared by community packaging and the desktop shell. */
export const COMMUNITY_DESKTOP = process.env.DSH_CLIENT_COMMUNITY === '1'

/**
 * Select one complete desktop identity; upstream builds keep their own identity.
 * @param community - Whether this is a DSH-TuZi build.
 * @returns Product, protocol, artifact and default data-directory names.
 */
export function desktopBrand(community: boolean) {
  return community
    ? { name: 'DSH-TuZi', appId: 'io.github.aiw520.dsh-tuzi', protocol: 'dsh-tuzi', artifact: 'dsh-tuzi', home: '.dsh-tuzi' }
    : { name: 'DeepSeek Harness', appId: 'com.deepseek.harness', protocol: 'dsh', artifact: 'deepseek-harness', home: '.dsh' }
}

/** Identity embedded into the current desktop build. */
export const DESKTOP_BRAND = desktopBrand(COMMUNITY_DESKTOP)
