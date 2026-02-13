/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fsPromises from 'node:fs/promises';
import * as Diff from 'diff';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  type ToolEditConfirmationDetails,
  type ToolInvocation,
  type ToolLocation,
  type ToolResult,
  type ToolResultDisplay,
} from './tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { ToolErrorType } from './tool-error.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { Config } from '../config/config.js';
import { ApprovalMode } from '../policy/types.js';
import { DEFAULT_DIFF_OPTIONS, getDiffStat } from './diffOptions.js';
import {
  type ModifiableDeclarativeTool,
  type ModifyContext,
} from './modifiable-tool.js';
import { IdeClient } from '../ide/ide-client.js';
import { correctPath } from '../utils/pathCorrector.js';
import { HASHLINE_EDIT_TOOL_NAME } from './tool-names.js';
import { debugLogger } from '../utils/debugLogger.js';
import { HASHLINE_EDIT_DEFINITION, EDIT_DEFINITION } from './definitions/coreTools.js';
import { resolveToolDeclaration } from './definitions/resolver.js';
import { detectLineEnding } from '../utils/textUtils.js';
import {
  computeFileHashes,
  parseLineRef,
  buildMismatchDiagnostic,
  type LineHash,
  type HashMismatchInfo,
} from './hashline-utils.js';
import {
  FixLLMHashlineEdit,
  type HashlineEditCorrection,
} from '../utils/llm-edit-fixer.js';

interface HashlineOperation {
  op: 'set_line' | 'replace_lines' | 'insert_after' | 'replace';
  anchor?: string;
  start_anchor?: string;
  end_anchor?: string;
  new_text?: string;
  text?: string;
  old_text?: string;
  all?: boolean;
}

export interface HashlineEditToolParams {
  file_path: string;
  instruction: string;
  operations: HashlineOperation[];
}

function validateAnchor(
  anchorStr: string,
  fileHashes: LineHash[],
): { index: number } | { mismatch: HashMismatchInfo } | { error: string; outOfRange?: boolean } {
  const ref = parseLineRef(anchorStr);
  if (!ref) {
    return { error: `Invalid anchor format: "${anchorStr}". Expected format: LINE:HASH (e.g., "42:a3f").` };
  }

  const lineIndex = ref.line - 1;
  if (lineIndex < 0 || lineIndex >= fileHashes.length) {
    return { error: `Anchor line ${ref.line} is out of range. File has ${fileHashes.length} lines.`, outOfRange: true };
  }

  const actual = fileHashes[lineIndex];
  if (actual.hash !== ref.hash) {
    return {
      mismatch: {
        anchor: anchorStr,
        expectedHash: ref.hash,
        actualHash: actual.hash,
        actualLine: actual.line,
      },
    };
  }

  return { index: lineIndex };
}

