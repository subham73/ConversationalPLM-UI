import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";

let sdk: NodeSDK | undefined;

// Export the processor so routes can force-flush in serverless/streaming flows
export let langfuseSpanProcessor: LangfuseSpanProcessor | undefined;

export async function register() {
  // Next.js calls register() per runtime; only initialize OTEL on Node
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    console.log("[OTEL] Skip (not node runtime):", process.env.NEXT_RUNTIME);
    return;
  }
  console.log("[OTEL] register() starting…");

  langfuseSpanProcessor = new LangfuseSpanProcessor();

  sdk = new NodeSDK({
    spanProcessors: [
      langfuseSpanProcessor,
      // TEMP: console exporter for verification (remove after you confirm)
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    ],
    // optional: add a Resource to set service.name, env, etc.
  });

  await sdk.start();
  console.log("[OTEL] started OK");
}

// Optional helper if you prefer a function instead of importing the processor directly
export async function flushLangfuse() {
  try {
    await langfuseSpanProcessor?.forceFlush();
    console.log("[OTEL] Langfuse forceFlush() done");
  } catch (e) {
    console.error("[OTEL] forceFlush() failed", e);
  }
}