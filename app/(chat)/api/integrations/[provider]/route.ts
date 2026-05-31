import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  getIntegrationConfigByUserIdAndProvider,
  type IntegrationProvider,
  upsertIntegrationConfig,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { encryptIntegrationCredentials } from "@/lib/integrations/crypto";

const providerSchema = z.enum(["3dx", "jira", "dummy"]);
const actionSchema = z.enum(["test", "save"]);

const requestSchema = z.object({
  instanceUrl: z.string().url(),
  username: z.string().optional(),
  password: z.string().optional(),
  patKey: z.string().optional(),
  securityContext: z.string().optional(),
});

function credentialsForProvider(
  provider: IntegrationProvider,
  payload: z.infer<typeof requestSchema>
) {
  if (provider === "3dx") {
    return {
      username: payload.username ?? "",
      password: payload.password ?? "",
    };
  }

  if (provider === "jira") {
    return {
      patKey: payload.patKey ?? "",
    };
  }

  return {};
}

async function callBrainIntegration({
  provider,
  action,
  userId,
  payload,
}: {
  provider: IntegrationProvider;
  action: "test" | "save";
  userId: string;
  payload: z.infer<typeof requestSchema>;
}) {
  const brainUrl = process.env.LANGGRAPH_BRAIN_URL ?? "http://localhost:8000";
  const endpoint = action === "test" ? "test_connection" : "save_config";

  const response = await fetch(
    `${brainUrl.replace(/\/$/, "")}/integrations/${provider}/${endpoint}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        instance_url: payload.instanceUrl,
        username: payload.username,
        password: payload.password,
        pat_key: payload.patKey,
        security_context: payload.securityContext,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      data: {
        message: data?.detail ?? data?.message ?? "Connection request failed.",
      },
    };
  }

  return { ok: true, data };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { provider: providerParam } = await params;
  const provider = providerSchema.safeParse(providerParam);
  const action = actionSchema.safeParse(
    new URL(request.url).searchParams.get("action")
  );

  if (!provider.success || !action.success) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const body = requestSchema.safeParse(await request.json());

  if (!body.success) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const brainResult = await callBrainIntegration({
    provider: provider.data,
    action: action.data,
    userId: session.user.id,
    payload: body.data,
  });

  if (!brainResult.ok) {
    await upsertIntegrationConfig({
      userId: session.user.id,
      provider: provider.data,
      instanceUrl: body.data.instanceUrl,
      encryptedCredentials:
        (
          await getIntegrationConfigByUserIdAndProvider({
            userId: session.user.id,
            provider: provider.data,
          })
        )?.encryptedCredentials ?? null,
      securityContext: body.data.securityContext ?? null,
      securityContexts: [],
      status: "disconnected",
      lastTestedAt: new Date(),
    });

    return Response.json(brainResult.data, { status: 400 });
  }

  const securityContexts = Array.isArray(brainResult.data?.security_contexts)
    ? brainResult.data.security_contexts
    : [];

  await upsertIntegrationConfig({
    userId: session.user.id,
    provider: provider.data,
    instanceUrl: body.data.instanceUrl,
    encryptedCredentials:
      action.data === "save"
        ? encryptIntegrationCredentials(
            credentialsForProvider(provider.data, body.data)
          )
        : ((
            await getIntegrationConfigByUserIdAndProvider({
              userId: session.user.id,
              provider: provider.data,
            })
          )?.encryptedCredentials ?? null),
    securityContext: body.data.securityContext ?? null,
    securityContexts,
    status: "connected",
    lastTestedAt: new Date(),
  });

  return Response.json({
    ...brainResult.data,
    status: "connected",
  });
}
