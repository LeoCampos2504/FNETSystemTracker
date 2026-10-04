import { hash } from "bcryptjs";
import { existsSync } from "node:fs";

const nodeProcess = process as NodeJS.Process & { loadEnvFile?: (path?: string) => void };

async function main() {
  if (existsSync(".env.local")) nodeProcess.loadEnvFile?.(".env.local");
  const { getPrismaClient } = await import("../src/server/prisma");
  const prisma = getPrismaClient();
  try {
    const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
    const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administradora FNET";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      throw new Error("BOOTSTRAP_ADMIN_EMAIL_INVALID");
    }
    if (password.length < 15 || Buffer.byteLength(password, "utf8") > 72) {
      throw new Error("BOOTSTRAP_ADMIN_PASSWORD_MUST_BE_15_TO_72_BYTES");
    }
    if (!name || name.length > 120) throw new Error("BOOTSTRAP_ADMIN_NAME_INVALID");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(680250134139)`;
      if (await tx.app_users.count({ where: { role: "ADMIN" } })) throw new Error("ADMIN_ALREADY_BOOTSTRAPPED");
      if (await tx.app_users.findUnique({ where: { email } })) throw new Error("BOOTSTRAP_ADMIN_EMAIL_ALREADY_IN_USE");
      await tx.app_users.create({
        data: { email, name, passwordHash: await hash(password, 12), role: "ADMIN", active: true },
      });
    });
    console.log("Admin inicial creado. Ya podés retirar BOOTSTRAP_ADMIN_* del entorno.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : "BOOTSTRAP_FAILED";
  console.error(`No se creó el Admin inicial: ${code}`);
  process.exitCode = 1;
});