function applyOperationWithOffset(
  lines: string[],
  fileHashes: LineHash[],
  op: HashlineOperation,
  currentOffset: number,
): { lines: string[]; newOffset: number } | { error: string; type: ToolErrorType } {
  switch (op.op) {
    case 'set_line': {
      if (!op.anchor) return { error: 'set_line requires "anchor"', type: ToolErrorType.INVALID_TOOL_PARAMS };
      if (op.new_text === undefined) return { error: 'set_line requires "new_text"', type: ToolErrorType.INVALID_TOOL_PARAMS };
      const ref = parseLineRef(op.anchor)!;
      const adjustedIndex = ref.line - 1 + currentOffset;
      const newLines = op.new_text.split('\n');
      const oldCount = 1;
      lines.splice(adjustedIndex, oldCount, ...newLines);
      const delta = newLines.length - oldCount;
      return { lines, newOffset: currentOffset + delta };
    }

    case 'replace_lines': {
      if (!op.start_anchor) return { error: 'replace_lines requires "start_anchor"', type: ToolErrorType.INVALID_TOOL_PARAMS };
      const startRef = parseLineRef(op.start_anchor)!;
      const endRef = op.end_anchor ? parseLineRef(op.end_anchor)! : startRef;

      const startIndex = startRef.line - 1 + currentOffset;
      const endIndex = endRef.line - 1 + currentOffset;
      const oldCount = endIndex - startIndex + 1;

      if (op.new_text === undefined) {
        // Delete the range
        lines.splice(startIndex, oldCount);
        return { lines, newOffset: currentOffset - oldCount };
      }

      const newLines = op.new_text.split('\n');
      lines.splice(startIndex, oldCount, ...newLines);
      const delta = newLines.length - oldCount;
      return { lines, newOffset: currentOffset + delta };
    }

    case 'insert_after': {
      if (!op.anchor) return { error: 'insert_after requires "anchor"', type: ToolErrorType.INVALID_TOOL_PARAMS };
      if (op.text === undefined) return { error: 'insert_after requires "text"', type: ToolErrorType.INVALID_TOOL_PARAMS };
      const ref = parseLineRef(op.anchor)!;
      const insertIndex = ref.line - 1 + currentOffset + 1; // After the anchor line
      const newLines = op.text.split('\n');
      lines.splice(insertIndex, 0, ...newLines);
      return { lines, newOffset: currentOffset + newLines.length };
    }

    case 'replace': {
      if (!op.old_text) return { error: 'replace requires "old_text"', type: ToolErrorType.INVALID_TOOL_PARAMS };
      if (op.new_text === undefined) return { error: 'replace requires "new_text"', type: ToolErrorType.INVALID_TOOL_PARAMS };

      const content = lines.join('\n');
      if (op.old_text === op.new_text) {
        return { error: 'old_text and new_text are identical — no change needed.', type: ToolErrorType.EDIT_NO_CHANGE };
      }

      const idx = content.indexOf(op.old_text);
      if (idx === -1) {
        return { error: `Could not find the specified text to replace: "${op.old_text.substring(0, 80)}..."`, type: ToolErrorType.EDIT_NO_OCCURRENCE_FOUND };
      }

      let newContent: string;
      if (op.all) {
        newContent = content.split(op.old_text).join(op.new_text);
      } else {
        // First-occurrence only
        newContent = content.substring(0, idx) + op.new_text + content.substring(idx + op.old_text.length);
      }

      const newLines = newContent.split('\n');
      const delta = newLines.length - lines.length;
      // Replace all lines
      lines.length = 0;
      lines.push(...newLines);
      return { lines, newOffset: currentOffset + delta };
    }

    default:
      return { error: `Unknown operation type: "${(op as HashlineOperation).op}"`, type: ToolErrorType.INVALID_TOOL_PARAMS };
  }
}

function hasMixedOps(operations: HashlineOperation[]): boolean {
  const hasAnchorOps = operations.some((op) => op.op !== 'replace');
  const hasReplaceOps = operations.some((op) => op.op === 'replace');
  return hasAnchorOps && hasReplaceOps;
}

function validateAscendingOrder(
  operations: HashlineOperation[],
): { valid: true } | { valid: false; anchor: string; line: number; lastLine: number } {
  let lastAnchorLine = 0;
  for (const op of operations) {
    if (op.op === 'replace') continue;
    const anchorStr = op.anchor ?? op.start_anchor;
    if (!anchorStr) continue;

    const ref = parseLineRef(anchorStr);
    if (!ref) continue;

    if (ref.line <= lastAnchorLine) {
      return { valid: false, anchor: anchorStr, line: ref.line, lastLine: lastAnchorLine };
    }

    const endStr = op.end_anchor;
    if (endStr) {
      const endRef = parseLineRef(endStr);
      lastAnchorLine = endRef ? endRef.line : ref.line;
    } else {
      lastAnchorLine = ref.line;
    }
  }
  return { valid: true };
}

function applyAllOperations(
  lines: string[],
  fileHashes: LineHash[],
  operations: HashlineOperation[],
): { newOffset: number } | { error: string; type: ToolErrorType } {
  let lineOffset = 0;
  for (const op of operations) {
    const result = applyOperationWithOffset(lines, fileHashes, op, lineOffset);
    if ('error' in result) {
      return { error: result.error, type: result.type };
    }
    lineOffset = result.newOffset;
  }
  return { newOffset: lineOffset };
}

