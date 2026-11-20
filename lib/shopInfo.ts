// lib/shopInfo.ts
import { shopifyFetch } from "./shopifyFetch";

export async function ShopInfo(shop: string, accessToken: string) {
  try {
    const data = await shopifyFetch(shop, accessToken, "shop.json");
    return data?.shop || null;
  } catch (error) {
    console.error(`Failed to fetch shop info for ${shop}:`, error);
    throw error;
  }
}
