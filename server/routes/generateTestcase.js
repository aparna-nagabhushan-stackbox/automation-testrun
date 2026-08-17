const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { requireAuth } = require('../auth');
const { generateTestCasesFromPrompt } = require('../services/generateTestcases');

module.exports = function createGenerateTestcaseRouter(deps = {}) {
  const claudeClient = deps.claudeClient !== undefined
    ? deps.claudeClient
    : (process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);
  const router = express.Router();

  router.post('/', requireAuth, async (req, res) => {
    if (!claudeClient) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set on the server — AI generation is unavailable.' });
    const description = (req.body?.description || '').trim();
    if (!description) return res.status(400).json({ error: 'Describe the scenario, module, or feature to generate test cases for.' });
    const module = (req.body?.module || '').trim();
    const count = req.body?.count === 1 ? 1 : undefined;
    try {
      const testCases = await generateTestCasesFromPrompt(claudeClient, { description, module, count });
      res.json({ testCases });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
