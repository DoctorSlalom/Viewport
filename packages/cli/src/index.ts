#!/usr/bin/env node
import { Command } from 'commander';
import { setPasswordCommand } from './commands/set-password.js';
import { syncCommand } from './commands/sync.js';

const program = new Command()
  .name('viewport')
  .description('Viewport CLI')
  .version('0.0.1');

program
  .command('set-password')
  .description('Rotate the team password without redeploying')
  .option('--url <url>', 'Viewport app URL (defaults to $VIEWPORT_URL)')
  .action(setPasswordCommand);

program
  .command('sync')
  .description('Sync prototypes/ with the canvas DB')
  .option('--url <url>', 'Viewport app URL (defaults to $VIEWPORT_URL)')
  .action(syncCommand);

program.parse();
