import * as p from '@clack/prompts';

export async function setPasswordCommand(options: { url?: string }) {
  p.intro('Rotate team password');

  const appUrl = options.url ?? process.env['VIEWPORT_URL'];
  if (!appUrl) {
    p.cancel('Pass --url <app-url> or set VIEWPORT_URL');
    process.exit(1);
  }

  const password = await p.password({ message: 'New team password' });
  if (p.isCancel(password)) { p.cancel('Cancelled'); process.exit(0); }

  const confirm = await p.password({ message: 'Confirm password' });
  if (p.isCancel(confirm)) { p.cancel('Cancelled'); process.exit(0); }

  if (password !== confirm) {
    p.cancel('Passwords do not match');
    process.exit(1);
  }

  const s = p.spinner();
  s.start('Updating password…');

  const res = await fetch(`${appUrl}/api/admin/set-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env['VIEWPORT_ADMIN_TOKEN'] ?? ''}`,
    },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    s.stop('Failed');
    p.cancel(`Server returned ${res.status}`);
    process.exit(1);
  }

  s.stop('Password updated — no redeploy needed');
  p.outro('Done');
}
