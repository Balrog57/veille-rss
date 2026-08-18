const pLimit = require('p-limit');
const { generate, isAvailable } = require('../services/ollama');

// Serial inference: Ollama on CPU typically serves one generate at a time.
// Concurrent calls just queue, then hit the per-request abort (that was the
// main cause of whole editions falling back to DESCRIPTION).
const CONCURRENCY = 1;
const ARTICLE_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 2;
const MAX_BATCH_MS = 90 * 60 * 1000;

const FRENCH_SYSTEM = `Tu es un rédacteur de veille technologique.
Tu réponds UNIQUEMENT en français (jamais en anglais).
Tu écris un résumé de 2 à 3 phrases, ton neutre et factuel.
Tu ne commences jamais par "L'article parle de", "Cet article", "This article" ou "The article".
Si la source est en anglais, tu traduis le fond en français.`;

const FR_MARKERS = /\b(le|la|les|un|une|des|du|de|et|est|dans|pour|que|qui|avec|sur|par|plus|pas|au|aux|ce|cette|ces|son|sa|ses|ont|été|être|sont|mais|comme|après|avant|selon|dont|aussi|très|entre|contre|sans|sous|vers|chez|où|lors|ainsi|grâce|déjà|encore|depuis|une|ont|aux|cette)\b/gi;
const EN_MARKERS = /\b(the|is|are|was|were|this|that|with|from|have|has|been|will|would|their|they|which|about|into|also|after|before|during|while|these|those|its|not|can|could|should|may|might)\b/gi;

function looksEnglish(text) {
  if (!text || text.length < 40) return false;
  const fr = (text.match(FR_MARKERS) || []).length;
  const en = (text.match(EN_MARKERS) || []).length;
  return en >= 4 && en > fr * 1.5;
}

function buildPrompt(title, description) {
  return `Résume OBLIGATOIREMENT EN FRANÇAIS (pas d'anglais) cet article en 2-3 phrases. Traduis si la source est anglaise.

Titre: ${title}
Description: ${description}

Résumé en français :`;
}

function buildRetryPrompt(title, description) {
  return `La réponse précédente n'était pas un résumé français acceptable. Réécris UNIQUEMENT EN FRANÇAIS, 2-3 phrases factuelles. Aucun mot anglais.

Titre: ${title}
Description: ${description}

Résumé en français :`;
}

/**
 * Generate a French summary for a single article using Ollama.
 * Retries once if empty, too short, or likely English.
 */
async function summarizeArticle(article) {
  const title = article.title || '';
  const description = (article.description || '').slice(0, 800);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const prompt = attempt === 0 ? buildPrompt(title, description) : buildRetryPrompt(title, description);
    const result = await generate(prompt, {
      timeout: ARTICLE_TIMEOUT_MS,
      system: FRENCH_SYSTEM,
    });
    const cleaned = (result || '').trim();

    if (cleaned && cleaned.length >= 40 && !looksEnglish(cleaned)) {
      return { summary: cleaned, fallback: false };
    }

    const reason = !cleaned ? 'empty' : looksEnglish(cleaned) ? 'english' : 'too short';
    console.warn(`[Summarize] Attempt ${attempt + 1}/${MAX_ATTEMPTS} rejected for "${title.slice(0, 60)}": ${reason}`);
  }

  return { summary: description.slice(0, 1000), fallback: true };
}

function batchBudgetMs(articleCount) {
  // One attempt + one retry, plus a small buffer for model load.
  const perArticle = ARTICLE_TIMEOUT_MS * MAX_ATTEMPTS;
  return Math.min(MAX_BATCH_MS, articleCount * perArticle + 3 * 60 * 1000);
}

/**
 * Summarize all articles with limited concurrency.
 * Completed summaries are kept even if the batch budget expires.
 */
async function summarizeAll(articles) {
  if (articles.length === 0) return [];

  const ollamaUp = await isAvailable();
  if (!ollamaUp) {
    console.error('[Summarize] Ollama unreachable, using fallbacks');
    return articles.map((a) => ({
      ...a,
      summary: (a.description || '').slice(0, 1000),
      summary_fallback: 1,
    }));
  }

  const budget = batchBudgetMs(articles.length);
  console.log(
    `[Summarize] Summarizing ${articles.length} articles (concurrency: ${CONCURRENCY}, timeout/article: ${ARTICLE_TIMEOUT_MS}ms, budget: ${Math.round(budget / 60000)} min)...`
  );

  const limit = pLimit(CONCURRENCY);
  const results = new Array(articles.length);
  let stopQueued = false;

  const work = Promise.all(
    articles.map((article, i) =>
      limit(async () => {
        if (stopQueued) {
          results[i] = { summary: (article.description || '').slice(0, 1000), fallback: true };
          return;
        }
        results[i] = await summarizeArticle(article);
      })
    )
  );

  let budgetTimer;
  const budgetExpired = new Promise((_, reject) => {
    budgetTimer = setTimeout(
      () => reject(new Error(`Global summarization budget (${Math.round(budget / 60000)} min)`)),
      budget
    );
  });

  try {
    await Promise.race([work, budgetExpired]);
  } catch (err) {
    stopQueued = true;
    console.error('[Summarize] Budget reached, keeping completed summaries:', err.message);
    await work;
  } finally {
    clearTimeout(budgetTimer);
  }

  const output = articles.map((article, i) => {
    const r = results[i];
    return {
      ...article,
      summary: r && r.summary ? r.summary : (article.description || '').slice(0, 1000),
      summary_fallback: r && r.fallback === false ? 0 : 1,
    };
  });

  const fallbackCount = output.filter((a) => a.summary_fallback).length;
  const okCount = output.length - fallbackCount;
  console.log(`[Summarize] Done: ${okCount} French summaries, ${fallbackCount}/${articles.length} fallback`);

  return output;
}

module.exports = { summarizeAll };
