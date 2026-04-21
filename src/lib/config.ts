import { z } from "zod";

function normalizeOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const envSchema = z.object({
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  APP_GATE_USERNAME: z.string().default("cash96"),
  APP_GATE_PASSWORD: z.string().default("change-me-now"),
  APP_GATE_SECRET: z.string().min(16).default("project-mapper-local-dev-secret"),
  MONGODB_URI: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO_A_TOKEN: z.string().optional(),
  GITHUB_REPO_B_TOKEN: z.string().optional(),
  GITHUB_REPO_A_URL: z
    .string()
    .url()
    .default("https://github.com/Revolution-Ed/RevolutionEd.git"),
  GITHUB_REPO_B_URL: z
    .string()
    .url()
    .default("https://github.com/Cash96/Revolution_ed_v2.git"),
  GCP_PROJECT_ID: z.string().default("projectmapper-493914"),
  CLOUD_RUN_SERVICE: z.string().default("project-mapper"),
  CLOUD_RUN_REGION: z.string().default("us-central1"),
});

const parsedEnv = envSchema.parse({
  APP_BASE_URL: process.env.APP_BASE_URL,
  APP_GATE_USERNAME: normalizeOptionalEnv(process.env.APP_GATE_USERNAME),
  APP_GATE_PASSWORD: normalizeOptionalEnv(process.env.APP_GATE_PASSWORD),
  APP_GATE_SECRET: normalizeOptionalEnv(process.env.APP_GATE_SECRET),
  MONGODB_URI: normalizeOptionalEnv(process.env.MONGODB_URI),
  GEMINI_API_KEY: normalizeOptionalEnv(process.env.GEMINI_API_KEY),
  GITHUB_TOKEN: normalizeOptionalEnv(process.env.GITHUB_TOKEN),
  GITHUB_REPO_A_TOKEN: normalizeOptionalEnv(process.env.GITHUB_REPO_A_TOKEN),
  GITHUB_REPO_B_TOKEN: normalizeOptionalEnv(process.env.GITHUB_REPO_B_TOKEN),
  GITHUB_REPO_A_URL: normalizeOptionalEnv(process.env.GITHUB_REPO_A_URL),
  GITHUB_REPO_B_URL: normalizeOptionalEnv(process.env.GITHUB_REPO_B_URL),
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID,
  CLOUD_RUN_SERVICE: process.env.CLOUD_RUN_SERVICE,
  CLOUD_RUN_REGION: process.env.CLOUD_RUN_REGION,
});

export const appConfig = {
  baseUrl: parsedEnv.APP_BASE_URL,
  auth: {
    username: parsedEnv.APP_GATE_USERNAME,
    password: parsedEnv.APP_GATE_PASSWORD,
    secret: parsedEnv.APP_GATE_SECRET,
    cookieName: "project_mapper_session",
    sessionDurationMs: 1000 * 60 * 60 * 12,
  },
  repositories: {
    repoA: parsedEnv.GITHUB_REPO_A_URL,
    repoB: parsedEnv.GITHUB_REPO_B_URL,
  },
  repositoryTokens: {
    default: parsedEnv.GITHUB_TOKEN,
    repoA: parsedEnv.GITHUB_REPO_A_TOKEN,
    repoB: parsedEnv.GITHUB_REPO_B_TOKEN,
  },
  deployment: {
    projectId: parsedEnv.GCP_PROJECT_ID,
    service: parsedEnv.CLOUD_RUN_SERVICE,
    region: parsedEnv.CLOUD_RUN_REGION,
  },
  integrations: {
    mongodbConfigured: Boolean(parsedEnv.MONGODB_URI),
    geminiConfigured: Boolean(parsedEnv.GEMINI_API_KEY),
    githubTokenConfigured: Boolean(
      parsedEnv.GITHUB_TOKEN || parsedEnv.GITHUB_REPO_A_TOKEN || parsedEnv.GITHUB_REPO_B_TOKEN,
    ),
  },
} as const;

export function getIntegrationHealth() {
  return {
    mongodb: appConfig.integrations.mongodbConfigured,
    gemini: appConfig.integrations.geminiConfigured,
    githubToken: appConfig.integrations.githubTokenConfigured,
  };
}