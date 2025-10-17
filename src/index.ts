#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { GoogleDocsService } from './google-docs-service.js';

let googleDocsService: GoogleDocsService | null = null;

function getGoogleDocsService() {
  if (!googleDocsService) {
    googleDocsService = new GoogleDocsService();
  }
  return googleDocsService;
}

const server = new Server(
  {
    name: 'google-docs-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
  {
    name: 'docs_create_document',
    description: 'Create a new Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Document title',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'docs_get_document',
    description: 'Get the content of a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Google Doc ID',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'docs_append_text',
    description: 'Append text to a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Google Doc ID',
        },
        text: {
          type: 'string',
          description: 'Text to append',
        },
      },
      required: ['documentId', 'text'],
    },
  },
  {
    name: 'docs_replace_text',
    description: 'Find and replace text in a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Google Doc ID',
        },
        findText: {
          type: 'string',
          description: 'Text to find',
        },
        replaceWithText: {
          type: 'string',
          description: 'Text to replace with',
        },
      },
      required: ['documentId', 'findText', 'replaceWithText'],
    },
  },
  {
    name: 'docs_list_documents',
    description: 'List your Google Docs',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of documents to return (default: 10)',
          default: 10,
        },
      },
    },
  },
  {
    name: 'docs_delete_document',
    description: 'Delete a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Google Doc ID to delete',
        },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'docs_export_pdf',
    description: 'Export a Google Doc as PDF',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Google Doc ID',
        },
        outputPath: {
          type: 'string',
          description: 'Path to save the PDF file',
        },
      },
      required: ['documentId', 'outputPath'],
    },
  },
];

const toolsResponse = { tools };

server.setRequestHandler(ListToolsRequestSchema, async () => toolsResponse);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'docs_create_document': {
        const result = await getGoogleDocsService().createDocument(
          args?.title as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'docs_get_document': {
        const result = await getGoogleDocsService().getDocument(
          args?.documentId as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'docs_append_text': {
        const result = await getGoogleDocsService().appendText(
          args?.documentId as string,
          args?.text as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'docs_replace_text': {
        const result = await getGoogleDocsService().replaceText(
          args?.documentId as string,
          args?.findText as string,
          args?.replaceWithText as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'docs_list_documents': {
        const result = await getGoogleDocsService().listDocuments(
          args?.maxResults as number
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'docs_delete_document': {
        const result = await getGoogleDocsService().deleteDocument(
          args?.documentId as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'docs_export_pdf': {
        const result = await getGoogleDocsService().exportPDF(
          args?.documentId as string,
          args?.outputPath as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Google Docs MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
