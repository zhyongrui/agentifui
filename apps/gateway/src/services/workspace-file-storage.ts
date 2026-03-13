import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';

export type WorkspaceFileStorageSaveInput = {
  tenantId: string;
  userId: string;
  fileId: string;
  fileName: string;
  bytes: Buffer;
};

export type WorkspaceFileStorageSaveResult = {
  provider: 'local';
  storageKey: string;
};

export type WorkspaceFileStorage = {
  saveFile(input: WorkspaceFileStorageSaveInput): Promise<WorkspaceFileStorageSaveResult>;
};

function sanitizeExtension(fileName: string) {
  const extension = extname(fileName).toLowerCase();

  return /^[a-z0-9.]{1,16}$/.test(extension) ? extension : '';
}

export function createLocalWorkspaceFileStorage(input: {
  rootDir: string;
}): WorkspaceFileStorage {
  return {
    async saveFile(file) {
      const extension = sanitizeExtension(file.fileName);
      const relativeDirectory = posix.join(file.tenantId, file.userId);
      const relativePath = posix.join(relativeDirectory, `${file.fileId}${extension}`);
      const absoluteDirectory = join(input.rootDir, file.tenantId, file.userId);
      const absolutePath = join(input.rootDir, relativePath);

      await mkdir(absoluteDirectory, {
        recursive: true,
      });
      await writeFile(absolutePath, file.bytes);

      return {
        provider: 'local',
        storageKey: relativePath,
      };
    },
  };
}
