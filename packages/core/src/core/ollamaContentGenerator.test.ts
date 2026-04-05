/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import type { GenerateContentParameters } from '@google/genai';
import { LlmRole } from '../telemetry/llmRole.js';

describe('OllamaContentGenerator', () => {
  const mockHost = 'http://localhost:11434';
  const mockModel = 'llama3';
  let generator: OllamaContentGenerator;

  beforeEach(() => {
    generator = new OllamaContentGenerator(mockHost, mockModel);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should map contents correctly and call Ollama API', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        message: { content: 'Hello from Ollama' },
      }),
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', mockFetch);

    const request: GenerateContentParameters = {
      model: mockModel,
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ],
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
      },
    };

    const response = await generator.generateContent(
      request,
      'user-prompt-id',
      LlmRole.MAIN,
    );

    expect(mockFetch).toHaveBeenCalledWith(`${mockHost}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: mockModel,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
          { role: 'user', content: 'How are you?' },
        ],
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 100,
        },
      }),
    });

    expect(response).toEqual({
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ text: 'Hello from Ollama' }],
          },
        },
      ],
    });
  });

  it('should handle streaming response', async () => {
    const mockStream = {
      getReader: () => {
        let count = 0;
        const chunks = [
          JSON.stringify({ message: { content: 'Part 1 ' }, done: false }) +
            '\n',
          JSON.stringify({ message: { content: 'Part 2' }, done: true }) + '\n',
        ];
        return {
          read: async () => {
            if (count < chunks.length) {
              const value = new TextEncoder().encode(chunks[count]);
              count++;
              return { value, done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    };

    const mockResponse = {
      ok: true,
      body: mockStream,
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    vi.stubGlobal('fetch', mockFetch);

    const request: GenerateContentParameters = {
      model: mockModel,
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };

    const stream = generator.generateContentStream(
      request,
      'user-prompt-id',
      LlmRole.MAIN,
    );

    const results = [];
    for await (const chunk of await stream) {
      results.push(chunk);
    }

    expect(results.length).toBe(2);
    expect(results[0].candidates?.[0].content?.parts?.[0].text).toBe('Part 1 ');
    expect(results[1].candidates?.[0].content?.parts?.[0].text).toBe('Part 2');
  });

  it('should estimate tokens correctly', async () => {
    const request = {
      model: mockModel,
      contents: [
        { role: 'user', parts: [{ text: 'Hello world this is a test' }] },
      ],
    };
    const response = await generator.countTokens(request);
    // 6 words * 1.3 = 7.8 -> 8
    expect(response.totalTokens).toBe(8);
  });

  it('should throw error for embedContent', async () => {
    await expect(
      generator.embedContent({ model: mockModel, contents: [] }),
    ).rejects.toThrow('Method not implemented.');
  });
});
