// provider.ts
import { customProvider } from "ai";
import { isTestEnvironment } from "../constants";
import { fastapiGateway } from "./fastapi-provider";
import { titleModel as titleModelConfig } from "./models";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel, artifactModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

// ---------- Shared helper ----------
function resolve(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }
  return fastapiGateway.languageModel(modelId);
}

// ---------- Export ALL required models ----------
export function getLanguageModel(modelId: string) {
  return resolve(modelId);
}

export function getTitleModel() {
  return resolve(titleModelConfig.id);
}

export function getArtifactModel() {
  return resolve("artifact-model");
}

export function getChatModel() {
  return resolve("chat-model");
}
