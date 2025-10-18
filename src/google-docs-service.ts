import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GoogleConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
}

export class GoogleDocsService {
  private docs: any;
  private drive: any;
  private oauth2Client: any;
  private tokenPath: string;
  private google: any;
  private initialized = false;

  constructor() {
    this.tokenPath = path.join('/Users/josebarron/Downloads/simple/google-docs-mcp', 'tokens.json');
  }

  private async initializeAuth() {
    if (this.initialized) return;

    this.google = (await import('googleapis')).google;
    this.initialized = true;

    // Check for OAuth tokens first (for Railway deployment)
    if (process.env.GOOGLE_OAUTH_TOKENS) {
      try {
        const tokens = JSON.parse(process.env.GOOGLE_OAUTH_TOKENS);
        this.oauth2Client = new this.google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          'http://localhost'
        );
        this.oauth2Client.setCredentials(tokens);
      } catch (error) {
        throw new Error('Invalid GOOGLE_OAUTH_TOKENS format');
      }
    } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        this.oauth2Client = new this.google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: [
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/drive',
          ],
        });
      } catch (error) {
        throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY format');
      }
    } else {
      // Fallback to OAuth2 for local development
      const config: GoogleConfig = {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost',
      };

      if (!config.clientId || !config.clientSecret) {
        throw new Error(
          'Google credentials not found. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
        );
      }

      this.oauth2Client = new this.google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        config.redirectUri
      );

      if (fs.existsSync(this.tokenPath)) {
        const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
        this.oauth2Client.setCredentials(tokens);
      }

      this.oauth2Client.on('tokens', (tokens: any) => {
        if (tokens.refresh_token) {
          fs.writeFileSync(
            this.tokenPath,
            JSON.stringify(tokens, null, 2)
          );
        }
      });
    }

    this.docs = this.google.docs({
      version: 'v1',
      auth: this.oauth2Client,
    });

    this.drive = this.google.drive({
      version: 'v3',
      auth: this.oauth2Client,
    });
  }

  async ensureAuthenticated() {
    await this.initializeAuth();
    
    // For OAuth tokens or service account, authentication is automatic
    if (process.env.GOOGLE_OAUTH_TOKENS || process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      return;
    }
    
    // For OAuth2, check if we need to authenticate
    if (!this.oauth2Client.credentials?.access_token) {
      await this.authenticate();
    }
  }

  private async authenticate() {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
      ],
    });

    console.error('\n🔐 Google Docs Authentication Required');
    console.error('Please visit this URL to authorize:\n');
    console.error(authUrl);
    console.error('\nAfter authorization, copy the code and run the token exchange command\n');

    throw new Error(`Authentication required. Please visit: ${authUrl}`);
  }

  async createDocument(title: string) {
    await this.ensureAuthenticated();

    const response = await this.docs.documents.create({
      requestBody: {
        title,
      },
    });

    return {
      documentId: response.data.documentId,
      title: response.data.title,
      url: `https://docs.google.com/document/d/${response.data.documentId}/edit`,
    };
  }

  async getDocument(documentId: string) {
    await this.ensureAuthenticated();

    const response = await this.docs.documents.get({
      documentId,
    });

    const content = response.data.body?.content
      ?.map((item: any) => item.paragraph?.elements?.map((el: any) => el.textRun?.content).join(''))
      .join('\n');

    return {
      documentId: response.data.documentId,
      title: response.data.title,
      content,
    };
  }

  async appendText(documentId: string, text: string) {
    await this.ensureAuthenticated();

    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              text,
              endOfSegmentLocation: {},
            },
          },
        ],
      },
    });

    return {
      success: true,
      documentId,
      message: 'Text appended successfully',
    };
  }

  async replaceText(documentId: string, findText: string, replaceWithText: string) {
    await this.ensureAuthenticated();

    const response = await this.docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            replaceAllText: {
              containsText: {
                text: findText,
              },
              replaceText: replaceWithText,
            },
          },
        ],
      },
    });

    return {
      success: true,
      documentId,
      message: 'Text replaced successfully',
    };
  }

  async listDocuments(maxResults = 10) {
    await this.ensureAuthenticated();

    const response = await this.drive.files.list({
      q: "mimeType='application/vnd.google-apps.document'",
      spaces: 'drive',
      fields: 'files(id, name, createdTime, modifiedTime)',
      pageSize: maxResults,
    });

    return {
      totalDocs: response.data.files?.length || 0,
      documents: response.data.files?.map((file: any) => ({
        documentId: file.id,
        title: file.name,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        url: `https://docs.google.com/document/d/${file.id}/edit`,
      })),
    };
  }

  async listDriveFiles(maxResults = 50, mimeType?: string, query?: string, orderBy = 'modifiedTime desc') {
    await this.ensureAuthenticated();

    let searchQuery = "trashed=false";
    if (mimeType) {
      searchQuery += ` and mimeType='${mimeType}'`;
    }
    if (query) {
      searchQuery += ` and name contains '${query}'`;
    }

    const response = await this.drive.files.list({
      q: searchQuery,
      spaces: 'drive',
      fields: 'files(id, name, mimeType, createdTime, modifiedTime, size, webViewLink, parents)',
      pageSize: maxResults,
      orderBy: orderBy,
    });

    return {
      totalFiles: response.data.files?.length || 0,
      files: response.data.files?.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        size: file.size,
        webViewLink: file.webViewLink,
        parents: file.parents,
        isGoogleDoc: file.mimeType === 'application/vnd.google-apps.document',
        isGoogleSheet: file.mimeType === 'application/vnd.google-apps.spreadsheet',
        isGoogleSlide: file.mimeType === 'application/vnd.google-apps.presentation',
        isFolder: file.mimeType === 'application/vnd.google-apps.folder',
      })),
    };
  }

  async getDriveFile(fileId: string, fields?: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.files.get({
      fileId: fileId,
      fields: fields || 'id,name,mimeType,createdTime,modifiedTime,size,webViewLink,parents,permissions,owners',
    });

    return {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      createdTime: response.data.createdTime,
      modifiedTime: response.data.modifiedTime,
      size: response.data.size,
      webViewLink: response.data.webViewLink,
      parents: response.data.parents,
      permissions: response.data.permissions,
      owners: response.data.owners,
    };
  }

  async createDriveFile(name: string, mimeType: string, content?: string, parents?: string[]) {
    await this.ensureAuthenticated();

    const fileMetadata = {
      name: name,
      parents: parents,
    };

    let response;
    if (content) {
      // Create file with content
      const media = {
        mimeType: mimeType,
        body: content,
      };
      response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,mimeType,webViewLink',
      });
    } else {
      // Create empty file
      response = await this.drive.files.create({
        resource: {
          ...fileMetadata,
          mimeType: mimeType,
        },
        fields: 'id,name,mimeType,webViewLink',
      });
    }

    return {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      webViewLink: response.data.webViewLink,
      message: 'File created successfully',
    };
  }

  async updateDriveFile(fileId: string, name?: string, content?: string, addParents?: string[], removeParents?: string[]) {
    await this.ensureAuthenticated();

    const updateData: any = {};
    
    if (name) {
      updateData.name = name;
    }

    if (addParents || removeParents) {
      updateData.addParents = addParents?.join(',');
      updateData.removeParents = removeParents?.join(',');
    }

    let response;
    if (content) {
      // Update file content
      const media = {
        mimeType: 'text/plain',
        body: content,
      };
      response = await this.drive.files.update({
        fileId: fileId,
        resource: updateData,
        media: media,
        fields: 'id,name,mimeType,webViewLink',
      });
    } else {
      // Update metadata only
      response = await this.drive.files.update({
        fileId: fileId,
        resource: updateData,
        fields: 'id,name,mimeType,webViewLink',
      });
    }

    return {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      webViewLink: response.data.webViewLink,
      message: 'File updated successfully',
    };
  }

  async deleteDriveFile(fileId: string) {
    await this.ensureAuthenticated();

    await this.drive.files.delete({
      fileId: fileId,
    });

    return {
      fileId,
      message: 'File deleted successfully',
    };
  }

  async copyDriveFile(fileId: string, name?: string, parents?: string[]) {
    await this.ensureAuthenticated();

    const copyMetadata: any = {};
    if (name) {
      copyMetadata.name = name;
    }
    if (parents) {
      copyMetadata.parents = parents;
    }

    const response = await this.drive.files.copy({
      fileId: fileId,
      resource: copyMetadata,
      fields: 'id,name,mimeType,webViewLink',
    });

    return {
      id: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      webViewLink: response.data.webViewLink,
      message: 'File copied successfully',
    };
  }

  async moveDriveFile(fileId: string, addParents: string[], removeParents: string[]) {
    await this.ensureAuthenticated();

    const response = await this.drive.files.update({
      fileId: fileId,
      addParents: addParents.join(','),
      removeParents: removeParents.join(','),
      fields: 'id,name,parents',
    });

    return {
      id: response.data.id,
      name: response.data.name,
      parents: response.data.parents,
      message: 'File moved successfully',
    };
  }

  async deleteDocument(documentId: string) {
    await this.ensureAuthenticated();

    await this.drive.files.delete({
      fileId: documentId,
    });

    return {
      success: true,
      documentId,
      message: 'Document deleted successfully',
    };
  }

  async exportPDF(documentId: string, outputPath: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.files.export(
      {
        fileId: documentId,
        mimeType: 'application/pdf',
      },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      const dest = fs.createWriteStream(outputPath);
      response.data
        .on('end', () => {
          resolve({
            success: true,
            documentId,
            outputPath,
            message: 'PDF exported successfully',
          });
        })
        .on('error', (err: any) => {
          reject(err);
        })
        .pipe(dest);
    });
  }

  // Google Drive Permissions
  async listDrivePermissions(fileId: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.permissions.list({
      fileId: fileId,
      fields: 'permissions(id,type,role,emailAddress,displayName)',
    });

    return {
      permissions: response.data.permissions?.map((permission: any) => ({
        id: permission.id,
        type: permission.type,
        role: permission.role,
        emailAddress: permission.emailAddress,
        displayName: permission.displayName,
      })) || [],
    };
  }

  async createDrivePermission(fileId: string, emailAddress: string, role: string, type: string) {
    await this.ensureAuthenticated();

    const permission: any = {
      type: type,
      role: role,
    };

    if (emailAddress && type === 'user') {
      permission.emailAddress = emailAddress;
    }

    const response = await this.drive.permissions.create({
      fileId: fileId,
      resource: permission,
      fields: 'id,type,role,emailAddress',
    });

    return {
      id: response.data.id,
      type: response.data.type,
      role: response.data.role,
      emailAddress: response.data.emailAddress,
      message: 'Permission created successfully',
    };
  }

  async deleteDrivePermission(fileId: string, permissionId: string) {
    await this.ensureAuthenticated();

    await this.drive.permissions.delete({
      fileId: fileId,
      permissionId: permissionId,
    });

    return {
      fileId,
      permissionId,
      message: 'Permission deleted successfully',
    };
  }

  // Google Drive Revisions
  async listDriveRevisions(fileId: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.revisions.list({
      fileId: fileId,
      fields: 'revisions(id,modifiedTime,size,keepForever,published,exportLinks)',
    });

    return {
      revisions: response.data.revisions?.map((revision: any) => ({
        id: revision.id,
        modifiedTime: revision.modifiedTime,
        size: revision.size,
        keepForever: revision.keepForever,
        published: revision.published,
        exportLinks: revision.exportLinks,
      })) || [],
    };
  }

  async getDriveRevision(fileId: string, revisionId: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.revisions.get({
      fileId: fileId,
      revisionId: revisionId,
      fields: 'id,modifiedTime,size,keepForever,published,exportLinks',
    });

    return {
      id: response.data.id,
      modifiedTime: response.data.modifiedTime,
      size: response.data.size,
      keepForever: response.data.keepForever,
      published: response.data.published,
      exportLinks: response.data.exportLinks,
    };
  }

  async deleteDriveRevision(fileId: string, revisionId: string) {
    await this.ensureAuthenticated();

    await this.drive.revisions.delete({
      fileId: fileId,
      revisionId: revisionId,
    });

    return {
      fileId,
      revisionId,
      message: 'Revision deleted successfully',
    };
  }

  // Google Drive Comments
  async listDriveComments(fileId: string, maxResults = 100) {
    await this.ensureAuthenticated();

    const response = await this.drive.comments.list({
      fileId: fileId,
      maxResults: maxResults,
      fields: 'comments(id,content,createdTime,modifiedTime,author,quotedFileContent)',
    });

    return {
      comments: response.data.comments?.map((comment: any) => ({
        id: comment.id,
        content: comment.content,
        createdTime: comment.createdTime,
        modifiedTime: comment.modifiedTime,
        author: comment.author,
        quotedFileContent: comment.quotedFileContent,
      })) || [],
    };
  }

  async createDriveComment(fileId: string, content: string, quotedFileContent?: string) {
    await this.ensureAuthenticated();

    const comment: any = {
      content: content,
    };

    if (quotedFileContent) {
      comment.quotedFileContent = quotedFileContent;
    }

    const response = await this.drive.comments.create({
      fileId: fileId,
      resource: comment,
      fields: 'id,content,createdTime,author',
    });

    return {
      id: response.data.id,
      content: response.data.content,
      createdTime: response.data.createdTime,
      author: response.data.author,
      message: 'Comment created successfully',
    };
  }

  async deleteDriveComment(fileId: string, commentId: string) {
    await this.ensureAuthenticated();

    await this.drive.comments.delete({
      fileId: fileId,
      commentId: commentId,
    });

    return {
      fileId,
      commentId,
      message: 'Comment deleted successfully',
    };
  }

  // Google Drive Replies
  async listDriveReplies(fileId: string, commentId: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.replies.list({
      fileId: fileId,
      commentId: commentId,
      fields: 'replies(id,content,createdTime,modifiedTime,author)',
    });

    return {
      replies: response.data.replies?.map((reply: any) => ({
        id: reply.id,
        content: reply.content,
        createdTime: reply.createdTime,
        modifiedTime: reply.modifiedTime,
        author: reply.author,
      })) || [],
    };
  }

  async createDriveReply(fileId: string, commentId: string, content: string) {
    await this.ensureAuthenticated();

    const response = await this.drive.replies.create({
      fileId: fileId,
      commentId: commentId,
      resource: {
        content: content,
      },
      fields: 'id,content,createdTime,author',
    });

    return {
      id: response.data.id,
      content: response.data.content,
      createdTime: response.data.createdTime,
      author: response.data.author,
      message: 'Reply created successfully',
    };
  }

  async deleteDriveReply(fileId: string, commentId: string, replyId: string) {
    await this.ensureAuthenticated();

    await this.drive.replies.delete({
      fileId: fileId,
      commentId: commentId,
      replyId: replyId,
    });

    return {
      fileId,
      commentId,
      replyId,
      message: 'Reply deleted successfully',
    };
  }
}
