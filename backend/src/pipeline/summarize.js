const pLimit = require('p-limit');
const { generate, isAvailable } = require('../services/ollama');

// Serial inference: Ollama on CPU typically serves one generate at a time.
// Concurrent calls just queue, then hit the per-request abort (that was the
// main cause of whole editions falling back to DESCRIPTION).
const CONCURRENCY = 1;
const ARTICLE_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 3;
const MAX_BATCH_MS = 90 * 60 * 1000;

const FRENCH_SYSTEM = `Tu es un journaliste tech. Tu écris une brève factuelle en français.
Règles strictes:
- 2 ou 3 phrases, faits seulement (qui, quoi, chiffres)
- commence DIRECTEMENT par un fait, jamais par un commentaire
- interdit: parler de traduction, de résumé, de l'article, de ta tâche
- interdit: "Ce résumé est déjà", "Voici", "Bien sûr", "Je peux reformuler", "pas nécessaire de traduire"
- si le texte source est déjà en français, résume-le quand même (ne dis pas qu'il est déjà en français)`;

const FR_MARKERS = /\b(le|la|les|un|une|des|du|de|et|est|dans|pour|que|qui|avec|sur|par|plus|pas|au|aux|ce|cette|ces|son|sa|ses|ont|été|être|sont|mais|comme|après|avant|selon|dont|aussi|très|entre|contre|sans|sous|vers|chez|où|lors|ainsi|grâce|déjà|encore|depuis|une|ont|aux|cette)\b/gi;
const EN_MARKERS = /\b(the|is|are|was|were|this|that|with|from|have|has|been|will|would|their|they|which|about|into|also|after|before|during|while|these|those|its|not|can|could|should|may|might)\b/gi;

function looksEnglish(text) {
  if (!text || text.length < 40) return false;
  const fr = (text.match(FR_MARKERS) || []).length;
  const en = (text.match(EN_MARKERS) || []).length;
  return en >= 4 && en > fr * 1.5;
}

function looksLikeMetaSummary(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return (
    /ce r[eé]sum[eé] est d[eé]j[aà]/.test(t) ||
    /n['']est pas n[eé]cessaire de/.test(t) ||
    /pas (besoin|n[eé]cessaire) de traduire/.test(t) ||
    /je peux reformuler/.test(t) ||
    /je (peux|vais|dois) (le )?(traduire|r[eé]sumer|reformuler)/.test(t) ||
    /voici (le |un )?(r[eé]sum[eé]|la br[eè]ve)/.test(t) ||
    /en tant qu[''](assistant|ia|r[eé]dacteur)/.test(t) ||
    /d[eé]j[aà] (écrit|fourni|en fran[cç]ais)/.test(t) ||
    /fourni dans l['']article/.test(t)
  );
}

function extractNewsBody(text) {
  let t = (text || '').trim().replace(/^["«]+|["»]+$/g, '').trim();
  const colon = t.search(/:\s+/);
  if (colon > 0 && colon < 220) {
    const head = t.slice(0, colon);
    const rest = t.slice(colon + 1).trim();
    if (looksLikeMetaSummary(head) && rest.length >= 40 && !looksLikeMetaSummary(rest)) {
      return rest;
    }
  }
  return t;
}

function isUsableSummary(text) {
  const cleaned = extractNewsBody(text);
  if (!cleaned || cleaned.length < 40) return null;
  if (looksEnglish(cleaned) || looksLikeMetaSummary(cleaned)) return null;
  return cleaned;
}

function buildPrompt(title, description) {
  return `Écris une brève d'actualité en français (2-3 phrases). Pas de préface. Pas de commentaire sur la langue.

Titre: ${title}
Contenu: ${description}`;
}

function buildRetryPrompt(title, description) {
  return `N'écris PAS "ce résumé est déjà..." ni "je peux reformuler". Seulement 2-3 phrases de faits en français, dès le premier mot.

Titre: ${title}
Contenu: ${description}`;
}

/**
 * Generate a French summary for a single article using Ollama.
 * Retries if empty, too short, English, or meta-commentary ("ce résumé est déjà...").
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
    const usable = isUsableSummary(result);

    if (usable) {
      return { summary: usable, fallback: false };
    }

    const cleaned = (result || '').trim();
    const reason = !cleaned
      ? 'empty'
      : looksLikeMetaSummary(cleaned)
        ? 'meta-commentary'
        : looksEnglish(cleaned)
          ? 'english'
          : 'too short';
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

module.exports = { summarizeAll, looksLikeMetaSummary };
