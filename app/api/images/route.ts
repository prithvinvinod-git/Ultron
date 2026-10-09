import OpenAI from "openai";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getClient() {
  const provider = (process.env.IMAGE_PROVIDER ?? "xai").toLowerCase();
  const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.XAI_API_KEY;
  if (!apiKey) throw new Error(`Image provider ${provider} is not configured.`);
  return {
    provider,
    client: new OpenAI({
      apiKey,
      baseURL: provider === "xai" ? "https://api.x.ai/v1" : undefined,
    }),
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      prompt?: unknown;
      image?: unknown;
      size?: unknown;
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return jsonError(400, "A prompt is required.");
    if (prompt.length > 4000) return jsonError(400, "Prompt is too long.");

    const { provider, client } = getClient();
    const model = provider === "openai"
      ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1"
      : process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image";
    const image = typeof body.image === "string" ? body.image : undefined;

    const result = image
      ? await client.images.edit({
          model,
          image: await toFile(image, "source.png"),
          prompt,
          size: (body.size as "1024x1024" | "1536x1024" | "1024x1536") ?? "1024x1024",
        })
      : await client.images.generate({
          model,
          prompt,
          size: (body.size as "1024x1024" | "1536x1024" | "1024x1536") ?? "1024x1024",
        });

    const item = result.data?.[0];
    const url = item?.url ?? (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!url) throw new Error("The image provider returned no image.");
    return Response.json({ url, prompt, model, provider });
  } catch (error) {
    return jsonError(502, error instanceof Error ? error.message : "Image generation failed.");
  }
}

async function toFile(source: string, name: string): Promise<File> {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Unable to read the source image.");
  return new File([await response.arrayBuffer()], name, { type: "image/png" });
}

export async function GET() {
  return Response.json({ configured: Boolean(process.env.XAI_API_KEY || process.env.OPENAI_API_KEY) });
}

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export const preferredRegion = "auto";
export const fetchCache = "force-no-store";
export type ImageRouteResponse = { url: string; prompt: string; model: string; provider: string };
