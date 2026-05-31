import { auth } from "@/app/(auth)/auth";
import { getIntegrationConfigsByUserId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const PROVIDERS = ["3dx", "jira", "dummy"] as const;

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const rows = await getIntegrationConfigsByUserId({
    userId: session.user.id,
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return Response.json({
    integrations: PROVIDERS.map((provider) => {
      const row = byProvider.get(provider);

      return {
        provider,
        instanceUrl: row?.instanceUrl ?? "",
        status: row?.status ?? "disconnected",
        securityContext: row?.securityContext ?? "",
        securityContexts: row?.securityContexts ?? [],
        lastTestedAt: row?.lastTestedAt?.toISOString() ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    }),
  });
}
