import * as p from '@clack/prompts';

export async function syncCommand(options: { url?: string }) {
  const appUrl = options.url ?? process.env['VIEWPORT_URL'];
  if (!appUrl) {
    p.cancel('Pass --url <app-url> or set VIEWPORT_URL');
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Syncing prototypes…');

  const res = await fetch(`${appUrl}/api/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env['VIEWPORT_ADMIN_TOKEN'] ?? ''}` },
  });

  if (!res.ok) {
    s.stop('Sync failed');
    p.cancel(`Server returned ${res.status}`);
    process.exit(1);
  }

  const data = await res.json() as { tabs?: number; prototypes?: number };
  s.stop(`Synced — ${data.tabs ?? 0} tabs, ${data.prototypes ?? 0} prototypes`);
}
