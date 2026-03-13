// Microsoft Graph API integration — OneDrive upload + Planner tasks
// Ref: Spec §7

import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

let cachedCCA: ConfidentialClientApplication | null = null;

function getCCA(): ConfidentialClientApplication | null {
  if (cachedCCA) return cachedCCA;

  const clientId = process.env.GRAPH_CLIENT_ID;
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!clientId || !tenantId || !clientSecret) {
    console.warn(
      "[GraphService] Missing GRAPH_* env vars — OneDrive/Planner disabled",
    );
    return null;
  }

  cachedCCA = new ConfidentialClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  });
  return cachedCCA;
}

async function getGraphClient(): Promise<Client | null> {
  const cca = getCCA();
  if (!cca) return null;

  const result = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result) return null;

  return Client.init({
    authProvider: (done) => done(null, result.accessToken),
  });
}

export async function uploadToOneDrive(
  fileName: string,
  content: Buffer,
): Promise<{ webUrl: string; driveItemId: string } | null> {
  try {
    const client = await getGraphClient();
    if (!client) return null;

    const driveId = process.env.GRAPH_DRIVE_ID;
    if (!driveId) {
      console.warn(
        "[GraphService] GRAPH_DRIVE_ID not set — OneDrive upload skipped",
      );
      return null;
    }

    const response = await client
      .api(`/drives/${driveId}/root:/BizRoom/${fileName}:/content`)
      .put(content);
    return { webUrl: response.webUrl, driveItemId: response.id };
  } catch (err) {
    console.error("[GraphService] OneDrive upload failed:", err);
    return null;
  }
}

export async function createPlannerTasks(
  planId: string,
  items: Array<{
    description: string;
    assignee: string;
    deadline?: string;
  }>,
): Promise<void> {
  try {
    const client = await getGraphClient();
    if (!client) return;

    const requests = items.slice(0, 20).map((item, i) => ({
      id: String(i),
      method: "POST",
      url: "/planner/tasks",
      body: {
        planId,
        title: item.description,
        dueDateTime: item.deadline,
      },
      headers: { "Content-Type": "application/json" },
    }));

    await client.api("/$batch").post({ requests });
  } catch (err) {
    console.error("[GraphService] Planner task creation failed:", err);
  }
}
