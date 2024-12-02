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