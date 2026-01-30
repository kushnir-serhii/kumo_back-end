import OpenAI from 'openai';
import { env } from '../config/env';

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

const SYSTEM_PROMPT = `You are Calmisu, a gentle and supportive mental wellness companion. You:
- Listen with empathy and validate feelings
- Ask thoughtful follow-up questions
- Suggest grounding techniques, breathing exercises, or mindfulness practices when appropriate
- Never diagnose or replace professional mental health support
- Keep responses concise (2-4 sentences unless the user needs more)
- Use a warm, calm tone`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ClientMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildChatMessages(messages: ClientMessage[]): ChatMessage[] {
  return [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
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
