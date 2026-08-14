const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const express = require('express');
const createGenerateTestcaseRouter = require('../routes/generateTestcase');

const AUTH_COOKIE = 'auth_token=' + jwt.sign(
  { sub: '1', email: 'a@stackbox.xyz', role: 'user' },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
const JSON_HEADERS = { 'Content-Type': 'application/json', Cookie: AUTH_COOKIE };

function freshApp(claudeClient) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/generate-testcase', createGenerateTestcaseRouter({ claudeClient }));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

test('rejects an unauthenticated request', async () => {
  const app = freshApp({ messages: { create: async () => ({ content: [] }) } });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/generate-testcase`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'x' }),
    });
    assert.equal(res.status, 401);
  } finally { server.close(); }
});

test('rejects a request with no description', async () => {
  const app = freshApp({ messages: { create: async () => ({ content: [] }) } });
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/generate-testcase`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  } finally { server.close(); }
});

test('returns 500 with a clear message when ANTHROPIC_API_KEY is not configured', async () => {
  const app = freshApp(null);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/generate-testcase`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ description: 'Login feature' }),
    });
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.match(body.error, /ANTHROPIC_API_KEY/);
  } finally { server.close(); }
});

test('returns generated test cases for a valid request', async () => {
  const claudeClient = {
    messages: {
      create: async () => ({
        content: [{
          type: 'tool_use', name: 'generate_manual_testcases',
          input: { testCases: [{ title: 'Verify login', scenario: 's', platform: 'Web', preCondition: '', steps: ['Open page'], testData: '', expected: 'Logs in' }] },
        }],
      }),
    },
  };
  const app = freshApp(claudeClient);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/generate-testcase`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ description: 'Login feature', module: 'Login' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.testCases.length, 1);
    assert.equal(body.testCases[0].title, 'Verify login');
  } finally { server.close(); }
});

test('passes count: 1 through to the service for a single-card regenerate', async () => {
  let capturedPrompt = '';
  const claudeClient = {
    messages: {
      create: async (params) => {
        capturedPrompt = params.messages[0].content;
        return {
          content: [{
            type: 'tool_use', name: 'generate_manual_testcases',
            input: { testCases: [{ title: 'Verify login', scenario: 's', platform: 'Web', preCondition: '', steps: ['Open page'], testData: '', expected: 'Logs in' }] },
          }],
        };
      },
    },
  };
  const app = freshApp(claudeClient);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(`http://localhost:${port}/api/generate-testcase`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ description: 'Refine this one', count: 1 }),
    });
    assert.equal(res.status, 200);
    assert.match(capturedPrompt, /exactly one revised test case/);
  } finally { server.close(); }
});
