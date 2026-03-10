import OpenAI from 'openai';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { env } from '../config/env';
import { httpError } from '../utils/errors';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _openai;
}

const CORE_PROMPT = readFileSync(
  resolve(__dirname, '../../src/prompts/calmisu-core.md'),
  'utf-8'
);

const ACTIVITIES_PROMPT = readFileSync(
  resolve(__dirname, '../../src/prompts/calmisu-activities.md'),
  'utf-8'
);

// Inject activities section only when the recent conversation contains relevant signals
const ACTIVITY_KEYWORDS = /anxi|panic|overwhelm|stress|breath|grounding|sleep|racing.thought|intrusive|restless|calm.down|dissociat/i;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_TOKENS_PER_MESSAGE = 500;  // ~2,000 chars
const MAX_TOTAL_TOKENS = 4000;       // whole context

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function validateMessageTokens(messages: ClientMessage[]): void {
  let total = 0;
  for (const msg of messages) {
    const tokens = estimateTokens(msg.content);
    if (tokens > MAX_TOKENS_PER_MESSAGE) {
      httpError(`Message too long (approx ${tokens} tokens, max ${MAX_TOKENS_PER_MESSAGE})`, 400);
    }
    total += tokens;
  }
  if (total > MAX_TOTAL_TOKENS) {
    httpError(`Conversation too long (approx ${total} tokens, max ${MAX_TOTAL_TOKENS})`, 400);
  }
}

export function buildChatMessages(messages: ClientMessage[]): ChatMessage[] {
  const recentText = messages.slice(-3).map(m => m.content).join(' ');
  const systemContent = ACTIVITY_KEYWORDS.test(recentText)
    ? `${CORE_PROMPT}\n\n${ACTIVITIES_PROMPT}`
    : CORE_PROMPT;
  return [{ role: 'system', content: systemContent }, ...messages];
}

export async function* streamChatResponse(
  messages: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
  const stream = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}
