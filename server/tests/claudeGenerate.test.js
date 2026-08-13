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

test('throws a clear error when the tool call came back truncated or malformed', async () => {
  // A response cut short by the token limit still parses as an object — with
  // `steps` missing, which used to surface as a bare TypeError/500.
  const truncated = fakeClient({ summary: 'Logs in', code: "await page.click('#a');" });
  await assert.rejects(() => generateFromCode(truncated, { rawCode: '', matchedBlockNames: [] }), /incomplete or malformed/);

  const wrongShape = fakeClient({ summary: 'x', steps: 'not-an-array', code: '', testData: {} });
  await assert.rejects(() => generateFromCode(wrongShape, { rawCode: '', matchedBlockNames: [] }), /incomplete or malformed/);

  // Even a complete-looking payload is rejected if Claude says it ran out of room.
  const cappedClient = {
    messages: {
      create: async () => ({
        stop_reason: 'max_tokens',
        content: [{ type: 'tool_use', name: 'generate_test', input: { summary: 's', steps: [], code: '', testData: {} } }],
      }),
    },
  };
  await assert.rejects(() => generateFromCode(cappedClient, { rawCode: '', matchedBlockNames: [] }), /incomplete or malformed/);
});

test('asks for enough tokens to cover a long recording', async () => {
  let params;
  const client = {
    messages: {
      create: async (p) => {
        params = p;
        return { content: [{ type: 'tool_use', name: 'generate_test', input: { summary: 's', steps: [], code: '', testData: {} } }] };
      },
    },
  };
  await generateFromCode(client, { rawCode: 'code', matchedBlockNames: [] });
  assert.ok(params.max_tokens >= 16000, 'max_tokens must leave room for a 50+ step recording');
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
