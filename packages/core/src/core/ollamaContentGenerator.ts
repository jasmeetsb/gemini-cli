/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { type ContentGenerator } from './contentGenerator.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import {
  type GenerateContentParameters,
  type GenerateContentResponse,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentParameters,
  type EmbedContentResponse,
  type Content,
} from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

export class OllamaContentGenerator implements ContentGenerator {
  private readonly host: string;
  private readonly model: string;

  constructor(host: string, model: string) {
    this.host = host || 'http://localhost:11434';
    this.model = model;
  }

  private mapContentsToOllama(
    contents: Content[],
  ): Array<{ role: string; content: string }> {
    return contents.map((c) => {
      let role = c.role;
      if (role === 'model') {
        role = 'assistant';
      }
      const content = c.parts ? c.parts.map((p) => p.text || '').join('') : '';
      return { role: role || 'user', content };
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const url = `${this.host}/api/chat`;
     
    const messages = this.mapContentsToOllama(request.contents as Content[]);

    const payload = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: request.config?.temperature,
        num_predict: request.config?.maxOutputTokens,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama error: ${response.status} ${response.statusText}`,
        );
      }

       
      const data = await response.json();

      // Map Ollama response to GenerateContentResponse
       
      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: data.message.content }],
            },
          },
        ],
      } as GenerateContentResponse;
    } catch (error) {
      debugLogger.error(
        `[OllamaContentGenerator] Failed to generate content:`,
        error,
      );
      throw error;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const url = `${this.host}/api/chat`;
     
    const messages = this.mapContentsToOllama(request.contents as Content[]);

    const payload = {
      model: this.model,
      messages,
      stream: true,
      options: {
        temperature: request.config?.temperature,
        num_predict: request.config?.maxOutputTokens,
      },
    };

    async function* makeStream() {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(
            `Ollama error: ${response.status} ${response.statusText}`,
          );
        }

        if (!response.body) {
          throw new Error('Ollama response body is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer

          for (const line of lines) {
            if (line.trim() === '') continue;
             
            const data = JSON.parse(line);

            if (data.error) {
              throw new Error(`Ollama stream error: ${data.error}`);
            }

             
            yield {
              candidates: [
                {
                  content: {
                    role: 'model',
                    parts: [{ text: data.message.content }],
                  },
                },
              ],
            } as GenerateContentResponse;

            if (data.done) {
              return;
            }
          }
        }
      } catch (error) {
        debugLogger.error(
          `[OllamaContentGenerator] Failed to generate stream:`,
          error,
        );
        throw error;
      }
    }

    return makeStream();
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Heuristic: estimate tokens as words * 1.3
    let text = '';
    if (request.contents) {
      if (Array.isArray(request.contents)) {
         
        text = request.contents
          .map((c: any) =>
            c.parts ? c.parts.map((p: any) => p.text || '').join('') : '',
          )
          .join(' ');
      } else if (typeof request.contents === 'string') {
        text = request.contents;
      }
    }
    const words = text.split(/\s+/).length;
    const estimatedTokens = Math.ceil(words * 1.3);

    debugLogger.warn(
      `[OllamaContentGenerator] countTokens uses a heuristic estimate.`,
    );

    return {
      totalTokens: estimatedTokens,
    } as CountTokensResponse;
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error('Method not implemented.');
  }
}
