import { CosmosClient, Database, Container, SqlParameter } from "@azure/cosmos";

let client: CosmosClient;
let db: Database;

export function getCosmosClient(): CosmosClient {
  if (!client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be set");
    }
    client = new CosmosClient({ endpoint, key });
    db = client.database(process.env.COSMOS_DATABASE || "bizroom-db");
  }
  return client;
}

export function getContainer(name: string): Container {
  getCosmosClient();
  return db.container(name);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createItem<T>(container: string, item: T): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { resource } = await getContainer(container).items.create(item as any);
  return resource as unknown as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertItem<T>(container: string, item: T): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { resource } = await getContainer(container).items.upsert(item as any);
  return resource as unknown as T;
}

export async function readItem<T>(
  container: string,
  id: string,
  partitionKey: string,
): Promise<T | undefined> {
  try {
    const { resource } = await getContainer(container)
      .item(id, partitionKey)
      .read();
    return (resource as unknown as T) ?? undefined;
  } catch (e: unknown) {
    if ((e as { code?: number }).code === 404) return undefined;
    throw e;
  }
}

export async function queryItems<T>(
  container: string,
  query: string,
  parameters: SqlParameter[],
): Promise<T[]> {
  const { resources } = await getContainer(container)
    .items.query<T>({ query, parameters })
    .fetchAll();
  return resources;
}

export async function deleteItem(
  container: string,
  id: string,
  partitionKey: string,
): Promise<void> {
  await getContainer(container).item(id, partitionKey).delete();
}
