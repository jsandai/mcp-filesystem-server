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
