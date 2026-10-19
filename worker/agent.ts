// Agent endpoint: keeps the OpenAI key on the server. The browser runs the tools itself
// (through the existing store) so cloud sync, XP and undo keep working unchanged.

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
}

const DEFAULT_MODEL = 'gpt-6-luna';
const MAX_MESSAGES = 40;
const MAX_BODY_CHARS = 60_000;

const SYSTEM = `You are the quest coach inside "Quest Board", a gamified kanban app.
Quests live in columns; the done column holds finished quests with their completion dates (the user's history).
Rules:
- Call list_board before changing anything so you know the real ids and today's date. Never invent ids.
- You may create, edit and move quests when the user asks for it directly.
- When the user shares a wish or goal (e.g. "I want a six-pack"), or asks what to do next, study their history
  (what they finish, how often, which difficulty) and PROPOSE 3-5 concrete, small quests with difficulty and a
  sensible deadline. Do not create them until the user agrees; then create exactly the ones they accepted.
- Keep replies short and answer in the user's language.`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_board',
      description: "Return today's date, labels, and all columns with their quests (including completion history).",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_quest',
      description: 'Create a quest at the bottom of a column.',
      parameters: {
        type: 'object',
        properties: {
          columnId: { type: 'string' },
          title: { type: 'string', maxLength: 120 },
          description: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'normal', 'hard', 'boss'] },
          deadline: { type: 'string', description: 'YYYY-MM-DD, local date' },
          labelIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['columnId', 'title'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_quest',
      description: 'Change fields of an existing quest. Only send the fields to change. deadline null removes it.',
      parameters: {
        type: 'object',
        properties: {
          questId: { type: 'string' },
          title: { type: 'string', maxLength: 120 },
          description: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'normal', 'hard', 'boss'] },
          deadline: { type: ['string', 'null'], description: 'YYYY-MM-DD or null' },
          labelIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['questId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_quest',
      description: 'Move a quest to the bottom of another column. Moving into the done column completes it; the app asks the user to confirm first.',
      parameters: {
        type: 'object',
        properties: { questId: { type: 'string' }, toColumnId: { type: 'string' } },
        required: ['questId', 'toColumnId'],
        additionalProperties: false,
      },
    },
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Only signed-in users may spend OpenAI credit: ask Supabase Auth whether the access token is valid. */
async function isSignedIn(req: Request, env: Env): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  return res.ok;
}

export async function handleAgent(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!(await isSignedIn(req, env))) return json({ error: 'Sign in required' }, 401);
  if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY is not set' }, 500);

  // Cap input so one user cannot run up the OpenAI bill with a huge history.
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: 'Conversation too long' }, 413);
  let messages: unknown;
  try {
    messages = JSON.parse(raw).messages;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return json({ error: `messages must be an array of 1-${MAX_MESSAGES} items` }, 400);
  }
  // The client may not inject its own system prompt.
  if (messages.some((m) => !m || typeof m !== 'object' || (m as { role?: string }).role === 'system')) {
    return json({ error: 'Invalid message' }, 400);
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    // gpt-6-luna rejects tools + reasoning on chat/completions; shortcut: reasoning off, move to /v1/responses if reasoning is needed.
    body: JSON.stringify({
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      messages: [{ role: 'system', content: SYSTEM }, ...messages],
      tools,
      reasoning_effort: 'none',
    }),
  });
  if (!res.ok) {
    console.error('OpenAI error', res.status, await res.text());
    return json({ error: 'AI request failed' }, 502);
  }
  const data = (await res.json()) as { choices: { message: unknown }[] };
  // Returns either a text reply or tool_calls for the browser to run.
  return json({ message: data.choices[0].message });
}
