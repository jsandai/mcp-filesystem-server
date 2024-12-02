# MCP Filesystem Server

A secure Model Context Protocol (MCP) server for filesystem operations with Claude Desktop. This server provides a safe way to perform file operations within specified allowed directories.

## Features

### Core Features
- Secure file operations within allowed directories
- Path validation and security checks
- Home directory expansion
- Symlink security

### File Operations
- Read/write files
- Create/list directories
- Move/copy files
- Search functionality
- File metadata retrieval

### Advanced Features
- Trash management system
- File backup functionality
- Zip/unzip support
- Backup restoration

## Installation

1. Clone the repository:
```bash
git clone https://github.com/jsandai/mcp-filesystem-server.git
cd mcp-filesystem-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the TypeScript code:
```bash
npx tsc
```

## Usage

The server requires at least one allowed directory to be specified when starting:

```bash
node dist/index.js <allowed-directory> [additional-directories...]
```

### Claude Desktop Configuration

Add the following to your Claude Desktop config.json:

```json
{
    "mcpServers": {
        "filesystem": {
            "command": "node",
            "args": [
                "path/to/filesystem/dist/index.js",
                "C:/allowed/directory/path"
            ]
        }
    }
}
```

## Available Tools

The server provides the following tools:

### Basic Operations
- `read_file`: Read file contents
- `write_file`: Create or update files
- `create_directory`: Create new directories
- `list_directory`: List directory contents
- `move_file`: Move/rename files
- `search_files`: Search for files by pattern
- `get_file_info`: Get file metadata

### Advanced Operations
- `read_multiple_files`: Read multiple files at once
- `copy_file`: Copy files
- `backup_file`: Create file backups
- `move_to_trash`: Move files to trash
- `empty_trash`: Clear trash directory
- `restore_file`: Restore from trash
- `zip_directory`: Compress directories
- `unzip_file`: Extract zip files
- `list_trash`: View trash contents
- `restore_from_backup`: Restore from backups

## Security

### Path Validation
- All file operations are restricted to allowed directories
- Secure handling of symlinks
- Prevention of directory traversal attacks

### Trash System
- Soft delete support with timestamped files
- Recovery options
- Secure file deletion

## Development

### Built With
- TypeScript
- @modelcontextprotocol/sdk
- zod (for schema validation)
- adm-zip (for compression)

### Required Dependencies
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "adm-zip": "^0.5.10",
    "zod": "^3.22.4",
    "zod-to-json-schema": "^3.22.3"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.5",
    "@types/node": "^20.11.0",
    "typescript": "^5.3.3"
  }
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
