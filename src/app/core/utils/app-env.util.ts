import { SUBDOMAINS } from '../../app.constants';

export function getCurrentSubdomain(): string {
  const hostname = window.location.hostname;

  if (hostname.startsWith(SUBDOMAINS.FILELINK)) {
    return SUBDOMAINS.FILELINK;
  }

  return SUBDOMAINS.JAXFR;
}
