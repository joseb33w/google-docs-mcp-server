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

    // Check for service account key first (for Railway deployment)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      try {
        const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        this.oauth2Client = new this.google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: [
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/drive.metadata.readonly',
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
    
    // For service account, authentication is automatic
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
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
}
