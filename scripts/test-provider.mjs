import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const providerSlug = args.provider ?? "deepseek";
  const prompt = args.prompt ?? "Reply with exactly: MAKERSPET_OK";

  const provider = await prisma.provider.findUnique({
    where: { slug: providerSlug },
    include: {
      apiKeys: {
        where: { status: "ACTIVE" },
        orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
      },
      models: {
        where: { enabled: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!provider) {
    throw new Error(`Provider ${providerSlug} was not found.`);
  }

  const apiKey = provider.apiKeys[0];
  const model = provider.models[0];

  if (!apiKey) {
    throw new Error(`Provider ${providerSlug} does not have an active API key.`);
  }

  if (!model) {
    throw new Error(`Provider ${providerSlug} does not have an enabled model.`);
  }

  const baseUrl = provider.apiBaseUrl ?? "https://api.deepseek.com";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.secretValue}`
    },
    body: JSON.stringify({
      model: model.apiModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      max_tokens: 32,
      thinking: { type: "disabled" }
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Provider test failed with ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`
    );
  }

  const content = payload?.choices?.[0]?.message?.content ?? "";

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: provider.slug,
        model: model.apiModel,
        reply: content,
        usage: payload?.usage ?? null
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
