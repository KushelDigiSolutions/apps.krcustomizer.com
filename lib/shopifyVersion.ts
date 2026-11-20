// lib/shopifyVersion.ts
export function getCurrentShopifyVersion(): string {
  return process.env.SHOPIFY_API_VERSION || "2025-01";
}
