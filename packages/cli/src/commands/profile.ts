/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule, Argv } from 'yargs';
import { listCommand } from './profile/list.js';
import { createCommand } from './profile/create.js';
import { useCommand } from './profile/use.js';
import { deleteCommand } from './profile/delete.js';
import { defer } from '../deferred.js';
import { initializeOutputListenersAndFlush } from '../gemini.js';

export const profileCommand: CommandModule = {
  command: 'profile',
  describe: 'Manage Gemini CLI profiles',
  builder: (yargs: Argv) =>
    yargs
      .middleware((argv) => {
        initializeOutputListenersAndFlush();
        argv['isCommand'] = true;
      })
      .command(defer(listCommand, 'profile'))
      .command(defer(createCommand, 'profile'))
      .command(defer(useCommand, 'profile'))
      .command(defer(deleteCommand, 'profile'))
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
  },
};
