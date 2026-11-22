import { openai, createOpenAI } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic } from '@ai-sdk/anthropic';
import { LanguageModel } from 'ai';
import { ModelProviderInfo } from '../types';

export function getActiveModelProvider(): ModelProviderInfo {
  const available: string[] = [];

  if (process.env.OPENAI_API_KEY) available.push('openai');
  if (process.env.GEMINI_API_KEY) available.push('gemini');
  if (process.env.ANTHROPIC_API_KEY) available.push('anthropic');
  if (process.env.GROQ_API_KEY) available.push('groq');
  if (process.env.OPENAI_BASE_URL) available.push('custom');

  let provider: ModelProviderInfo['provider'] = 'unconfigured';
  let modelId = 'gpt-4o-mini';

  if (process.env.OPENAI_API_KEY) {
    provider = 'openai';
    modelId = process.env.DEFAULT_MODEL || 'gpt-4o-mini';
  } else if (process.env.GEMINI_API_KEY) {
    provider = 'gemini';
    modelId = process.env.DEFAULT_MODEL || 'gemini-2.0-flash';
  } else if (process.env.ANTHROPIC_API_KEY) {
    provider = 'anthropic';
    modelId = process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20241022';
  } else if (process.env.GROQ_API_KEY) {
    provider = 'groq';
    modelId = process.env.DEFAULT_MODEL || 'llama-3.3-70b-versatile';
  } else if (process.env.OPENAI_BASE_URL) {
    provider = 'custom';
    modelId = process.env.DEFAULT_MODEL || 'default';
  }

  return {
    provider,
    modelId,
    availableProviders: available,
  };
}

export function resolveLanguageModel(requestedProvider?: string, requestedModel?: string): LanguageModel {
  const active = getActiveModelProvider();
  const provider = requestedProvider || active.provider;

  if (provider === 'gemini' || (!requestedProvider && process.env.GEMINI_API_KEY)) {
    const model = requestedModel || process.env.DEFAULT_MODEL || 'gemini-2.0-flash';
    return google(model);
  }

  if (provider === 'anthropic' || (!requestedProvider && process.env.ANTHROPIC_API_KEY)) {
    const model = requestedModel || process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20241022';
    return anthropic(model);
  }

  if (provider === 'groq' || (!requestedProvider && process.env.GROQ_API_KEY)) {
    const groqClient = createOpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
    });
    const model = requestedModel || process.env.DEFAULT_MODEL || 'llama-3.3-70b-versatile';
    return groqClient(model);
  }

  if (process.env.OPENAI_BASE_URL) {
    const customClient = createOpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENAI_API_KEY || 'dummy',
    });
    return customClient(requestedModel || process.env.DEFAULT_MODEL || 'default');
  }

  // Default OpenAI
  const model = requestedModel || process.env.DEFAULT_MODEL || 'gpt-4o-mini';
  return openai(model);
}
