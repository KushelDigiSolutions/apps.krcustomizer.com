// lib/product/searchProducts.ts
import { shopifyGraphQLFetch } from "../shopifyGraphQLFetch";

export async function searchProducts(
  shop: string,
  accessToken: string,
  searchTerm = "",
  first = 20
) {
  const queryFilter = searchTerm ? `title:*${searchTerm}*` : "";

  const query = `
    query SearchProducts($first: Int!, $query: String) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            featuredImage {
              url
              altText
            }
            images(first: 1) {
              edges {
                node {
                  url
                }
              }
            }
            metafield(namespace: "custom", key: "krcConfig") {
              id
              value
            }
          }
        }
      }
    }
  `;

  try {
    const result = await shopifyGraphQLFetch(shop, accessToken, query, {
      first,
      query: queryFilter || undefined,
    });

    if (result.errors) {
      return { error: result.errors[0]?.message || "Failed to search products" };
    }

    const products =
      result?.data?.products?.edges?.map((edge: any) => {
        const node = edge.node;
        const imageUrl = node.featuredImage?.url || node.images?.edges?.[0]?.node?.url || "";
        return {
          id: node.id,
          name: node.title,
          title: node.title,
          handle: node.handle,
          images: { url: imageUrl },
          defaultImage: imageUrl,
          krcConfig: node.metafield,
        };
      }) || [];

    return products;
  } catch (error: any) {
    console.error("searchProducts error:", error);
    return { error: error.message || "Failed to search products" };
  }
}
