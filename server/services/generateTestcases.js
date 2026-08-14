const GENERATE_TESTCASES_TOOL = {
  name: 'generate_manual_testcases',
  description: 'Generate a set of manual test cases (happy path, negative, and edge cases) for a described feature or scenario.',
  input_schema: {
    type: 'object',
    properties: {
      testCases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            scenario: { type: 'string' },
            platform: { type: 'string', enum: ['Web', 'App', 'Both'] },
            preCondition: { type: 'string' },
            steps: { type: 'array', items: { type: 'string' } },
            testData: { type: 'string' },
            expected: { type: 'string' },
          },
          required: ['title', 'scenario', 'platform', 'preCondition', 'steps', 'testData', 'expected'],
        },
      },
    },
    required: ['testCases'],
  },
};

async function generateTestCasesFromPrompt(client, { description, module, count }) {
  const coverageLine = count === 1
    ? 'Return exactly one revised test case reflecting the requested change.'
    : 'Cover the happy path plus realistic negative and edge cases (typically 3-5 test cases total).';
  const prompt = [
    `Write manual test cases for the following${module ? ` "${module}"` : ''} feature/scenario:`,
    description,
    coverageLine
    + ' For each test case, give a short imperative title, a one-sentence scenario description, whether '
    + 'it runs on Web, App, or Both, any pre-condition that must be true beforehand, numbered test steps '
    + 'as an array of strings, sample test data values needed to run it, and the expected result.',
  ].join('\n\n');

  const response = await client.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    tools: [GENERATE_TESTCASES_TOOL],
    tool_choice: { type: 'tool', name: 'generate_manual_testcases' },
    messages: [{ role: 'user', content: prompt }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse) {
    throw new Error('Claude did not return a generate_manual_testcases tool call');
  }

  const result = toolUse.input;
  if (
    response.stop_reason === 'max_tokens'
    || !result
    || !Array.isArray(result.testCases)
    || result.testCases.length === 0
  ) {
    throw new Error("Claude's response appears to be incomplete or malformed — try a shorter description.");
  }

  return result.testCases.map((tc) => ({
    title: String(tc.title || ''),
    scenario: String(tc.scenario || ''),
    platform: ['Web', 'App', 'Both'].includes(tc.platform) ? tc.platform : 'Web',
    preCondition: String(tc.preCondition || ''),
    steps: Array.isArray(tc.steps) ? tc.steps.map(String) : [],
    testData: String(tc.testData || ''),
    expected: String(tc.expected || ''),
  }));
}

module.exports = { generateTestCasesFromPrompt, GENERATE_TESTCASES_TOOL };
