export function startPublicHealthPing(options: {
  baseUrl: string;
  intervalMs: number;
  healthPath?: string;
}): void {
  const healthPath = options.healthPath ?? '/health';
  const base = options.baseUrl.replace(/\/$/, '');
  const url = `${base}${healthPath.startsWith('/') ? healthPath : `/${healthPath}`}`;

  const ping = async () => {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) {
        console.warn(`Keep-alive: GET ${url} returned ${res.status}`);
      }
    } catch (e) {
      console.warn('Keep-alive request failed:', e instanceof Error ? e.message : e);
    }
  };

  setInterval(ping, options.intervalMs);
  console.log(
    `Keep-alive: requesting ${url} every ${Math.round(options.intervalMs / 60_000)} min (set KEEP_ALIVE_ENABLED=false to disable)`
  );
}
