import Anthropic from "@anthropic-ai/sdk";

export const USE_MOCK_CLAUDE = process.env.USE_MOCK_CLAUDE === "true";

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!USE_MOCK_CLAUDE && !apiKey) {
  throw new Error("Missing ANTHROPIC_API_KEY env var (or set USE_MOCK_CLAUDE=true)");
}

export const anthropic = new Anthropic({ apiKey: apiKey || "mock" });

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
