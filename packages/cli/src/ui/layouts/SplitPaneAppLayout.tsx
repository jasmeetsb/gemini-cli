/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Notifications } from '../components/Notifications.js';
import { MainContent } from '../components/MainContent.js';
import { DialogManager } from '../components/DialogManager.js';
import { Composer } from '../components/Composer.js';
import { ExitWarning } from '../components/ExitWarning.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useFlickerDetector } from '../hooks/useFlickerDetector.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { CopyModeWarning } from '../components/CopyModeWarning.js';
import { BackgroundTaskDisplay } from '../components/BackgroundTaskDisplay.js';
import { StreamingState } from '../types.js';
import { computeSessionStats } from '../utils/computeStats.js';

export const SplitPaneAppLayout: React.FC = () => {
  const uiState = useUIState();
  const isAlternateBuffer = useAlternateBuffer();

  const { rootUiRef, terminalHeight } = uiState;
  useFlickerDetector(rootUiRef, terminalHeight);

  // Allocate 70% width to chat and 30% to status pane
  const leftPaneWidth = Math.floor(uiState.terminalWidth * 0.7);
  const rightPaneWidth = uiState.terminalWidth - leftPaneWidth;

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
    <Box
      flexDirection="column"
      width={uiState.terminalWidth}
      height={isAlternateBuffer ? terminalHeight : undefined}
      paddingBottom={isAlternateBuffer ? 1 : undefined}
      flexShrink={0}
      flexGrow={0}
      ref={uiState.rootUiRef}
    >
      <Box flexDirection="row" flexGrow={1}>
        {/* Left Pane: Chat */}
        <Box width={leftPaneWidth} flexDirection="column">
          <MainContent />
        </Box>

        {/* Right Pane: Status/Context */}
        <Box
          width={rightPaneWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          padding={1}
        >
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
      </Box>

      {uiState.isBackgroundTaskVisible &&
        uiState.backgroundTasks.size > 0 &&
        uiState.activeBackgroundTaskPid &&
        uiState.backgroundTaskHeight > 0 &&
        uiState.streamingState !== StreamingState.WaitingForConfirmation && (
          <Box height={uiState.backgroundTaskHeight} flexShrink={0}>
            <BackgroundTaskDisplay
              shells={uiState.backgroundTasks}
              activePid={uiState.activeBackgroundTaskPid}
              width={uiState.terminalWidth}
              height={uiState.backgroundTaskHeight}
              isFocused={
                uiState.embeddedShellFocused && !uiState.dialogsVisible
              }
              isListOpenProp={uiState.isBackgroundTaskListOpen}
            />
          </Box>
        )}
      <Box
        flexDirection="column"
        ref={uiState.mainControlsRef}
        flexShrink={0}
        flexGrow={0}
        width={uiState.terminalWidth}
        height={
          uiState.copyModeEnabled ? uiState.stableControlsHeight : undefined
        }
      >
        <Notifications />
        <CopyModeWarning />

        {uiState.customDialog ? (
          uiState.customDialog
        ) : uiState.dialogsVisible ? (
          <DialogManager
            terminalWidth={uiState.terminalWidth}
            addItem={uiState.historyManager.addItem}
          />
        ) : (
          <Composer isFocused={true} />
        )}

        <ExitWarning />
      </Box>
    </Box>
  );
};
