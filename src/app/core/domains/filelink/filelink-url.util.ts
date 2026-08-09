export interface UrlActionConfig {
  iconType: 'brand' | 'material';
  iconValue: string;
  actionText: string;
  themeClass: string;
}

interface UrlProviderRule extends UrlActionConfig {
  pattern: RegExp;
}

const URL_RULES: UrlProviderRule[] = [
  {
    pattern: /(youtube\.com|youtu\.be)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/youtube/white',
    actionText: '前往 YouTube 觀看影片',
    themeClass: 'brand-youtube',
  },
  {
    pattern: /(photos\.app\.goo\.gl|photos\.google\.com)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/googlephotos',
    actionText: '打開 Google 相簿查看',
    themeClass: 'brand-google-light',
  },
  {
    pattern: /(google\.com\/maps|maps\.app\.goo\.gl)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/googlemaps',
    actionText: '打開地圖查看位置',
    themeClass: 'brand-google-light',
  },
  {
    pattern: /(drive\.google\.com|docs\.google\.com)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/googledrive',
    actionText: '前往雲端硬碟看檔案',
    themeClass: 'brand-google-light',
  },
  {
    pattern: /(spotify\.com)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/spotify/white',
    actionText: '打開 Spotify 聽音樂',
    themeClass: 'brand-spotify',
  },
  {
    pattern: /(music\.apple\.com)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/applemusic/white',
    actionText: '打開 Apple Music',
    themeClass: 'brand-apple-music',
  },
  {
    pattern: /(facebook\.com)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/facebook/white',
    actionText: '前往 Facebook 查看',
    themeClass: 'brand-facebook',
  },
  {
    pattern: /(instagram\.com)/i,
    iconType: 'brand',
    iconValue: 'https://cdn.simpleicons.org/instagram/white',
    actionText: '前往 Instagram 查看',
    themeClass: 'brand-instagram',
  },
  {
    pattern: /(amazon\.|shopee\.|taobao\.|tntsupermarket|loblaws)/i,
    iconType: 'material',
    iconValue: 'shopping_cart',
    actionText: '前往購物網站',
    themeClass: 'brand-shopping',
  },
  {
    pattern: /\.pdf(\?.*)?$/i,
    iconType: 'material',
    iconValue: 'picture_as_pdf',
    actionText: '直接打開這份文件',
    themeClass: 'brand-document',
  },
  {
    pattern: /\.(jpe?g|png|gif|webp)(\?.*)?$/i,
    iconType: 'material',
    iconValue: 'image',
    actionText: '直接放大看圖片',
    themeClass: 'brand-image',
  },
];

export const DEFAULT_URL_CONFIG: UrlActionConfig = {
  iconType: 'material',
  iconValue: 'open_in_new',
  actionText: '打開這個網頁',
  themeClass: 'brand-default',
};

export function resolveUrlActionConfig(
  url: string | null | undefined,
): UrlActionConfig {
  if (!url) return DEFAULT_URL_CONFIG;
  const urlWithoutQuery = url.toLowerCase().split('?')[0];

  for (const rule of URL_RULES) {
    if (
      rule.pattern.test(urlWithoutQuery) ||
      rule.pattern.test(url.toLowerCase())
    ) {
      return {
        iconType: rule.iconType,
        iconValue: rule.iconValue,
        actionText: rule.actionText,
        themeClass: rule.themeClass,
      };
    }
  }
  return DEFAULT_URL_CONFIG;
}
