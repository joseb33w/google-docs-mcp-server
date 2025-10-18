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
  {
    name: 'drive_list_files',
    description: 'List all files in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of files to return (default: 50)',
          default: 50,
        },
        mimeType: {
          type: 'string',
          description: 'Filter by MIME type (optional)',
        },
        query: {
          type: 'string',
          description: 'Custom search query (optional)',
        },
        orderBy: {
          type: 'string',
          description: 'Order results by field (default: modifiedTime desc)',
          default: 'modifiedTime desc',
        },
      },
    },
  },
  {
    name: 'drive_get_file',
    description: 'Get file metadata and content',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        fields: {
          type: 'string',
          description: 'Fields to return (optional)',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_create_file',
    description: 'Create a new file in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'File name',
        },
        mimeType: {
          type: 'string',
          description: 'MIME type of the file',
        },
        content: {
          type: 'string',
          description: 'File content (optional)',
        },
        parents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Parent folder IDs (optional)',
        },
      },
      required: ['name', 'mimeType'],
    },
  },
  {
    name: 'drive_update_file',
    description: 'Update file content or metadata',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        name: {
          type: 'string',
          description: 'New file name (optional)',
        },
        content: {
          type: 'string',
          description: 'New file content (optional)',
        },
        addParents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Add to these folders (optional)',
        },
        removeParents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Remove from these folders (optional)',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_delete_file',
    description: 'Delete a file from Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_copy_file',
    description: 'Copy a file in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Source file ID',
        },
        name: {
          type: 'string',
          description: 'Name for the copied file (optional)',
        },
        parents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Destination folder IDs (optional)',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_move_file',
    description: 'Move a file to different folders',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'File ID to move',
        },
        addParents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Add to these folders',
        },
        removeParents: {
          type: 'array',
          items: { type: 'string' },
          description: 'Remove from these folders',
        },
      },
      required: ['fileId', 'addParents', 'removeParents'],
    },
  },
  {
    name: 'drive_list_permissions',
    description: 'List file permissions',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_create_permission',
    description: 'Share a file with users',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        emailAddress: {
          type: 'string',
          description: 'Email address to share with',
        },
        role: {
          type: 'string',
          enum: ['reader', 'writer', 'commenter', 'owner'],
          description: 'Permission role',
        },
        type: {
          type: 'string',
          enum: ['user', 'group', 'domain', 'anyone'],
          description: 'Permission type',
        },
      },
      required: ['fileId', 'role', 'type'],
    },
  },
  {
    name: 'drive_delete_permission',
    description: 'Remove file permissions',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        permissionId: {
          type: 'string',
          description: 'Permission ID to remove',
        },
      },
      required: ['fileId', 'permissionId'],
    },
  },
  {
    name: 'drive_list_revisions',
    description: 'List file revisions/versions',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_get_revision',
    description: 'Get specific file revision',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        revisionId: {
          type: 'string',
          description: 'Revision ID',
        },
      },
      required: ['fileId', 'revisionId'],
    },
  },
  {
    name: 'drive_delete_revision',
    description: 'Delete a file revision',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        revisionId: {
          type: 'string',
          description: 'Revision ID to delete',
        },
      },
      required: ['fileId', 'revisionId'],
    },
  },
  {
    name: 'drive_list_comments',
    description: 'List file comments',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of comments (default: 100)',
          default: 100,
        },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_create_comment',
    description: 'Add a comment to a file',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        content: {
          type: 'string',
          description: 'Comment content',
        },
        quotedFileContent: {
          type: 'string',
          description: 'Quoted text from the file (optional)',
        },
      },
      required: ['fileId', 'content'],
    },
  },
  {
    name: 'drive_delete_comment',
    description: 'Delete a file comment',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        commentId: {
          type: 'string',
          description: 'Comment ID to delete',
        },
      },
      required: ['fileId', 'commentId'],
    },
  },
  {
    name: 'drive_list_replies',
    description: 'List replies to a comment',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        commentId: {
          type: 'string',
          description: 'Comment ID',
        },
      },
      required: ['fileId', 'commentId'],
    },
  },
  {
    name: 'drive_create_reply',
    description: 'Reply to a comment',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        commentId: {
          type: 'string',
          description: 'Comment ID to reply to',
        },
        content: {
          type: 'string',
          description: 'Reply content',
        },
      },
      required: ['fileId', 'commentId', 'content'],
    },
  },
  {
    name: 'drive_delete_reply',
    description: 'Delete a reply to a comment',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'Google Drive file ID',
        },
        commentId: {
          type: 'string',
          description: 'Comment ID',
        },
        replyId: {
          type: 'string',
          description: 'Reply ID to delete',
        },
      },
      required: ['fileId', 'commentId', 'replyId'],
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

      case 'drive_list_files': {
        const result = await getGoogleDocsService().listDriveFiles(
          args?.maxResults as number,
          args?.mimeType as string,
          args?.query as string,
          args?.orderBy as string
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

      case 'drive_get_file': {
        const result = await getGoogleDocsService().getDriveFile(
          args?.fileId as string,
          args?.fields as string
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

      case 'drive_create_file': {
        const result = await getGoogleDocsService().createDriveFile(
          args?.name as string,
          args?.mimeType as string,
          args?.content as string,
          args?.parents as string[]
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

      case 'drive_update_file': {
        const result = await getGoogleDocsService().updateDriveFile(
          args?.fileId as string,
          args?.name as string,
          args?.content as string,
          args?.addParents as string[],
          args?.removeParents as string[]
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

      case 'drive_delete_file': {
        const result = await getGoogleDocsService().deleteDriveFile(
          args?.fileId as string
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

      case 'drive_copy_file': {
        const result = await getGoogleDocsService().copyDriveFile(
          args?.fileId as string,
          args?.name as string,
          args?.parents as string[]
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

      case 'drive_move_file': {
        const result = await getGoogleDocsService().moveDriveFile(
          args?.fileId as string,
          args?.addParents as string[],
          args?.removeParents as string[]
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

      case 'drive_list_permissions': {
        const result = await getGoogleDocsService().listDrivePermissions(
          args?.fileId as string
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

      case 'drive_create_permission': {
        const result = await getGoogleDocsService().createDrivePermission(
          args?.fileId as string,
          args?.emailAddress as string,
          args?.role as string,
          args?.type as string
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

      case 'drive_delete_permission': {
        const result = await getGoogleDocsService().deleteDrivePermission(
          args?.fileId as string,
          args?.permissionId as string
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

      case 'drive_list_revisions': {
        const result = await getGoogleDocsService().listDriveRevisions(
          args?.fileId as string
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

      case 'drive_get_revision': {
        const result = await getGoogleDocsService().getDriveRevision(
          args?.fileId as string,
          args?.revisionId as string
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

      case 'drive_delete_revision': {
        const result = await getGoogleDocsService().deleteDriveRevision(
          args?.fileId as string,
          args?.revisionId as string
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

      case 'drive_list_comments': {
        const result = await getGoogleDocsService().listDriveComments(
          args?.fileId as string,
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

      case 'drive_create_comment': {
        const result = await getGoogleDocsService().createDriveComment(
          args?.fileId as string,
          args?.content as string,
          args?.quotedFileContent as string
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

      case 'drive_delete_comment': {
        const result = await getGoogleDocsService().deleteDriveComment(
          args?.fileId as string,
          args?.commentId as string
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

      case 'drive_list_replies': {
        const result = await getGoogleDocsService().listDriveReplies(
          args?.fileId as string,
          args?.commentId as string
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

      case 'drive_create_reply': {
        const result = await getGoogleDocsService().createDriveReply(
          args?.fileId as string,
          args?.commentId as string,
          args?.content as string
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

      case 'drive_delete_reply': {
        const result = await getGoogleDocsService().deleteDriveReply(
          args?.fileId as string,
          args?.commentId as string,
          args?.replyId as string
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
