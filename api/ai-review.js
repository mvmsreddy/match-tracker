import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What happened, 2-4 sentences' },
    selfWeaknesses: { type: 'array', items: { type: 'string' } },
    oppWeaknesses: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'selfWeaknesses', 'oppWeaknesses', 'suggestions'],
  additionalProperties: false,
};

const SCOPE_LABEL = { game: 'this game', set: 'this set', match: 'the match so far' };

function buildPrompt(scope, header, points) {
  const label = SCOPE_LABEL[scope] || 'the match so far';
  const selfName = header?.selfName || 'the player';
  const oppName = header?.oppName || 'the opponent';
  const context = [
    `Reviewing ${label} for ${selfName} vs ${oppName}.`,
    header?.surface ? `Surface: ${header.surface}.` : null,
    header?.oppHandedness ? `Opponent handedness: ${header.oppHandedness}.` : null,
  ].filter(Boolean).join(' ');

  return `${context}\n\nPoints played (JSON array, one object per point, in chronological order):\n${JSON.stringify(points)}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { scope, header, points } = req.body || {};
  if (!scope || !Array.isArray(points) || points.length === 0) {
    res.status(400).json({ error: 'Missing scope or points' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'AI review is not configured (missing ANTHROPIC_API_KEY)' });
    return;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: 'You are an expert tennis coach reviewing point-by-point match data. ' +
        'Be concrete and specific, citing patterns from the data (serve side, shot type, error type, rally length). ' +
        'Only draw conclusions the data actually supports — do not invent details.',
      output_config: { format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
      messages: [{ role: 'user', content: buildPrompt(scope, header, points) }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const review = JSON.parse(textBlock.text);
    res.status(200).json(review);
  } catch (err) {
    console.error('ai-review error', err);
    res.status(err.status || 500).json({ error: err.message || 'AI review failed' });
  }
}
