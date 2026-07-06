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
 */
async function summarizeAll(articles) {
  if (articles.length === 0) return [];

  console.log(`[Summarize] Summarizing ${articles.length} articles (concurrency: ${CONCURRENCY})...`);

  const tasks = articles.map((article) =>
    limit(() => summarizeArticle(article))
  );

  const results = await Promise.all(tasks);

  const output = articles.map((article, i) => ({
    ...article,
    summary: results[i].summary,
    summary_fallback: results[i].fallback ? 1 : 0,
  }));

  const fallbackCount = results.filter((r) => r.fallback).length;
  if (fallbackCount > 0) {
    console.log(`[Summarize] ${fallbackCount}/${articles.length} used fallback (Ollama unavailable)`);
  }

  return output;
}

module.exports = { summarizeAll };
