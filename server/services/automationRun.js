// Stub hook for the automated/both lanes of a suite run. No CI system is
// wired up yet — this just records that a run asked for automation so the
// call site (and logs) show intent. Swap the body for a real trigger (queue
// a Playwright job, hit a CI webhook, etc.) once one exists; the signature
// is meant to stay stable across that swap.
function triggerAutomationRun(suiteId, runId) {
  console.log(`[automationRun] stub: would trigger automation for suite ${suiteId}, run ${runId}`);
}

module.exports = { triggerAutomationRun };
