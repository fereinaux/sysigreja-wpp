import * as Minio from 'minio';

export class MinioClient {
  private client: Minio.Client;
  private bucket: string;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });

    this.bucket = process.env.MINIO_BUCKET || 'private';
  }

  async getObject(objectName: string, bucket?: string): Promise<Buffer> {
    const targetBucket = bucket || this.bucket;

    try {
      const dataStream = await this.client.getObject(targetBucket, objectName);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        dataStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        dataStream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        dataStream.on('error', (err: Error) => {
          reject(new Error(`Error reading object stream: ${err.message}`));
        });
      });
    } catch (err: any) {
      throw new Error(`Failed to get object from MinIO: ${err.message}`);
    }
  }

  async objectExists(objectName: string, bucket?: string): Promise<boolean> {
    const targetBucket = bucket || this.bucket;

    try {
      await this.client.statObject(targetBucket, objectName);
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }
}

