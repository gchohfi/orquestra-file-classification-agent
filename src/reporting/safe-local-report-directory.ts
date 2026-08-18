import { chmod, lstat, mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, parse, relative, resolve, sep } from "node:path";

type ErrorFactory = () => Error;

/**
 * Prepara um diretório privado sem seguir symlinks introduzidos abaixo de uma
 * raiz local confiável. A cadeia é conferida antes e depois do mkdir para que
 * um componente intermediário não redirecione relatórios identificados.
 */
export async function prepareSafeLocalReportDirectory(
  directory: string,
  unsafeDirectoryError: ErrorFactory,
): Promise<void> {
  const absoluteDirectory = resolve(directory);
  const trustedRoot = trustedRootFor(absoluteDirectory);
  await assertExistingDirectoryChain(trustedRoot, absoluteDirectory, unsafeDirectoryError);
  await mkdir(absoluteDirectory, { recursive: true, mode: 0o700 });
  await assertCompleteDirectoryChain(trustedRoot, absoluteDirectory, unsafeDirectoryError);
  await chmod(absoluteDirectory, 0o700);
}

async function assertExistingDirectoryChain(
  trustedRoot: string,
  directory: string,
  unsafeDirectoryError: ErrorFactory,
): Promise<void> {
  let current = trustedRoot;
  for (const component of relativeComponents(trustedRoot, directory)) {
    current = resolve(current, component);
    const stat = await lstat(current).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    });
    if (stat === null) return;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafeDirectoryError();
  }
}

async function assertCompleteDirectoryChain(
  trustedRoot: string,
  directory: string,
  unsafeDirectoryError: ErrorFactory,
): Promise<void> {
  let current = trustedRoot;
  for (const component of relativeComponents(trustedRoot, directory)) {
    current = resolve(current, component);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw unsafeDirectoryError();
  }
}

function trustedRootFor(directory: string): string {
  const candidates = [resolve("."), resolve(tmpdir()), resolve(homedir())]
    .filter((candidate, index, values) => values.indexOf(candidate) === index)
    .filter((candidate) => isWithin(candidate, directory))
    .sort((left, right) => right.length - left.length);
  return candidates[0] ?? parse(directory).root;
}

function relativeComponents(root: string, directory: string): string[] {
  const relativePath = relative(root, directory);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error("REPORT_DIRECTORY_OUTSIDE_TRUSTED_ROOT");
  }
  return relativePath.split(sep).filter(Boolean);
}

function isWithin(root: string, target: string): boolean {
  const relativePath = relative(root, target);
  return (
    relativePath === "" ||
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
