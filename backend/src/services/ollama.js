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
 * Quick liveness check (does not wait for the model).
 */
async function isAvailable() {
  try {
    const res = await fetch(`${config.ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Generate a text completion using Ollama.
 * Returns the response text or null on failure.
 *
 * `keep_alive: "30m"` keeps the model loaded across a long CPU batch.
 * `num_predict: 220` is enough for 2-3 sentences and is much faster than 512 on CPU.
 */
async function generate(prompt, { timeout = 120000, system } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const body = {
      model: config.ollamaModel,
      prompt,
      stream: false,
      keep_alive: '30m',
      options: {
        num_predict: 220,
        temperature: 0.2,
        num_ctx: 2048,
      },
    };
    if (system) body.system = system;

    const res = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

module.exports = { waitForModel, isAvailable, generate };
