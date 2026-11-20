// lib/product/searchProductsById.ts
import { shopifyGraphQLFetch } from "../shopifyGraphQLFetch";

export async function searchProductsById(
  shop: string,
  accessToken: string,
  productId: string
) {
  const query = `
    query GetProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        featuredImage {
          url
        }
        metafield(namespace: "custom", key: "krcConfig") {
          id
          value
        }
      }
    }
  `;

  try {
    const result = await shopifyGraphQLFetch(shop, accessToken, query, { id: productId });
    return result?.data?.product || null;
  } catch (error) {
    console.error("searchProductsById error:", error);
    return null;
  }
}
