import "@/lib/load-env";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("MakersPet"),
  MAKERPET_ADMIN_LABEL: z.string().default("MakersPet Console"),
  DATABASE_URL: z.string().optional()
});

export const env = envSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  MAKERPET_ADMIN_LABEL: process.env.MAKERPET_ADMIN_LABEL,
  DATABASE_URL: process.env.DATABASE_URL
});
