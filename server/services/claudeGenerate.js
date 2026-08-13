const GENERATE_TOOL = {
  name: 'generate_test',
  description: 'Return plain-English steps with confidence flags, a plain-English summary, cleaned Playwright code, and extracted test data for a recorded browser flow.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            selector: { type: 'string' },
            confidence: { type: 'string', enum: ['low', 'high'] },
          },
          required: ['description', 'selector', 'confidence'],
        },
      },
      code: { type: 'string' },
      testData: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['summary', 'steps', 'code', 'testData'],
  },
};

async function generateFromCode(client, { rawCode, matchedBlockNames }) {
  const prompt = [
    'Here is a Playwright script captured by recording real browser interactions:',
    '```js\n' + rawCode + '\n```',
    matchedBlockNames && matchedBlockNames.length
      ? `These steps reuse the existing reusable block(s) "${matchedBlockNames.join('", "')}" — mention reusing them instead of inlining their steps, in the plain-English summary.`
      : '',
    'Clean up the code (prefer stable #id/data-testid/role selectors), write one numbered plain-English description per meaningful step, flag any locator that is not a stable id/data-testid/role selector as low confidence, extract any typed-in values into a testData object keyed by field name, and write a one-sentence summary of what the test does.',
  ].filter(Boolean).join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    // A recording is one step per click/keystroke, so 50+ interactions is
    // ordinary — and the response has to carry a description per step PLUS the
    // whole cleaned script. 4096 truncated real recordings mid-tool-call.
    max_tokens: 16000,
    tools: [GENERATE_TOOL],
    tool_choice: { type: 'tool', name: 'generate_test' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Claude did not return a generate_test tool call');
  }

  const result = toolUse.input;
  // A truncated tool_use call still parses as an object, just with fields
  // missing or half-built — which used to blow up as a bare `TypeError` from
  // `result.steps.map` and surface to the user as an unexplained 500. Check the
  // shape first and say what actually went wrong.
  if (
    response.stop_reason === 'max_tokens'
    || !result
    || typeof result.summary !== 'string'
    || !Array.isArray(result.steps)
    || typeof result.code !== 'string'
    || typeof result.testData !== 'object'
    || result.testData === null
  ) {
    throw new Error("Claude's response appears to be incomplete or malformed — try a shorter recording.");
  }

  return {
    summary: result.summary,
    steps: result.steps.map((s, index) => ({ index, ...s })),
    code: result.code,
    testData: result.testData,
  };
}

module.exports = { generateFromCode, GENERATE_TOOL };
