/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

const HASH_LEN = 3;
const HASH_MOD = 16 ** HASH_LEN; // 4096

// Pre-computed lookup table for hex encoding
const HASH_DICT: string[] = Array.from({ length: HASH_MOD }, (_, i) =>
  i.toString(16).padStart(HASH_LEN, '0'),
);

/**
 * Computes a 3-character hex content hash for a single line.
 * Strips trailing CR and leading/trailing whitespace before hashing
 * to make it indentation-invariant while preserving interior whitespace
 * for stronger staleness detection. 3 hex chars = 4096 values.
 */
export function computeLineHash(line: string): string {
  const normalized = line.replace(/\r$/, '').trim();
  const hash = createHash('sha256').update(normalized).digest();
  // Use first 4 bytes as uint32, mod 4096, lookup hex
  const value = hash.readUInt32LE(0) % HASH_MOD;
  return HASH_DICT[value];
}

/**
 * Formats a single line with hashline prefix.
 * Format: {linenum}:{hash}|{content}
 */
export function formatHashline(
  lineNumber: number,
  lineContent: string,
): string {
  const hash = computeLineHash(lineContent);
  return `${lineNumber}:${hash}|${lineContent}`;
}

export interface LineHash {
  line: number;
  hash: string;
  content: string;
}

/**
 * Computes hashes for all lines in file content.
 * Returns an array of { line, hash, content } for each line (1-indexed).
 */
export function computeFileHashes(content: string): LineHash[] {
  const lines = content.split('\n');
  return lines.map((lineContent, index) => ({
    line: index + 1,
    hash: computeLineHash(lineContent),
    content: lineContent,
  }));
}

export interface ParsedLineRef {
  line: number;
  hash: string;
}

/**
 * Parses a line reference string like "42:a3f" into { line, hash }.
 * Tolerant of model including line content after | or double spaces.
 * Also handles grep output format where content follows after a separator
 * (`:` or `-`), e.g., "42:a3f: return x" or "42:a3f- function foo()".
 * Returns null if the format is invalid.
 */
export function parseLineRef(ref: string): ParsedLineRef | null {
  // Strip content after | (read_file format: "42:a3f|content")
  let cleaned = ref.split('|')[0];
  // Strip content after double space (model may include line content)
  const doubleSpaceIdx = cleaned.indexOf('  ');
  if (doubleSpaceIdx !== -1) {
    cleaned = cleaned.substring(0, doubleSpaceIdx);
  }
  // Strip grep separator + trailing content: "42:a3f: content" or "42:a3f- content"
  // Match the pattern: digits, colon, 3 hex chars, then optional separator+content
  const grepMatch = cleaned.match(
    /^(\d+)\s*:\s*([0-9a-fA-F]{3})\s*[:\-\s]/,
  );
  if (grepMatch) {
    // Truncate to just the anchor portion
    cleaned = `${grepMatch[1]}:${grepMatch[2]}`;
  }
  // Normalize whitespace around colon
  cleaned = cleaned.replace(/\s*:\s*/, ':').trim();

  // Accept case-insensitive hex (models may output uppercase in retries)
  // and validate exactly 3 chars to match emitted hash length.
  const match = cleaned.match(/^(\d+):([0-9a-fA-F]{3})$/);
  if (!match) return null;

  const line = parseInt(match[1], 10);
  if (line < 1) return null;

  // Normalize to lowercase for comparison against computed hashes
  return { line, hash: match[2].toLowerCase() };
}

export interface HashMismatchInfo {
  anchor: string;
  expectedHash: string;
  actualHash: string;
  actualLine: number;
}

/**
 * Builds an actionable mismatch diagnostic message.
 * Shows what changed at original positions so the model can re-read and retry.
 */
export function buildMismatchDiagnostic(
  mismatches: HashMismatchInfo[],
  totalMismatched: number,
): string {
  const lines = [
    `Hashline mismatch: ${totalMismatched} anchor(s) do not match current file state.`,
    'The file has been modified since you last read it.',
    'The content at the original line positions has changed:',
  ];
  const shown = mismatches.slice(0, 5);
  for (const m of shown) {
    lines.push(
      `  ${m.anchor}: expected hash "${m.expectedHash}", found "${m.actualHash}" at line ${m.actualLine}`,
    );
  }
  if (totalMismatched > 5) {
    lines.push(`  ... and ${totalMismatched - 5} more.`);
  }
  lines.push('Re-read the file to get current anchors before retrying.');
  return lines.join('\n');
}
