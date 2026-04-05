/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { deleteProfile } from '../../utils/profileManager.js';
import { debugLogger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import { exitCli } from '../utils.js';

interface DeleteArgs {
  name: string;
}

export const deleteCommand: CommandModule<object, DeleteArgs> = {
  command: 'delete <name>',
  describe: 'Delete a profile',
  builder: (yargs) =>
    yargs.positional('name', {
      describe: 'Name of the profile to delete',
      type: 'string',
      demandOption: true,
    }),
  handler: async (argv) => {
    try {
      deleteProfile(argv.name);
      debugLogger.log(
        chalk.green(`✓ Profile '${argv.name}' deleted successfully.`),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.error(chalk.red(`Error deleting profile: ${message}`));
    }
    await exitCli();
  },
};
