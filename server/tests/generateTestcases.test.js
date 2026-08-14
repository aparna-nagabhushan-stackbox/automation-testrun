const test = require('node:test');
const assert = require('node:assert/strict');
const { generateTestCasesFromPrompt } = require('../services/generateTestcases');

function fakeClient(toolInput, extra = {}) {
  return { messages: { create: async () => ({ content: [{ type: 'tool_use', name: 'generate_manual_testcases', input: toolInput }], ...extra }) } };
}

test('maps the forced tool_use result into a normalized test case array', async () => {
  const client = fakeClient({
    testCases: [
      {
        title: 'Verify login with valid credentials',
        scenario: 'User logs in with a valid email/password pair',
        platform: 'Web',
        preCondition: 'User has an active account',
        steps: ['Open login page', 'Enter valid email and password', 'Click Login'],
        testData: 'email: test@stackbox.xyz / password: Valid@123',
        expected: 'User is redirected to the dashboard',
      },
    ],
  });

  const result = await generateTestCasesFromPrompt(client, { description: 'Login feature', module: 'Login' });

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Verify login with valid credentials');
  assert.deepEqual(result[0].steps, ['Open login page', 'Enter valid email and password', 'Click Login']);
  assert.equal(result[0].platform, 'Web');
});

test('falls back to Web when platform is missing or invalid', async () => {
  const client = fakeClient({
    testCases: [{ title: 't', scenario: 's', preCondition: '', steps: [], testData: '', expected: 'e', platform: 'Desktop' }],
  });
  const result = await generateTestCasesFromPrompt(client, { description: 'x' });
  assert.equal(result[0].platform, 'Web');
});

test('throws a clear error when Claude does not return a tool_use block', async () => {
  const client = { messages: { create: async () => ({ content: [{ type: 'text', text: 'oops' }] }) } };
  await assert.rejects(() => generateTestCasesFromPrompt(client, { description: 'x' }), /generate_manual_testcases/);
});

test('throws a clear error when the tool call came back truncated or malformed', async () => {
  const empty = fakeClient({ testCases: [] });
  await assert.rejects(() => generateTestCasesFromPrompt(empty, { description: 'x' }), /incomplete or malformed/);

  const wrongShape = fakeClient({ testCases: 'not-an-array' });
  await assert.rejects(() => generateTestCasesFromPrompt(wrongShape, { description: 'x' }), /incomplete or malformed/);

  const cappedClient = {
    messages: {
      create: async () => ({
        stop_reason: 'max_tokens',
        content: [{ type: 'tool_use', name: 'generate_manual_testcases', input: { testCases: [{ title: 't' }] } }],
      }),
    },
  };
  await assert.rejects(() => generateTestCasesFromPrompt(cappedClient, { description: 'x' }), /incomplete or malformed/);
});

test('includes the module hint and description in the prompt sent to Claude', async () => {
  let capturedPrompt = '';
  const client = {
    messages: {
      create: async (params) => {
        capturedPrompt = params.messages[0].content;
        return { content: [{ type: 'tool_use', name: 'generate_manual_testcases', input: { testCases: [{ title: 't', scenario: 's', preCondition: '', steps: [], testData: '', expected: 'e', platform: 'Web' }] } }] };
      },
    },
  };
  await generateTestCasesFromPrompt(client, { description: 'User can reset their password', module: 'Login' });
  assert.match(capturedPrompt, /Login/);
  assert.match(capturedPrompt, /reset their password/);
});

test('count: 1 asks Claude for exactly one revised test case instead of a 3-5 spread', async () => {
  let capturedPrompt = '';
  const client = {
    messages: {
      create: async (params) => {
        capturedPrompt = params.messages[0].content;
        return { content: [{ type: 'tool_use', name: 'generate_manual_testcases', input: { testCases: [{ title: 't', scenario: 's', preCondition: '', steps: [], testData: '', expected: 'e', platform: 'Web' }] } }] };
      },
    },
  };
  await generateTestCasesFromPrompt(client, { description: 'Refine this test case', count: 1 });
  assert.match(capturedPrompt, /exactly one revised test case/);
  assert.doesNotMatch(capturedPrompt, /3-5/);
});
