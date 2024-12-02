#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import path from "path";
import os from 'os';
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import AdmZip from "adm-zip";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: mcp-server-filesystem <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Normalize all paths consistently
function normalizePath(p: string): string {
  return path.normalize(p).toLowerCase();
}

function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

// Store allowed directories in normalized form
const allowedDirectories = args.map(dir => 
  normalizePath(path.resolve(expandHome(dir)))
);

// Validate that all directories exist and are accessible
await Promise.all(args.map(async (dir) => {
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Create trash directory within the first allowed directory
const trashDir = path.join(allowedDirectories[0], ".trash");
await fs.mkdir(trashDir, { recursive: true });

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const expandedPath = expandHome(requestedPath);
  const absolute = path.isAbsolute(expandedPath)
    ? path.resolve(expandedPath)
    : path.resolve(process.cwd(), expandedPath);
    
  const normalizedRequested = normalizePath(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalizedRequested.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute} not in ${allowedDirectories.join(', ')}`);
  }

  // Handle symlinks by checking their real path
  try {
    const realPath = await fs.realpath(absolute);
    const normalizedReal = normalizePath(realPath);
    const isRealPathAllowed = allowedDirectories.some(dir => normalizedReal.startsWith(dir));
    if (!isRealPathAllowed) {
      throw new Error("Access denied - symlink target outside allowed directories");
    }
    return realPath;
  } catch (error) {
    // For new files that don't exist yet, verify parent directory
    const parentDir = path.dirname(absolute);
    try {
      const realParentPath = await fs.realpath(parentDir);
      const normalizedParent = normalizePath(realParentPath);
      const isParentAllowed = allowedDirectories.some(dir => normalizedParent.startsWith(dir));
      if (!isParentAllowed) {
        throw new Error("Access denied - parent directory outside allowed directories");
      }
      return absolute;
    } catch {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
  }
}

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

// Server setup
const server = new Server(
  {
    name: "secure-filesystem-server",
    version: "0.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_file",
        description: "Read the complete contents of a file from the file system. Handles various text encodings and provides detailed error messages if the file cannot be read. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadFileArgsSchema),
      },
      {
        name: "read_multiple_files",
        description: "Read the contents of multiple files simultaneously. Efficient for analyzing or comparing files. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMultipleFilesArgsSchema),
      },
      {
        name: "write_file",
        description: "Create or overwrite a file with new content. Use with caution as it overwrites existing files without warning. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(WriteFileArgsSchema),
      },
      {
        name: "create_directory",
        description: "Create a new directory or ensure a directory exists. Can create multiple nested directories in one operation. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CreateDirectoryArgsSchema),
      },
      {
        name: "list_directory",
        description: "Get a detailed listing of all files and directories in a specified path. Provides clarity on directory structure. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ListDirectoryArgsSchema),
      },
      {
        name: "move_file",
        description: "Move or rename files and directories. If the destination exists, the operation will fail. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(MoveFileArgsSchema),
      },
      {
        name: "search_files",
        description: "Recursively search for files and directories matching a pattern. Useful for finding files when the exact location is unknown. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(SearchFilesArgsSchema),
      },
      {
        name: "get_file_info",
        description: "Retrieve detailed metadata about a file or directory. Provides size, creation time, last modified time, and type information. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(GetFileInfoArgsSchema),
      },
      {
        name: "copy_file",
        description: "Copy a file from source to destination. If the destination exists, the operation will fail. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(CopyFileArgsSchema),
      },
      {
        name: "backup_file",
        description: "Create a backup of a file in a specified destination directory with a timestamp. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(BackupFileArgsSchema),
      },
      {
        name: "move_to_trash",
        description: "Move a file to the trash directory instead of permanently deleting it. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(DeleteFileArgsSchema),
      },
      {
        name: "empty_trash",
        description: "Permanently delete all files in the trash directory. This operation cannot be undone.",
        inputSchema: zodToJsonSchema(EmptyTrashArgsSchema),
      },
      {
        name: "restore_file",
        description: "Restore a file from the trash to its original location. Only works for files in the trash directory.",
        inputSchema: zodToJsonSchema(RestoreFileArgsSchema),
      },
      {
        name: "zip_directory",
        description: "Compress a directory into a .zip archive. Useful for easier storage or transfer. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ZipDirectoryArgsSchema),
      },
      {
        name: "unzip_file",
        description: "Extract a .zip file to a specified directory. Only works within allowed directories.",
        inputSchema: zodToJsonSchema(UnzipFileArgsSchema),
      },
      {
        name: "list_trash",
        description: "List all files and directories currently in the trash folder. Helps identify items available for recovery or deletion.",
        inputSchema: zodToJsonSchema(ListTrashArgsSchema),
      },
      {
        name: "restore_from_backup",
        description: "Restore a file from a backup version. Recover an older version if needed. Both backup and destination paths must be within allowed directories.",
        inputSchema: zodToJsonSchema(RestoreFromBackupArgsSchema),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "read_file": {
        const parsed = ReadFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const content = await fs.readFile(validPath, "utf-8");
        return { content: [{ type: "text", text: content }] };
      }

      case "read_multiple_files": {
        const parsed = ReadMultipleFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for read_multiple_files: ${parsed.error}`);
        }
        const results = await Promise.all(
          parsed.data.paths.map(async (filePath: string) => {
            try {
              const validPath = await validatePath(filePath);
              const content = await fs.readFile(validPath, "utf-8");
              return `${filePath}:\n${content}\n`;
            } catch (error) {
              return `${filePath}: Error - ${error instanceof Error ? error.message : String(error)}`;
            }
          }),
        );
        return { content: [{ type: "text", text: results.join("\n---\n") }] };
      }

      case "write_file": {
        const parsed = WriteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for write_file: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.writeFile(validPath, parsed.data.content, "utf-8");
        return { content: [{ type: "text", text: `Successfully wrote to ${parsed.data.path}` }] };
      }

      case "create_directory": {
        const parsed = CreateDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for create_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        await fs.mkdir(validPath, { recursive: true });
        return { content: [{ type: "text", text: `Successfully created directory ${parsed.data.path}` }] };
      }

      case "list_directory": {
        const parsed = ListDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_directory: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const entries = await fs.readdir(validPath, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return { content: [{ type: "text", text: formatted }] };
      }

      case "move_file": {
        const parsed = MoveFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.rename(validSourcePath, validDestPath);
        return { content: [{ type: "text", text: `Successfully moved ${parsed.data.source} to ${parsed.data.destination}` }] };
      }

      case "search_files": {
        const parsed = SearchFilesArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for search_files: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const results = await searchFiles(validPath, parsed.data.pattern);
        return { content: [{ type: "text", text: results.length > 0 ? results.join("\n") : "No matches found" }] };
      }

      case "get_file_info": {
        const parsed = GetFileInfoArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for get_file_info: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const info = await getFileStats(validPath);
        return {
          content: [{ type: "text", text: Object.entries(info)
            .map(([key, value]) => `${key}: ${value}`)
            .join("\n") }],
        };
      }

      case "copy_file": {
        const parsed = CopyFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for copy_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.copyFile(validSourcePath, validDestPath);
        return { content: [{ type: "text", text: `Successfully copied ${parsed.data.source} to ${parsed.data.destination}` }] };
      }

      case "backup_file": {
        const parsed = BackupFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for backup_file: ${parsed.error}`);
        }
        const validSourcePath = await validatePath(parsed.data.source);
        const validDestDir = await validatePath(parsed.data.destinationDir);
        const backupPath = await backupFile({
          source: validSourcePath,
          destinationDir: validDestDir,
        });
        return { content: [{ type: "text", text: `Successfully created backup at ${backupPath}` }] };
      }

      case "move_to_trash": {
        const parsed = DeleteFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for move_to_trash: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const filename = path.basename(validPath);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const trashPath = path.join(trashDir, `${filename}.${timestamp}`);
        await fs.rename(validPath, trashPath);
        return { content: [{ type: "text", text: `Moved ${parsed.data.path} to trash at ${trashPath}` }] };
      }
      
      case "empty_trash": {
        const parsed = EmptyTrashArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for empty_trash: ${parsed.error}`);
        }
        if (!parsed.data.confirm) {
          return { content: [{ type: "text", text: "Please confirm emptying trash by setting confirm: true" }] };
        }
        const entries = await fs.readdir(trashDir);
        await Promise.all(entries.map(entry => 
          fs.rm(path.join(trashDir, entry), { force: true, recursive: true })
        ));
        return { content: [{ type: "text", text: `Successfully emptied trash directory` }] };
      }

      case "restore_file": {
        const parsed = RestoreFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for restore_file: ${parsed.error}`);
        }
        const trashPath = await validatePath(path.join(trashDir, parsed.data.path));
        const originalPath = await validatePath(parsed.data.path);
        await fs.rename(trashPath, originalPath);
        return { content: [{ type: "text", text: `Successfully restored ${parsed.data.path} from trash` }] };
      }

      case "zip_directory": {
        const parsed = ZipDirectoryArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for zip_directory: ${parsed.error}`);
        }
        try {
          const validSourcePath = await validatePath(parsed.data.path);
          const validDestPath = await validatePath(parsed.data.destination);
          const zip = new AdmZip();
          zip.addLocalFolder(validSourcePath);
          zip.writeZip(validDestPath);
          return { content: [{ type: "text", text: `Successfully compressed directory to ${parsed.data.destination}` }] };
        } catch (error) {
          throw new Error(`Failed to zip directory: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "unzip_file": {
        const parsed = UnzipFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for unzip_file: ${parsed.error}`);
        }
        try {
          const validSourcePath = await validatePath(parsed.data.source);
          const validDestPath = await validatePath(parsed.data.destination);
          const zip = new AdmZip(validSourcePath);
          zip.extractAllTo(validDestPath, true);
          return { content: [{ type: "text", text: `Successfully extracted zip file to ${parsed.data.destination}` }] };
        } catch (error) {
          throw new Error(`Failed to unzip file: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      case "list_trash": {
        const parsed = ListTrashArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for list_trash: ${parsed.error}`);
        }
        const entries = await fs.readdir(trashDir, { withFileTypes: true });
        const formatted = entries
          .map((entry) => `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`)
          .join("\n");
        return { content: [{ type: "text", text: formatted || "Trash is empty" }] };
      }

      case "restore_from_backup": {
        const parsed = RestoreFromBackupArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for restore_from_backup: ${parsed.error}`);
        }
        const validBackupPath = await validatePath(parsed.data.backupPath);
        const validDestPath = await validatePath(parsed.data.destination);
        await fs.copyFile(validBackupPath, validDestPath);
        return { content: [{ type: "text", text: `Successfully restored backup from ${parsed.data.backupPath} to ${parsed.data.destination}` }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Secure MCP Filesystem Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
