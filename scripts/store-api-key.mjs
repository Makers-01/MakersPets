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

function maskSecret(secretValue) {
  const compact = String(secretValue).replace(/\s+/g, "");
  if (compact.length <= 10) {
    return `${compact.slice(0, 2)}...${compact.slice(-2)}`;
  }
  return `${compact.slice(0, 6)}...${compact.slice(-4)}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const providerSlug = args.provider ?? "deepseek";
  const label = args.label ?? "DeepSeek primary";
  const secretValue = args.key;
  const setDefault = args.default !== "false";

  if (!secretValue) {
    throw new Error("Missing required --key argument.");
  }

  const provider = await prisma.provider.findUnique({
    where: { slug: providerSlug }
  });

  if (!provider) {
    throw new Error(`Provider ${providerSlug} was not found.`);
  }

  const existing = await prisma.apiKey.findFirst({
    where: {
      providerId: provider.id,
      label
    }
  });

  const keyPreview = maskSecret(secretValue);

  await prisma.$transaction(async (tx) => {
    if (setDefault) {
      await tx.apiKey.updateMany({
        where: { providerId: provider.id },
        data: { isDefault: false }
      });
    }

    if (existing) {
      await tx.apiKey.update({
        where: { id: existing.id },
        data: {
          label,
          secretValue,
          keyPreview,
          isDefault: setDefault ? true : existing.isDefault,
          status: "ACTIVE"
        }
      });
      return;
    }

    await tx.apiKey.create({
      data: {
        providerId: provider.id,
        label,
        secretValue,
        keyPreview,
        isDefault: setDefault,
        status: "ACTIVE"
      }
    });
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: provider.slug,
        label,
        keyPreview,
        isDefault: setDefault
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
