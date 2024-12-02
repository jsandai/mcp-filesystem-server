// Schema definitions
const ReadFileArgsSchema = z.object({
  path: z.string(),
});

const ReadMultipleFilesArgsSchema = z.object({
  paths: z.array(z.string()),
});

const WriteFileArgsSchema = z.object({
  path: z.string(),
  content: z.string(),
});

const CreateDirectoryArgsSchema = z.object({
  path: z.string(),
});

const ListDirectoryArgsSchema = z.object({
  path: z.string(),
});

const MoveFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const SearchFilesArgsSchema = z.object({
  path: z.string(),
  pattern: z.string(),
});

const GetFileInfoArgsSchema = z.object({
  path: z.string(),
});

const CopyFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const BackupFileArgsSchema = z.object({
  source: z.string(),
  destinationDir: z.string(),
});

const DeleteFileArgsSchema = z.object({
  path: z.string(),
});

const RestoreFileArgsSchema = z.object({
  path: z.string(),
});

const EmptyTrashArgsSchema = z.object({
  confirm: z.boolean().optional(),
});

const ZipDirectoryArgsSchema = z.object({
  path: z.string(),
  destination: z.string(),
});

const UnzipFileArgsSchema = z.object({
  source: z.string(),
  destination: z.string(),
});

const ListTrashArgsSchema = z.object({});

const RestoreFromBackupArgsSchema = z.object({
  backupPath: z.string(),
  destination: z.string(),
});

// Utility functions
interface FileInfo {
  size: number;
  created: Date;
  modified: Date;
  accessed: Date;
  isDirectory: boolean;
  isFile: boolean;
  permissions: string;
}

async function getFileStats(filePath: string): Promise<FileInfo> {
  const stats = await fs.stat(filePath);
  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime,
    accessed: stats.atime,
    isDirectory: stats.isDirectory(),
    isFile: stats.isFile(),
    permissions: stats.mode.toString(8).slice(-3),
  };
}

async function searchFiles(rootPath: string, pattern: string): Promise<string[]> {
  const results: string[] = [];

  async function search(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      
      try {
        await validatePath(fullPath);
        if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
          results.push(fullPath);
        }
        if (entry.isDirectory()) {
          await search(fullPath);
        }
      } catch (error) {
        continue;
      }
    }
  }

  await search(rootPath);
  return results;
}

// Advanced utility functions
async function backupFile(args: { source: string; destinationDir: string }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = path.basename(args.source);
  const backupPath = path.join(
    args.destinationDir,
    `${filename}.${timestamp}.backup`
  );
  await fs.copyFile(args.source, backupPath);
  return backupPath;
}

async function moveToTrash(filePath: string): Promise<string> {
  const filename = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const trashPath = path.join(trashDir, `${filename}.${timestamp}`);
  await fs.rename(filePath, trashPath);
  return trashPath;
}
