/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type React from 'react';
import { Box, Text } from 'ink';
import { useUIState } from '../contexts/UIStateContext.js';
import { computeSessionStats } from '../utils/computeStats.js';

export const StatusPane: React.FC = () => {
  const uiState = useUIState();

  const sessionStats = uiState?.sessionStats || {
    promptCount: 0,
    metrics: {
      models: {},
      tools: {
        totalDecisions: { accept: 0, reject: 0, modify: 0, auto_accept: 0 },
      },
      files: {},
    },
  };
  const metrics = sessionStats.metrics;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-explicit-any
  const computedStats = computeSessionStats(metrics as any);
  const totalCandidateTokens = Object.values(metrics.models || {}).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
    (acc: number, model: any) => acc + (model.tokens?.candidates || 0),
    0,
  );

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        Status & Context
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text bold>Model:</Text> {uiState.currentModel}
        </Text>
        <Text>
          <Text bold>Branch:</Text> {uiState.branchName || 'N/A'}
        </Text>
        <Text>
          <Text bold>Tasks:</Text> {uiState.backgroundTaskCount}
        </Text>
      </Box>

      {uiState.quota.stats && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="yellow">
            Quota
          </Text>
          <Text>Remaining: {uiState.quota.stats.remaining}</Text>
          <Text>Limit: {uiState.quota.stats.limit}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="blue">
          Session Stats
        </Text>
        <Text>Prompts: {sessionStats.promptCount}</Text>
        <Text>Input Tokens: {computedStats.totalInputTokens}</Text>
        <Text>Output Tokens: {totalCandidateTokens}</Text>
      </Box>
    </Box>
  );
};
