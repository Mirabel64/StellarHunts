export interface HelmetSecurityOptions {
  contentSecurityPolicy: boolean;
  crossOriginEmbedderPolicy: boolean;
  referrerPolicy: { policy: string };
}

export function getSecurityHeadersConfig(): HelmetSecurityOptions {
  return {
    contentSecurityPolicy: true,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  };
}
