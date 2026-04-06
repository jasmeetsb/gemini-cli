/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react/prop-types */
import type React from 'react';
import { memo } from 'react';
import { Box, Text } from 'ink';

export interface StatusPaneProps {
  currentModel: string;
  branchName?: string;
  backgroundTaskCount: number;
  quotaStats?: { remaining?: number; limit?: number };
  promptCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export const StatusPane: React.FC<StatusPaneProps> = memo(
  ({
    currentModel,
    branchName,
    backgroundTaskCount,
    quotaStats,
    promptCount,
    totalInputTokens,
    totalOutputTokens,
  }) => (
      <Box flexDirection="column">
        <Text bold color="green">
          Status & Context
        </Text>

        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text bold>Model:</Text> {currentModel}
          </Text>
          <Text>
            <Text bold>Branch:</Text> {branchName || 'N/A'}
          </Text>
          <Text>
            <Text bold>Tasks:</Text> {backgroundTaskCount}
          </Text>
        </Box>

        {quotaStats && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold color="yellow">
              Quota
            </Text>
            <Text>Remaining: {quotaStats.remaining}</Text>
            <Text>Limit: {quotaStats.limit}</Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text bold color="blue">
            Session Stats
          </Text>
          <Text>Prompts: {promptCount}</Text>
          <Text>Input Tokens: {totalInputTokens}</Text>
          <Text>Output Tokens: {totalOutputTokens}</Text>
        </Box>
      </Box>
    ),
);

StatusPane.displayName = 'StatusPane';
