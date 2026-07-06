const config = require('../config');

/**
 * Check if the configured model exists in Ollama.
 * Polls /api/tags until found or timeout.
 */
async function waitForModel(timeoutMs = 300000) {
  const start = Date.now();
  const modelName = config.ollamaModel;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${config.ollamaUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        if (models.some((m) => m.name === modelName || m.name.startsWith(modelName + ':'))) {
          console.log(`Ollama model "${modelName}" is available.`);
          return true;
        }
      }
    } catch {
      // Ollama not ready yet
    }
    console.log(`Waiting for Ollama model "${modelName}"...`);
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.error(`Timeout waiting for Ollama model "${modelName}" after ${timeoutMs}ms`);
  return false;
}

/**
 * Generate a text completion using Ollama.
 * Returns the response text or null on failure.
 */
async function generate(prompt, { timeout = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollamaModel,
        prompt: prompt,
        stream: false,
        keep_alive: '10m',
        options: {
          num_predict: 512,
          temperature: 0.3,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`Ollama generate returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.response || null;
  } catch (err) {
    console.error('Ollama generate error:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { waitForModel, generate };
