export const API_TIMEOUT_MS = 120_000;

type FetchJsonOptions = {
  signal?: AbortSignal;
};

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  let response: Response;
  const timeoutSignal = AbortSignal.timeout(API_TIMEOUT_MS);
  const requestSignal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;

  try {
    response = await fetch(url, {
      signal: requestSignal
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new Error(`Request timed out after ${API_TIMEOUT_MS / 1000} seconds`);
    }

    throw error;
  }

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const errorBody = (await response.json()) as { error?: string };
      message = errorBody.error || message;
    } catch {
      // Ignore JSON parse errors and keep the HTTP status message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
