// lib/shopifyGraphQLFetch.ts
import { getCurrentShopifyVersion } from "./shopifyVersion";

export async function shopifyGraphQLFetch(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, any> = {},
  timeoutMs = 10000
) {
  const version = getCurrentShopifyVersion();
  const url = `https://${shop}/admin/api/${version}/graphql.json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        errors: [{ message: `Shopify GraphQL HTTP ${response.status}: ${errorText}` }],
      };
    }

    const json = await response.json();
    return json;
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { errors: [{ message: "Shopify GraphQL request timed out" }] };
    }
    return { errors: [{ message: error.message || "Shopify GraphQL request failed" }] };
  } finally {
    clearTimeout(timer);
  }
}