class HashlineEditToolInvocation
  extends BaseToolInvocation<HashlineEditToolParams, ToolResult>
  implements ToolInvocation<HashlineEditToolParams, ToolResult>
{
  readonly kind = Kind.Edit;
  private readonly resolvedPath: string;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
    params: HashlineEditToolParams,
  ) {
    super(params, messageBus, HASHLINE_EDIT_TOOL_NAME);
    this.resolvedPath = path.resolve(
      config.getTargetDir(),
      params.file_path,
    );
  }

  override getDescription(): string {
    const filePath = shortenPath(
      makeRelative(this.params.file_path, this.config.getTargetDir()),
    );
    const opCount = this.params.operations.length;
    const opTypes = [...new Set(this.params.operations.map((op) => op.op))].join(', ');
    return `${filePath} (${opCount} ops: ${opTypes})`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: this.resolvedPath }];
  }

  private async calculateEdit(signal?: AbortSignal): Promise<{
    currentContent: string;
    newContent: string;
    error?: {
      display: string;
      raw: string;
      type: ToolErrorType;
    };
    originalLineEnding: string;
  }> {
    const currentContent = await fsPromises.readFile(this.resolvedPath, 'utf-8');
    const originalLineEnding = detectLineEnding(currentContent);
    const normalizedContent = currentContent.replace(/\r\n/g, '\n');

    const fileHashes = computeFileHashes(normalizedContent);
    const lines = normalizedContent.split('\n');

    // === PHASE 1: Validate all anchors upfront ===
    const mismatches: HashMismatchInfo[] = [];
    for (const op of this.params.operations) {
      if (op.op === 'replace') continue;
      for (const anchorStr of [op.anchor, op.start_anchor, op.end_anchor].filter(Boolean) as string[]) {
        const result = validateAnchor(anchorStr, fileHashes);
        if ('mismatch' in result) {
          mismatches.push(result.mismatch);
        } else if ('error' in result) {
          return {
            currentContent: normalizedContent,
            newContent: normalizedContent,
            error: {
              display: result.error,
              raw: result.error,
              type: result.outOfRange
                ? ToolErrorType.HASHLINE_ANCHOR_OUT_OF_RANGE
                : ToolErrorType.HASHLINE_INVALID_ANCHOR,
            },
            originalLineEnding,
          };
        }
      }
    }

    if (mismatches.length > 0) {
      // === Attempt LLM self-correction (one bounded retry) ===
      if (!this.config.getDisableLLMCorrection()) {
        const baseLlmClient = this.config.getBaseLlmClient();
        if (baseLlmClient) {
          const taggedLines = fileHashes.map(
            (h) => `${h.line}:${h.hash}|${h.content}`,
          );
          const taggedContent = taggedLines.join('\n');
          const diagnostic = buildMismatchDiagnostic(mismatches, mismatches.length);

          const timeoutSignal = AbortSignal.timeout(40_000);
          const correctionSignal = signal
            ? AbortSignal.any([signal, timeoutSignal])
            : timeoutSignal;
          const correction = await FixLLMHashlineEdit(
            this.params.instruction,
            this.params.operations,
            diagnostic,
            taggedContent,
            baseLlmClient,
            correctionSignal,
          );

          if (correction) {
            if (correction.noChangesRequired) {
              return {
                currentContent: normalizedContent,
                newContent: normalizedContent,
                error: {
                  display: 'No changes needed — intended edit is already present.',
                  raw: `LLM correction determined no changes required: ${correction.explanation}`,
                  type: ToolErrorType.EDIT_NO_CHANGE,
                },
                originalLineEnding,
              };
            }

            // Retry with corrected operations
            const retryResult = this.attemptCorrectedOperations(
              normalizedContent,
              correction,
              originalLineEnding,
            );
            if (retryResult) {
              debugLogger.log('Hashline edit succeeded after LLM correction');
              return retryResult;
            }
            debugLogger.log('Hashline LLM correction retry also failed');
          }
        }
      }

      // Return mismatch error (no correction attempted or correction failed)
      const diagnostic = buildMismatchDiagnostic(mismatches, mismatches.length);
      return {
        currentContent: normalizedContent,
        newContent: normalizedContent,
        error: {
          display: `Hash mismatch: ${mismatches.length} anchor(s) stale.`,
          raw: diagnostic,
          type: ToolErrorType.HASHLINE_MISMATCH,
        },
        originalLineEnding,
      };
    }

    // === PHASE 1b: Reject mixed anchor + replace operations ===
    if (hasMixedOps(this.params.operations)) {
      return {
        currentContent: normalizedContent,
        newContent: normalizedContent,
        error: {
          display: 'Cannot mix anchor-based operations (set_line, replace_lines, insert_after) with fallback replace in a single call.',
          raw: 'Cannot mix anchor-based operations with fallback replace. Use separate calls for each type.',
          type: ToolErrorType.HASHLINE_INVALID_ANCHOR,
        },
        originalLineEnding,
      };
    }

    // === PHASE 1c: Validate ascending anchor order ===
    const orderCheck = validateAscendingOrder(this.params.operations);
    if (!orderCheck.valid) {
      return {
        currentContent: normalizedContent,
        newContent: normalizedContent,
        error: {
          display: `Operations must target lines in ascending order. Anchor ${orderCheck.anchor} (line ${orderCheck.line}) comes after a previous operation targeting line ${orderCheck.lastLine}.`,
          raw: `Operations must target lines in ascending order. Reorder operations so earlier lines are edited first. Anchor ${orderCheck.anchor} (line ${orderCheck.line}) follows an operation on line ${orderCheck.lastLine}.`,
          type: ToolErrorType.HASHLINE_INVALID_ANCHOR,
        },
        originalLineEnding,
      };
    }

    // === PHASE 2: Apply operations with line offset tracking ===
    const applyResult = applyAllOperations(lines, fileHashes, this.params.operations);
    if ('error' in applyResult) {
      return {
        currentContent: normalizedContent,
        newContent: normalizedContent,
        error: {
          display: applyResult.error,
          raw: applyResult.error,
          type: applyResult.type,
        },
        originalLineEnding,
      };
    }

    return {
      currentContent: normalizedContent,
      newContent: lines.join('\n'),
      originalLineEnding,
    };
  }

  private attemptCorrectedOperations(
    currentContent: string,
    correction: HashlineEditCorrection,
    originalLineEnding: string,
  ): { currentContent: string; newContent: string; originalLineEnding: string } | null {
    const retryHashes = computeFileHashes(currentContent);
    const retryLines = currentContent.split('\n');

    // Phase 1: Validate corrected anchors
    for (const retryOp of correction.operations) {
      if (retryOp.op === 'replace') continue;
      for (const aStr of [retryOp.anchor, retryOp.start_anchor, retryOp.end_anchor].filter(Boolean) as string[]) {
        const vr = validateAnchor(aStr, retryHashes);
        if ('mismatch' in vr || 'error' in vr) return null;
      }
    }

    const correctionOps = correction.operations as HashlineOperation[];

    if (hasMixedOps(correctionOps)) {
      debugLogger.log('Hashline LLM correction produced mixed ops — rejecting');
      return null;
    }

    const orderCheck = validateAscendingOrder(correctionOps);
    if (!orderCheck.valid) {
      debugLogger.log('Hashline LLM correction produced out-of-order ops — rejecting');
      return null;
    }

    const retryLinesArr = [...retryLines];
    const applyResult = applyAllOperations(retryLinesArr, retryHashes, correctionOps);
    if ('error' in applyResult) return null;

    return {
      currentContent,
      newContent: retryLinesArr.join('\n'),
      originalLineEnding,
    };
  }

  protected override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    let editData;
    try {
      editData = await this.calculateEdit(abortSignal);
    } catch (error) {
      if (abortSignal.aborted) throw error;
      debugLogger.log(`Error preparing hashline edit: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }

    if (editData.error) {
      debugLogger.log(`Error: ${editData.error.display}`);
      return false;
    }

    const fileName = path.basename(this.params.file_path);
    const fileDiff = Diff.createPatch(
      fileName,
      editData.currentContent,
      editData.newContent,
      'Current',
      'Proposed',
      DEFAULT_DIFF_OPTIONS,
    );

    const ideClient = await IdeClient.getInstance();
    const ideConfirmation =
      this.config.getIdeMode() && ideClient.isDiffingEnabled()
        ? ideClient.openDiff(this.params.file_path, editData.newContent)
        : undefined;

    const confirmationDetails: ToolEditConfirmationDetails = {
      type: 'edit',
      title: `Confirm Edit: ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`,
      fileName,
      filePath: this.params.file_path,
      fileDiff,
      originalContent: editData.currentContent,
      newContent: editData.newContent,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        } else {
          await this.publishPolicyUpdate(outcome);
        }
      },
      ideConfirmation,
    };
    return confirmationDetails;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.config.validatePathAccess(this.resolvedPath);
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: 'Error: Path not in workspace.',
        error: { message: validationError, type: ToolErrorType.PATH_NOT_IN_WORKSPACE },
      };
    }

    let editData;
    try {
      editData = await this.calculateEdit(signal);
    } catch (error) {
      if (signal.aborted) throw error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error preparing hashline edit: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
        error: { message: errorMsg, type: ToolErrorType.EDIT_PREPARATION_FAILURE },
      };
    }

    if (editData.error) {
      return {
        llmContent: editData.error.raw,
        returnDisplay: `Error: ${editData.error.display}`,
        error: { message: editData.error.raw, type: editData.error.type },
      };
    }

    try {
      const dirName = path.dirname(this.params.file_path);
      try {
        await fsPromises.access(dirName);
      } catch {
        await fsPromises.mkdir(dirName, { recursive: true });
      }

      let finalContent = editData.newContent;
      if (editData.originalLineEnding === '\r\n') {
        finalContent = finalContent.replace(/\r?\n/g, '\r\n');
      }
      // Preserve trailing newline presence/absence
      const originalHadTrailingNewline = editData.currentContent.endsWith('\n');
      const editedHasTrailingNewline = finalContent.endsWith('\n');
      if (originalHadTrailingNewline && !editedHasTrailingNewline) {
        finalContent += editData.originalLineEnding === '\r\n' ? '\r\n' : '\n';
      } else if (!originalHadTrailingNewline && editedHasTrailingNewline) {
        finalContent = finalContent.replace(/\r?\n$/, '');
      }

      await this.config.getFileSystemService().writeTextFile(this.params.file_path, finalContent);

      const fileName = path.basename(this.params.file_path);
      const fileDiff = Diff.createPatch(
        fileName,
        editData.currentContent,
        editData.newContent,
        'Current',
        'Proposed',
        DEFAULT_DIFF_OPTIONS,
      );
      const diffStat = getDiffStat(fileName, editData.currentContent, editData.newContent, editData.newContent);
      const displayResult: ToolResultDisplay = {
        fileDiff,
        fileName,
        filePath: this.params.file_path,
        originalContent: editData.currentContent,
        newContent: editData.newContent,
        diffStat,
        isNewFile: false,
      };

      debugLogger.log(
        `hashline_edit_telemetry: ` +
        `ops=${this.params.operations.length} ` +
        `mix=${this.params.operations.map((op) => op.op).join(',')} ` +
        `mismatches=0 ` +
        `correction_attempted=false ` +
        `correction_succeeded=false`,
      );

      return {
        llmContent: `Successfully edited ${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))}`,
        returnDisplay: displayResult,
      };
    } catch (error) {
      if (signal.aborted) throw error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error writing hashline edit: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
        error: { message: errorMsg, type: ToolErrorType.FILE_WRITE_FAILURE },
      };
    }
  }
}

export class HashlineEditTool
  extends BaseDeclarativeTool<HashlineEditToolParams, ToolResult>
  implements ModifiableDeclarativeTool<HashlineEditToolParams>
{
  static readonly Name = HASHLINE_EDIT_TOOL_NAME;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      HashlineEditTool.Name,
      'Hashline Edit',
      HASHLINE_EDIT_DEFINITION.base.description!,
      Kind.Edit,
      HASHLINE_EDIT_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  protected override validateToolParamValues(
    params: HashlineEditToolParams,
  ): string | null {
    if (!params.file_path) {
      return "The 'file_path' parameter must be non-empty.";
    }

    let filePath = params.file_path;
    if (!path.isAbsolute(filePath)) {
      const result = correctPath(filePath, this.config);
      if (!result.success) {
        return result.error;
      }
      filePath = result.correctedPath;
    }
    params.file_path = filePath;

    return this.config.validatePathAccess(params.file_path);
  }

  protected createInvocation(
    params: HashlineEditToolParams,
    messageBus: MessageBus,
  ): ToolInvocation<HashlineEditToolParams, ToolResult> {
    return new HashlineEditToolInvocation(
      this.config,
      messageBus,
      params,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(HASHLINE_EDIT_DEFINITION, modelId);
  }

  getModifyContext(_: AbortSignal): ModifyContext<HashlineEditToolParams> {
    return {
      getFilePath: (params) => params.file_path,
      getCurrentContent: async (params) => {
        const resolvedPath = path.resolve(
          this.config.getTargetDir(),
          params.file_path,
        );
        return fsPromises.readFile(resolvedPath, 'utf-8');
      },
      getProposedContent: async (params) => {
        const resolvedPath = path.resolve(
          this.config.getTargetDir(),
          params.file_path,
        );
        const currentContent = await fsPromises.readFile(resolvedPath, 'utf-8');
        const normalizedContent = currentContent.replace(/\r\n/g, '\n');
        const fileHashes = computeFileHashes(normalizedContent);
        const lines = normalizedContent.split('\n');

        let lineOffset = 0;
        for (const op of params.operations) {
          const result = applyOperationWithOffset(lines, fileHashes, op, lineOffset);
          if ('error' in result) {
            return normalizedContent; // Return unchanged on error
          }
          lineOffset = result.newOffset;
        }
        return lines.join('\n');
      },
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        originalParams: HashlineEditToolParams,
      ) => ({
        ...originalParams,
        operations: [
          {
            op: 'replace' as const,
            old_text: _oldContent,
            new_text: modifiedProposedContent,
          },
        ],
      }),
    };
  }
}

// --- Backward Compatibility Shim ---

interface ReplaceCompatParams {
  file_path: string;
  instruction: string;
  old_string: string;
  new_string: string;
  expected_replacements?: number;
}

class ReplaceCompatShimInvocation
  extends BaseToolInvocation<ReplaceCompatParams, ToolResult>
  implements ToolInvocation<ReplaceCompatParams, ToolResult>
{
  readonly kind = Kind.Edit;

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
    params: ReplaceCompatParams,
  ) {
    super(params, messageBus, 'replace');
  }

  override getDescription(): string {
    return `${shortenPath(makeRelative(this.params.file_path, this.config.getTargetDir()))} (compat shim → hashline_edit)`;
  }

  override toolLocations(): ToolLocation[] {
    return [{ path: path.resolve(this.config.getTargetDir(), this.params.file_path) }];
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    // Delegate to HashlineEditToolInvocation with a single replace op
    const hashlineParams: HashlineEditToolParams = {
      file_path: this.params.file_path,
      instruction: this.params.instruction,
      operations: [
        {
          op: 'replace',
          old_text: this.params.old_string,
          new_text: this.params.new_string,
        },
      ],
    };
    const invocation = new HashlineEditToolInvocation(
      this.config,
      this.messageBus,
      hashlineParams,
    );
    return invocation.execute(signal);
  }
}

export class ReplaceCompatShimTool extends BaseDeclarativeTool<
  ReplaceCompatParams,
  ToolResult
> {
  static readonly Name = 'replace';

  constructor(
    private readonly config: Config,
    messageBus: MessageBus,
  ) {
    super(
      ReplaceCompatShimTool.Name,
      'Edit',
      EDIT_DEFINITION.base.description!,
      Kind.Edit,
      EDIT_DEFINITION.base.parametersJsonSchema,
      messageBus,
      true,
      false,
    );
  }

  override getSchema(modelId?: string) {
    return resolveToolDeclaration(EDIT_DEFINITION, modelId);
  }

  protected createInvocation(
    params: ReplaceCompatParams,
    messageBus: MessageBus,
  ): ToolInvocation<ReplaceCompatParams, ToolResult> {
    return new ReplaceCompatShimInvocation(this.config, messageBus, params);
  }
}
