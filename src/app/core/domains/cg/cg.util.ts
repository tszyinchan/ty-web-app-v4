import { SUBDOMAINS } from '../../../app.constants';
import { RecordStatus } from '../../models/status.enum';
import {
  CG_ELEMENT_CATALOG,
  CG_SAMPLE_LOGO_URL,
  CgAnchor,
  CgElementDef,
  CgElementType,
  CgLayoutUnit,
  CgOutputKind,
  CgPackageRole,
  DEFAULT_LOGO_LAYOUT,
} from './cg.constants';
import {
  CgLayer,
  CgLayerDraft,
  CgLayerPayload,
  CgLayout,
  CgLogoPayload,
  CgPackage,
  CgPublicOutput,
} from './cg.model';

const ANCHOR_TRANSLATE: Record<CgAnchor, string> = {
  [CgAnchor.TopLeft]: 'translate(0, 0)',
  [CgAnchor.TopCenter]: 'translate(-50%, 0)',
  [CgAnchor.TopRight]: 'translate(-100%, 0)',
  [CgAnchor.CenterLeft]: 'translate(0, -50%)',
  [CgAnchor.Center]: 'translate(-50%, -50%)',
  [CgAnchor.CenterRight]: 'translate(-100%, -50%)',
  [CgAnchor.BottomLeft]: 'translate(0, -100%)',
  [CgAnchor.BottomCenter]: 'translate(-50%, -100%)',
  [CgAnchor.BottomRight]: 'translate(-100%, -100%)',
};

const ANCHOR_ORIGIN: Record<CgAnchor, string> = {
  [CgAnchor.TopLeft]: '0 0',
  [CgAnchor.TopCenter]: '50% 0',
  [CgAnchor.TopRight]: '100% 0',
  [CgAnchor.CenterLeft]: '0 50%',
  [CgAnchor.Center]: '50% 50%',
  [CgAnchor.CenterRight]: '100% 50%',
  [CgAnchor.BottomLeft]: '0 100%',
  [CgAnchor.BottomCenter]: '50% 100%',
  [CgAnchor.BottomRight]: '100% 100%',
};

export function createCgPublicToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export function createEmptyLogoLayer(sortOrder: number): CgLayerDraft {
  return {
    clientId: `temp-${crypto.randomUUID()}`,
    element_type: CgElementType.Logo,
    public_token: createCgPublicToken(),
    layout: { ...DEFAULT_LOGO_LAYOUT },
    payload: { imageUrl: CG_SAMPLE_LOGO_URL },
    visible: true,
    sort_order: sortOrder,
    status: RecordStatus.Active,
  };
}

export function packageRoleLabel(role: CgPackageRole): string {
  return role === CgPackageRole.Source ? 'Source' : 'Channel';
}

export function elementDef(type: CgElementType): CgElementDef | undefined {
  return CG_ELEMENT_CATALOG.find((item) => item.type === type);
}

export function elementLabel(type: CgElementType): string {
  return elementDef(type)?.label ?? type;
}

export function isLogoPayload(payload: unknown): payload is CgLogoPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'imageUrl' in payload &&
    typeof (payload as { imageUrl: unknown }).imageUrl === 'string'
  );
}

export function normalizeLayout(raw: unknown): CgLayout {
  const value = asRecord(raw);
  const unit =
    value['unit'] === CgLayoutUnit.Pixel
      ? CgLayoutUnit.Pixel
      : CgLayoutUnit.Percent;
  const anchor = isAnchor(value['anchor'])
    ? value['anchor']
    : CgAnchor.TopLeft;
  return {
    x: toFiniteNumber(value['x'], DEFAULT_LOGO_LAYOUT.x),
    y: toFiniteNumber(value['y'], DEFAULT_LOGO_LAYOUT.y),
    unit,
    anchor,
    scale: toFiniteNumber(value['scale'], DEFAULT_LOGO_LAYOUT.scale),
    width: toOptionalNumber(value['width']),
    height: toOptionalNumber(value['height']),
  };
}

export function normalizeLogoPayload(raw: unknown): CgLogoPayload {
  if (isLogoPayload(raw)) {
    const fileName =
      'fileName' in raw && typeof raw.fileName === 'string'
        ? raw.fileName.trim()
        : '';
    return {
      imageUrl: raw.imageUrl.trim(),
      ...(fileName ? { fileName } : {}),
    };
  }
  return { imageUrl: '' };
}

export function layerToDraft(layer: CgLayer): CgLayerDraft {
  return {
    clientId: layer.tb_tyapp_cgly_id,
    tb_tyapp_cgly_id: layer.tb_tyapp_cgly_id,
    element_type: layer.element_type,
    public_token: layer.public_token,
    layout: normalizeLayout(layer.layout),
    payload: normalizeLayerPayload(layer.element_type, layer.payload),
    visible: layer.visible,
    sort_order: layer.sort_order,
    status: layer.status,
  };
}

