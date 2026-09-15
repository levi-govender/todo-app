import { isTransientUnavailable } from "./adapter.ts";

export async function retryOnce<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (!isTransientUnavailable(error)) throw error;
    return await work();
  }
}
