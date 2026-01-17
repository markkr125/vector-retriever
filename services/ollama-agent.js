/**
 * Ollama Agent Helper
 *
 * Centralizes:
 * - AbortSignal cancellation (Stop upload)
 * - Ollama /api/chat request construction
 * - Streaming JSONL collection (message.content)
 */

function isAbortError(error) {
  return (
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    error?.code === 'ECONNABORTED' && error?.message?.toLowerCase?.().includes('canceled') ||
    error?.message?.toLowerCase?.().includes('canceled') ||
    error?.message?.toLowerCase?.().includes('aborted')
  );
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

function getChatUrl(ollamaUrl) {
  if (!ollamaUrl) return ollamaUrl;
  return ollamaUrl.includes('/api/chat') ? ollamaUrl : ollamaUrl.replace('/api/embed', '/api/chat');
}

async function collectOllamaJsonlStream({ stream, signal, maxStreamTimeMs, shouldStop }) {
  let text = '';
  const start = Date.now();

  const onAbort = () => {
    try {
      stream?.destroy?.();
    } catch {
      // ignore
    }
  };

  signal?.addEventListener?.('abort', onAbort, { once: true });

  try {
    // stream is an async iterable in node (Readable)
    for await (const chunk of stream) {
      if (signal?.aborted) break;
      if (maxStreamTimeMs && Date.now() - start > maxStreamTimeMs) {
        try {
          stream?.destroy?.();
        } catch {
          // ignore
        }
        break;
      }

      const lines = chunk
        .toString()
        .split('\n')
        .filter(line => line.trim());

      for (const line of lines) {
        if (signal?.aborted) break;

        try {
          const json = JSON.parse(line);
          if (json?.message?.content) {
            text += json.message.content;

            if (shouldStop?.(text) === true) {
              try {
                stream?.destroy?.();
              } catch {
                // ignore
              }
              return text;
            }
          }
          if (json?.done === true) {
            return text;
          }
        } catch {
          // Ignore malformed JSON fragments; Ollama streams JSONL but chunk boundaries can vary.
        }
      }
    }

    return text;
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/**
 * Runs an Ollama /api/chat request.
 *
 * @param {object} params
 * @param {any} params.axios - axios instance
 * @param {string} params.ollamaUrl - usually /api/embed or /api/chat; will be normalized to /api/chat
 * @param {string} [params.authToken]
 * @param {object} params.body - request body for /api/chat
 * @param {number} [params.timeoutMs]
 * @param {AbortSignal} [params.signal]
 * @param {number} [params.maxStreamTimeMs] - only for streaming
 * @returns {Promise<{ text: string, raw: any }>} - text is message content (or accumulated stream content)
 */
async function runOllamaChat({ axios, ollamaUrl, authToken, body, timeoutMs, signal, maxStreamTimeMs, shouldStop }) {
  throwIfAborted(signal);

  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const url = getChatUrl(ollamaUrl);
  const isStreaming = body?.stream === true;

  const response = await axios.post(url, body, {
    headers,
    timeout: timeoutMs,
    responseType: isStreaming ? 'stream' : 'json',
    signal
  });

  if (!isStreaming) {
    const text = response?.data?.message?.content?.trim?.() ?? '';
    return { text, raw: response.data };
  }

  const text = await collectOllamaJsonlStream({
    stream: response.data,
    signal,
    maxStreamTimeMs,
    shouldStop
  });

  return { text: text.trim(), raw: null };
}

module.exports = {
  runOllamaChat,
  isAbortError,
  throwIfAborted
};
