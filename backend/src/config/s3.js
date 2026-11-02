const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./index');

const s3Client = new S3Client({
  region: config.s3.region,
  ...(config.s3.endpoint ? { endpoint: config.s3.endpoint, forcePathStyle: true } : {}),
  credentials: config.s3.accessKey
    ? { accessKeyId: config.s3.accessKey, secretAccessKey: config.s3.secretKey }
    : undefined,
});

module.exports = s3Client;
