// lib/shopifyFetch.ts
import { getCurrentShopifyVersion } from "./shopifyVersion";

export async function shopifyFetch(
  shop: string,
  accessToken: string,
  endpoint: string,
  method = "GET",
  body?: any,
  timeoutMs = 10000
) {
  const version = getCurrentShopifyVersion();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = `https://${shop}/admin/api/${version}/${cleanEndpoint}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    };

    const options: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      options.body = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Shopify REST HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
