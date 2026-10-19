export const MAX_RETRIES = 3;

export async function sendWithRetry(send: () => Promise<Response>) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await send();
      if (response.status < 500 || attempt === MAX_RETRIES) return response;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
    }
  }
  throw new Error("unreachable");
}
