#!/usr/bin/env node

// [Previous imports and initialization code...]

// Schema definitions and utility functions as before...

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

// List tools handler
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
      // [Rest of tool definitions...]
    ],
  };
});

// Call tool handler
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

      // Start of write_file case...
