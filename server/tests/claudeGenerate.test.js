const test = require('node:test');
const assert = require('node:assert/strict');
const { generateFromCode } = require('../services/claudeGenerate');

function fakeClient(toolInput) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'generate_test', input: toolInput }] }) } };
}

test('maps the forced tool_use result into summary/steps/code/testData', async () => {
  const client = fakeClient({
    summary: 'Logs in and lands on the dashboard.',
    steps: [{ description: 'Fill email', selector: '#email', confidence: 'high' }],
    code: "await page.fill('#email', 'x');",
    testData: { email: 'user@stackbox.xyz' },
  });

  const result = await generateFromCode(client, { rawCode: '', matchedBlockNames: [] });

  assert.match(result.summary, /dashboard/);
  assert.deepEqual(result.steps, [{ index: 0, description: 'Fill email', selector: '#email', confidence: 'high' }]);
  assert.deepEqual(result.testData, { email: 'user@stackbox.xyz' });
});

test('throws a clear error when Claude does not return a tool_use block', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'oops' }] }) } };
  await assert.rejects(() => generateFromCode(client, { rawCode: '', matchedBlockNames: [] }), /generate_test/);
});

test('includes the matched-block hint in the prompt sent to Claude', async () => {
  let capturedPrompt = '';
  const client = {
    messages: {
      create: async (params) => {
        capturedPrompt = params.messages[0].content;
        return { content: [{ type: 'tool_use', name: 'generate_test', input: { summary: 's', steps: [], code: '', testData: {} } }] };
      },
    },
  };
  await generateFromCode(client, { rawCode: 'code', matchedBlockNames: ['Login'] });
  assert.match(capturedPrompt, /Login/);
});
