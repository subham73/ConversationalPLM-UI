import { gateway } from "@ai-sdk/gateway";
import { azure } from "@ai-sdk/azure";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

function mapToAzureDeployment(modelId: string) {
  const base = modelId.replace(THINKING_SUFFIX_REGEX, "");

  switch (base) {
    case "chat-model":
      return "gpt-4o-mini"; 
    case "chat-model-reasoning":
      return "YOUR_AZURE_CHAT_DEPLOYMENT"; //TODO
    default:
      return "gpt-4o-mini"; 
  }
}

export function getLanguageModel(modelId: string = "chat-model") {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // const isReasoningModel =
  //   modelId.includes("reasoning") || modelId.endsWith("-thinking");

  // if (isReasoningModel) {
  //   const gatewayModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

  //   return wrapLanguageModel({
  //     model: gateway.languageModel(gatewayModelId),
  //     middleware: extractReasoningMiddleware({ tagName: "thinking" }),
  //   });
  // }

  const deployment = mapToAzureDeployment(modelId); 
  const chatModel = azure(deployment)
  return chatModel;
}

export function getTitleModel() {
  // if (isTestEnvironment && myProvider) {
  //   return myProvider.languageModel("title-model");
  // }
  // return gateway.languageModel("google/gemini-2.5-flash-lite");
  return getLanguageModel("chat-model");
}

export function getArtifactModel() {
  // if (isTestEnvironment && myProvider) {
  //   return myProvider.languageModel("artifact-model");
  // }
  // return gateway.languageModel("anthropic/claude-haiku-4.5");
  return getLanguageModel("chat-model");
}
