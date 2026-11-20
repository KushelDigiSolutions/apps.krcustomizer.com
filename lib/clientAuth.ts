// lib/clientAuth.ts
import { getSessionToken } from "@shopify/app-bridge-utils";

/**
 * Client-side fetch helper that automatically retrieves a fresh Shopify session token
 * from App Bridge and attaches Authorization: Bearer <token> header to all API calls.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = "";

  if (typeof window !== "undefined") {
    const appInstance = (window as any).__APP_BRIDGE__;
    if (appInstance) {
      try {
        token = await getSessionToken(appInstance);
        (window as any).__SHOPIFY_SESSION_TOKEN__ = token;
      } catch (err) {
        console.warn("Could not get fresh session token from App Bridge, falling back to cached token:", err);
        token = (window as any).__SHOPIFY_SESSION_TOKEN__ || "";
      }
    } else {
      token = (window as any).__SHOPIFY_SESSION_TOKEN__ || "";
    }
  }

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
