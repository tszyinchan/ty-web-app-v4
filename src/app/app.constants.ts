export const APP_CONFIG = {
  appName: 'Jaxfr',
  version: {
    major: 4,
    minor: 51,
    patch: 0,
  },
  versionDate: '2026-07-28',
};

export const WORK_SCHEDULE_NEW_RECORD_SHORTCUT = {
  mplm_id: 'd1d3bc00-acee-4e9d-9c2f-e0a22f44e1be',
  planned_start_time: '09:00',
  planned_end_time: '17:00',
  planned_meal_minutes: 30,
};

export const YY525_SOURCE = {
  GAS_URL:
    'https://script.google.com/macros/s/AKfycbxJXfT6MlqzO2Lc3Ip755sxApmU-IwryngtUxj0LXQZGkX4LRVIiP4kZUucugdFfcJoUg/exec',
  TOKEN: 'jaxfr_finance_2026',
};
export const YY525_Wash_Log_API = {
  GAS_URL:
    'https://script.google.com/macros/s/AKfycbyhAKU-WbIGLFt8GHszq4JTqT3dSJswWHZ1-e8coKE7eEtyIS0ISxbJTcENpK7iX383/exec',
  TOKEN: '3_xiCrP_c2W2oAJPmTk_nKirpz3a7622nU',
};

export const EXCHANGE_RATES: Record<string, number> = {
  CAD: 1.0,
  HKD: 5.66422,
  USD: 0.72354,
  CNY: 5.11018,
  JPY: 108.51953,
};

export const SUBDOMAINS = {
  FILELINK: 'filelink',
  JAXFR: 'jaxfr',
} as const;

export const DEFAULT_ROUTES = {
  [SUBDOMAINS.FILELINK]: '/',
  [SUBDOMAINS.JAXFR]: '/welcome',
} as const;
