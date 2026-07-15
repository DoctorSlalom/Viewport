#!/usr/bin/env node
import * as p from '@clack/prompts';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

async function main() {
  p.intro('create-viewport — set up your prototype canvas');

  const cwd = process.cwd();

  const projectName = await p.text({
    message: 'Project name',
    defaultValue: 'my-canvas',
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });
  if (p.isCancel(projectName)) { p.cancel('Cancelled'); process.exit(0); }

  const repoUrl = await p.text({
    message: 'GitHub repo URL',
    placeholder: 'https://github.com/org/repo',
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });
  if (p.isCancel(repoUrl)) { p.cancel('Cancelled'); process.exit(0); }

  const s = p.spinner();
  s.start('Scaffolding…');

  // Folder structure
  const folders = [
    'prototypes/_template',
    'decisions',
    'assets',
  ];
  for (const folder of folders) {
    mkdirSync(join(cwd, folder), { recursive: true });
  }

  // viewport.config.json
  const config = {
    name: projectName,
    repoUrl,
    defaultBranch: 'main',
    ai: { model: 'claude-opus-4-8', effort: 'medium' },
  };
  writeFileSync(join(cwd, 'viewport.config.json'), JSON.stringify(config, null, 2));

  // _template/index.html
  if (!existsSync(join(cwd, 'prototypes/_template/index.html'))) {
    writeFileSync(
      join(cwd, 'prototypes/_template/index.html'),
      '<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Prototype</title></head>\n<body>\n  <h1>My Prototype</h1>\n</body>\n</html>\n',
    );
  }

  const adminToken = randomBytes(32).toString('hex');

  s.stop('Scaffolded');

  p.note(
    [
      'Next steps:',
      '',
      '1. Add to your Vercel project env vars:',
      `   DATABASE_URL=<your-neon-url>`,
      `   SESSION_SECRET=<32+ random chars>`,
      `   VIEWPORT_ADMIN_TOKEN=${adminToken}`,
      '',
      '2. Run your first migration:',
      '   cd packages/db && pnpm db:generate && pnpm db:migrate',
      '',
      '3. Deploy to Vercel:',
      '   vercel --prod',
      '',
      '4. Set the team password (no redeploy needed):',
      '   viewport set-password --url <your-vercel-url>',
    ].join('\n'),
    'Setup complete',
  );

  p.outro('Happy reviewing!');
}

main().catch((e) => { console.error(e); process.exit(1); });
