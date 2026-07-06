const { getDb } = require('../db');
const { generate } = require('../services/ollama');

const COSINE_THRESHOLD = 0.55;
const TIEBREAKER_CLUSTER_MIN = 4;
const TIEBREAKER_COSINE_WINDOW = 0.1;

/**
 * Compute TF-IDF vector for a text using char n-grams (3-5 grams).
 * Returns a Map<string, number> of n-gram -> tf-idf weight.
 */
function computeVector(text) {
  const grams = new Map();
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Char n-grams of lengths 3, 4, 5
  for (let n = 3; n <= 5; n++) {
    for (let i = 0; i <= normalized.length - n; i++) {
      const gram = normalized.slice(i, i + n);
      grams.set(gram, (grams.get(gram) || 0) + 1);
    }
  }

  // Simple TF normalization: divide by max frequency
  let maxFreq = 0;
  for (const freq of grams.values()) {
    if (freq > maxFreq) maxFreq = freq;
  }
  if (maxFreq > 0) {
    for (const [gram, freq] of grams) {
      grams.set(gram, freq / maxFreq);
    }
  }

  return grams;
}

/**
 * Compute cosine similarity between two TF-IDF vectors.
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [gram, weight] of vecA) {
    normA += weight * weight;
    const bWeight = vecB.get(gram) || 0;
    dotProduct += weight * bWeight;
  }
  for (const weight of vecB.values()) {
    normB += weight * weight;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find duplicate clusters using TF-IDF + union-find.
 * Returns array of clusters, each cluster is an array of article indexes.
 */
function findClusters(articles) {
  const n = articles.length;
  if (n === 0) return [];

  // Pre-compute vectors
  const vectors = articles.map((a) => {
    const text = `${a.title} ${a.description.slice(0, 200)}`;
    return computeVector(text);
  });

  // Union-Find
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    parent[find(a)] = find(b);
  }

  // Build pairs with similarity above threshold
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      if (sim >= COSINE_THRESHOLD) {
        pairs.push({ i, j, sim });
      }
    }
  }

  // Sort by similarity descending so stronger pairs merge first
  pairs.sort((a, b) => b.sim - a.sim);

  for (const { i, j } of pairs) {
    union(i, j);
  }

  // Group by parent
  const clusters = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  return Array.from(clusters.values());
}

/**
 * Select the best article from a cluster.
 * Uses Ollama tie-breaker only for clusters >= 4 with all articles within cosine window.
 * Otherwise keeps the most recent article by pubDate (fallback: longest description).
 */
async function selectBestFromCluster(cluster, articles) {
  if (cluster.length === 1) return cluster[0];

  // Default: keep most recent by pubDate
  // Algorithm: O(n) linear scan — start with cluster[0] as the best,
  // then update whenever a newer pubDate is found. On exact date tie,
  // prefer the article with the longer description (heuristic for more content).
  let best = cluster[0];
  for (const idx of cluster) {
    if (new Date(articles[idx].pubDate) > new Date(articles[best].pubDate)) {
      best = idx;
    } else if (new Date(articles[idx].pubDate).getTime() === new Date(articles[best].pubDate).getTime()) {
      // Tie-break: longer description wins
      if ((articles[idx].description || '').length > (articles[best].description || '').length) {
        best = idx;
      }
    }
  }

  // Ollama tie-breaker for complex ambiguous clusters
  if (cluster.length >= TIEBREAKER_CLUSTER_MIN) {
    try {
      // Compute pairwise cosine within cluster to check if all within 0.1
      const vectors = cluster.map((idx) => {
        const a = articles[idx];
        const text = `${a.title} ${a.description.slice(0, 200)}`;
        return computeVector(text);
      });

      let allWithinWindow = true;
      for (let i = 0; i < vectors.length && allWithinWindow; i++) {
        for (let j = i + 1; j < vectors.length && allWithinWindow; j++) {
          const sim = cosineSimilarity(vectors[i], vectors[j]);
          if (Math.abs(sim - 1.0) > TIEBREAKER_COSINE_WINDOW && sim < 1) {
            allWithinWindow = false;
          }
        }
      }

      if (allWithinWindow) {
        // Call Ollama to pick the best article
        const items = cluster.map((idx) => articles[idx]);
        const prompt = `Tu es un assistant qui sélectionne le meilleur article parmi un groupe d'articles quasi-identiques. Choisis celui qui est le plus complet, le mieux écrit, et le plus pertinent. Réponds UNIQUEMENT par le numéro de l'article (1, 2, 3...).\n\n${items.map((a, i) => `${i + 1}. Titre: ${a.title}\n   Description: ${a.description.slice(0, 300)}`).join('\n\n')}`;

        const result = await generate(prompt, { timeout: 30000 });
        if (result) {
          const match = result.trim().match(/^\d+/);
          if (match) {
            const chosen = parseInt(match[0], 10) - 1;
            if (chosen >= 0 && chosen < cluster.length) {
              best = cluster[chosen];
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Dedup] Ollama tie-breaker failed, using default selection:', err.message);
    }
  }

  return best;
}

/**
 * Run dedup pipeline.
 * Filters out already-seen articles, then clusters by TF-IDF similarity.
 * Returns the kept articles (one per cluster).
 */
async function dedupArticles(rawArticles) {
  const db = getDb();

  // 1. Filter out already-seen URLs
  const seenHashes = new Set();
  const existing = db.prepare('SELECT DISTINCT url_hash FROM articles').all();
  for (const row of existing) {
    seenHashes.add(row.url_hash);
  }

  const newArticles = rawArticles.filter((a) => !seenHashes.has(a.url_hash));
  console.log(`[Dedup] ${rawArticles.length} raw -> ${newArticles.length} new (${rawArticles.length - newArticles.length} already seen)`);

  if (newArticles.length === 0) return [];

  // 2. Cluster by TF-IDF similarity
  const clusters = findClusters(newArticles);
  console.log(`[Dedup] Found ${clusters.length} clusters from ${newArticles.length} articles`);

  // 3. Select best from each cluster
  const kept = [];
  for (const cluster of clusters) {
    const bestIdx = await selectBestFromCluster(cluster, newArticles);
    kept.push(newArticles[bestIdx]);
  }

  console.log(`[Dedup] Kept ${kept.length} articles after dedup`);
  return kept;
}

module.exports = { dedupArticles, computeVector, cosineSimilarity, findClusters };