export function normalizeLayer(raw: unknown): CgLayer | null {
  const value = asRecord(raw);
  const id = asString(value['tb_tyapp_cgly_id']);
  const packageId = asString(value['package_id']);
  const token = asString(value['public_token']);
  if (!id || !packageId || !token) return null;

  const elementType = parseElementType(value['element_type']);
  if (!elementType) return null;

  return {
    tb_tyapp_cgly_id: id,
    tb_tyapp_cgly_seq_no:
      toOptionalNumber(value['tb_tyapp_cgly_seq_no']) ?? undefined,
    package_id: packageId,
    element_type: elementType,
    public_token: token,
    layout: normalizeLayout(value['layout']),
    payload: normalizeLayerPayload(elementType, value['payload']),
    visible: value['visible'] !== false,
    sort_order: toFiniteNumber(value['sort_order'], 0),
    status:
      value['status'] === RecordStatus.Inactive
        ? RecordStatus.Inactive
        : RecordStatus.Active,
    created_at: asString(value['created_at']) || undefined,
    updated_at: asString(value['updated_at']) || undefined,
    deleted_at: asString(value['deleted_at']) || null,
  };
}

export function normalizePublicOutput(raw: unknown): CgPublicOutput | null {
  const value = asRecord(raw);
  const layersRaw = value['layers'];
  const layers = Array.isArray(layersRaw)
    ? layersRaw
        .map((row) => normalizeLayer(row))
        .filter((layer): layer is CgLayer => layer !== null)
    : [];

  const packageName =
    asString(value['packageName']) || asString(value['package_name']);
  if (!packageName && layers.length === 0 && !asString(value['kind'])) {
    return null;
  }

  return {
    kind:
      value['kind'] === CgOutputKind.Layer
        ? CgOutputKind.Layer
        : CgOutputKind.Package,
    packageName,
    packageRole:
      value['packageRole'] === CgPackageRole.Source ||
      value['package_role'] === CgPackageRole.Source
        ? CgPackageRole.Source
        : CgPackageRole.Channel,
    layers,
  };
}

export function normalizeLayerPayload(
  type: CgElementType,
  raw: unknown,
): CgLayerPayload {
  if (type === CgElementType.Logo) {
    return normalizeLogoPayload(raw);
  }
  return normalizeLogoPayload(raw);
}

export function layoutToCss(layout: CgLayout): Record<string, string> {
  const unit = layout.unit === CgLayoutUnit.Pixel ? 'px' : '%';
  const scale = Number.isFinite(layout.scale) ? layout.scale : 1;
  const css: Record<string, string> = {
    position: 'absolute',
    left: `${layout.x}${unit}`,
    top: `${layout.y}${unit}`,
    transform: `${ANCHOR_TRANSLATE[layout.anchor]} scale(${scale})`,
    transformOrigin: ANCHOR_ORIGIN[layout.anchor],
  };
  if (layout.width != null && Number.isFinite(layout.width)) {
    css['width'] = `${layout.width}${unit}`;
  }
  if (layout.height != null && Number.isFinite(layout.height)) {
    css['height'] = `${layout.height}${unit}`;
  }
  return css;
}

export function buildCgOverlayUrl(token: string, location: Location): string {
  const { protocol, hostname, port } = location;
  const portPart = port && port !== '80' && port !== '443' ? `:${port}` : '';
  if (isLocalDevHost(hostname)) {
    return `${protocol}//${SUBDOMAINS.CG}.localhost${portPart}/o/${token}`;
  }
  if (hostname.endsWith('tszyin.com')) {
    return `${protocol}//${SUBDOMAINS.CG}.tszyin.com/o/${token}`;
  }
  return `${protocol}//${SUBDOMAINS.CG}.localhost${portPart}/o/${token}`;
}

export function isLocalDevHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost')
  );
}

export function isEmbeddedImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

export function isLocalFilesystemPath(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('\\\\') ||
    trimmed.startsWith('file:')
  );
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read that image'));
    };
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}

export function layerSummary(layers: Pick<CgLayer, 'element_type'>[]): string {
  if (layers.length === 0) return 'No layers';
  const labels = layers.map((layer) => elementLabel(layer.element_type));
  return labels.join(' · ');
}

export function packageHasUnsavedIdentity(
  pkg: Pick<Partial<CgPackage>, 'name'>,
): boolean {
  return !pkg.name?.trim();
}

function parseElementType(raw: unknown): CgElementType | null {
  return Object.values(CgElementType).includes(raw as CgElementType)
    ? (raw as CgElementType)
    : null;
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'object' && raw !== null) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function isSameCgPackageUrl(fromUrl: string, toUrl: string): boolean {
  const path = (url: string) => url.split('?')[0].replace(/\/+$/, '') || '/';
  const from = path(fromUrl);
  const to = path(toUrl);
  if (from.startsWith('/cg/new') && to.startsWith('/cg/new')) return true;
  const fromId = from.match(/^\/cg\/edit\/([^/]+)/)?.[1];
  const toId = to.match(/^\/cg\/edit\/([^/]+)/)?.[1];
  return !!fromId && fromId === toId;
}

function asString(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function toFiniteNumber(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function isAnchor(raw: unknown): raw is CgAnchor {
  return Object.values(CgAnchor).includes(raw as CgAnchor);
}
