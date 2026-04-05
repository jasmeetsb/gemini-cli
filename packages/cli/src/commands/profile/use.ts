/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { switchProfile } from '../../utils/profileManager.js';
import { debugLogger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import { exitCli } from '../utils.js';

interface UseArgs {
  name: string;
}

export const useCommand: CommandModule<object, UseArgs> = {
  command: 'use <name>',
  describe: 'Switch to a different profile',
  builder: (yargs) =>
    yargs.positional('name', {
      describe: 'Name of the profile to switch to',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    try {
      switchProfile(argv.name);
      debugLogger.log(chalk.green(`✓ Switched to profile '${argv.name}'.`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.error(chalk.red(`Error switching profile: ${message}`));
    }
    await exitCli();
  },
};
