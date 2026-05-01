export const isPublicTunnelHost = (hostname) => {
  return (
    hostname === 'trycloudflare.com' ||
    hostname.endsWith('.trycloudflare.com') ||
    hostname === 'ngrok-free.app' ||
    hostname.endsWith('.ngrok-free.app')
  );
};

export const getApiBaseUrl = () => {
  const envBaseUrl = import.meta.env.VITE_API_BASE;
  const hostname = window.location.hostname || '';
  const origin = window.location.origin || '';

  // Use same-origin as the canonical base URL.
  // Then callers can safely append either /v1/... or /api/... without producing /api/v1/... mistakes.
  if (envBaseUrl) {
    if (envBaseUrl.startsWith('/')) {
      return `${origin}`;
    }
    return envBaseUrl;
  }

  // Default to same-origin root (works with Vite proxy in dev and tunnels).
  if (isPublicTunnelHost(hostname)) return `${origin}`;
  return `${origin}`;
};

export const joinUrl = (baseUrl, path) => {
  if (!path.startsWith('/')) path = `/${path}`;
  if (!baseUrl) return path;
  if (baseUrl.endsWith('/')) return `${baseUrl.slice(0, -1)}${path}`;
  return `${baseUrl}${path}`;
};
