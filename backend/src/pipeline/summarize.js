const pLimit = require('p-limit');
const { generate } = require('../services/ollama');

const CONCURRENCY = 3;
const limit = pLimit(CONCURRENCY);

/**
 * Generate a French summary for a single article using Ollama.
 * Returns { summary, fallback } or { summary: null, fallback: true } on failure.
 */
async function summarizeArticle(article) {
  const title = article.title || '';
  const description = (article.description || '').slice(0, 1500);

  const prompt = `Tu es un rédacteur de veille IA. Résume cet article en français en 2-3 phrases, ton neutre, factuel. Ne commence pas par "L'article parle de..." ou "Cet article...".

Titre: ${title}
Description: ${description}`;

  const result = await generate(prompt, { timeout: 60000 });

  if (result) {
    return { summary: result.trim(), fallback: false };
  }

  // Fallback: return original description with fallback flag
  return { summary: description.slice(0, 1000), fallback: true };
}

/**
 * Summarize all articles with limited concurrency.
 * Returns articles with summary and summary_fallback fields added.
 * Has a global timeout so the pipeline never blocks forever if Ollama dies.
 */
async function summarizeAll(articles) {
  if (articles.length === 0) return [];

  console.log(`[Summarize] Summarizing ${articles.length} articles (concurrency: ${CONCURRENCY})...`);

  const tasks = articles.map((article) =>
    limit(() => summarizeArticle(article))
  );

  // Global timeout: if summarization takes more than 5 minutes, abort and
  // use fallbacks. This prevents the pipeline from blocking forever if
  // Ollama becomes unresponsive.
  const GLOBAL_TIMEOUT_MS = 5 * 60 * 1000;
  let results;
  try {
    results = await Promise.race([
      Promise.all(tasks),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Global summarization timeout (5 min)')), GLOBAL_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    console.error('[Summarize] Global timeout or error, using fallbacks:', err.message);
    // Use fallbacks for all articles
    results = articles.map(() => ({ summary: null, fallback: true }));
  }

  const output = articles.map((article, i) => ({
    ...article,
    summary: results[i] ? results[i].summary : (article.description || '').slice(0, 1000),
    summary_fallback: results[i] && results[i].fallback ? 1 : 0,
  }));

  const fallbackCount = output.filter((a) => a.summary_fallback).length;
  if (fallbackCount > 0) {
    console.log(`[Summarize] ${fallbackCount}/${articles.length} used fallback (Ollama unavailable)`);
  }

  return output;
}

module.exports = { summarizeAll };
