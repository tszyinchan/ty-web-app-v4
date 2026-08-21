import { SUBDOMAINS } from '../../app.constants';

export function getCurrentSubdomain(): string {
  const hostname = window.location.hostname;

  if (hostname.startsWith(SUBDOMAINS.FILELINK)) {
    return SUBDOMAINS.FILELINK;
  }

  if (hostname.startsWith(SUBDOMAINS.SHARE)) {
    return SUBDOMAINS.SHARE;
  }

  if (hostname.startsWith(SUBDOMAINS.TIME)) {
    return SUBDOMAINS.TIME;
  }

  return SUBDOMAINS.JAXFR;
}
