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
