#!/usr/bin/env node

/**
 * OpenAI Agent Builder MCP Server
 * 
 * This follows the exact MCP specification that OpenAI expects
 */

import express from 'express';
import cors from 'cors';
import { GoogleDocsService } from './dist/google-docs-service.js';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());

// Initialize Google Docs service
const googleDocsService = new GoogleDocsService();

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'google-docs-mcp',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Google Docs MCP Server',
    version: '1.0.0',
    description: 'MCP server for Google Docs integration'
  });
});

// MCP Protocol endpoint - this is what OpenAI Agent Builder expects
app.post('/mcp', async (req, res) => {
  try {
    const { jsonrpc, id, method, params } = req.body;
    
    console.log('MCP Request:', { jsonrpc, id, method, params });
    
    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' }
      });
    }
    
    let result;
    
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'google-docs-mcp',
            version: '1.0.0'
          }
        };
        break;
        
      case 'tools/list':
        result = {
          tools: [
            {
              name: 'docs_create_document',
              description: 'Create a new Google Doc',
              inputSchema: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    description: 'Document title'
                  }
                },
                required: ['title']
              }
            },
            {
              name: 'docs_get_document',
              description: 'Get the content of a Google Doc',
              inputSchema: {
                type: 'object',
                properties: {
                  documentId: {
                    type: 'string',
                    description: 'Google Doc ID'
                  }
                },
                required: ['documentId']
              }
            },
            {
              name: 'docs_append_text',
              description: 'Append text to a Google Doc',
              inputSchema: {
                type: 'object',
                properties: {
                  documentId: {
                    type: 'string',
                    description: 'Google Doc ID'
                  },
                  text: {
                    type: 'string',
                    description: 'Text to append'
                  }
                },
                required: ['documentId', 'text']
              }
            },
            {
              name: 'docs_replace_text',
              description: 'Find and replace text in a Google Doc',
              inputSchema: {
                type: 'object',
                properties: {
                  documentId: {
                    type: 'string',
                    description: 'Google Doc ID'
                  },
                  findText: {
                    type: 'string',
                    description: 'Text to find'
                  },
                  replaceWithText: {
                    type: 'string',
                    description: 'Text to replace with'
                  }
                },
                required: ['documentId', 'findText', 'replaceWithText']
              }
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
                    default: 10
                  }
                }
              }
            },
            {
              name: 'docs_delete_document',
              description: 'Delete a Google Doc',
              inputSchema: {
                type: 'object',
                properties: {
                  documentId: {
                    type: 'string',
                    description: 'Google Doc ID to delete'
                  }
                },
                required: ['documentId']
              }
            },
            {
              name: 'docs_export_pdf',
              description: 'Export a Google Doc as PDF',
              inputSchema: {
                type: 'object',
                properties: {
                  documentId: {
                    type: 'string',
                    description: 'Google Doc ID'
                  },
                  outputPath: {
                    type: 'string',
                    description: 'Path to save the PDF file'
                  }
                },
                required: ['documentId', 'outputPath']
              }
            }
          ]
        };
        break;
        
      case 'tools/call':
        const { name, arguments: args } = params;
        let toolResult;
        
        console.log(`Calling tool: ${name}`, args);
        
        switch (name) {
          case 'docs_create_document':
            toolResult = await googleDocsService.createDocument(args?.title);
            break;
            
          case 'docs_get_document':
            toolResult = await googleDocsService.getDocument(args?.documentId);
            break;
            
          case 'docs_append_text':
            toolResult = await googleDocsService.appendText(args?.documentId, args?.text);
            break;
            
          case 'docs_replace_text':
            toolResult = await googleDocsService.replaceText(
              args?.documentId, 
              args?.findText, 
              args?.replaceWithText
            );
            break;
            
          case 'docs_list_documents':
            toolResult = await googleDocsService.listDocuments(args?.maxResults);
            break;
            
          case 'docs_delete_document':
            toolResult = await googleDocsService.deleteDocument(args?.documentId);
            break;
            
          case 'docs_export_pdf':
            toolResult = await googleDocsService.exportPDF(args?.documentId, args?.outputPath);
            break;
            
          default:
            return res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Unknown tool: ${name}` }
            });
        }
        
        result = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2)
            }
          ]
        };
        break;
        
      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown method: ${method}` }
        });
    }
    
    console.log('MCP Response:', { jsonrpc: '2.0', id, result });
    
    res.json({
      jsonrpc: '2.0',
      id,
      result
    });
    
  } catch (error) {
    console.error('MCP error:', error);
    res.json({
      jsonrpc: '2.0',
      id: req.body.id,
      error: { code: -32603, message: error.message }
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`🚀 OpenAI MCP Server running on http://localhost:${port}`);
  console.log(`📋 MCP endpoint: http://localhost:${port}/mcp`);
  console.log(`❤️  Health check: http://localhost:${port}/health`);
  console.log(`\n🔗 Use this URL in OpenAI Agent Builder: http://localhost:${port}/mcp`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down MCP Server...');
  process.exit(0);
});
