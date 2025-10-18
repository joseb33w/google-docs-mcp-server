# Google Docs MCP Server

A Model Context Protocol (MCP) server for Google Docs integration with OpenAI's Agent Builder.

## Features

- Create Google Docs
- Read document content
- Append text to documents
- Find and replace text
- List documents
- Delete documents
- Export documents as PDF

## Deployment

This server is designed to be deployed on Railway for use with OpenAI's Agent Builder.

## Environment Variables

- `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
- `PORT`: Server port (default: 8080)

## Endpoints

- `GET /health` - Health check
- `GET /` - Server info
- `POST /mcp` - MCP protocol endpoint

## Usage with OpenAI Agent Builder

Use the deployed URL with `/mcp` endpoint:
`https://your-app.railway.app/mcp`
# Force redeploy Sat Oct 18 01:05:30 CDT 2025
