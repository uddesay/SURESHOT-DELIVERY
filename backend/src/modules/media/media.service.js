const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const s3Client = require('../../config/s3');
const config = require('../../config');
const ApiError = require('../../utils/ApiError');

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

const MAX_SIZES = { image: 10 * 1024 * 1024, video: 200 * 1024 * 1024, application: 20 * 1024 * 1024 };

/**
 * Direct-to-S3 upload: client gets a presigned PUT URL scoped to a
 * server-generated key — no user-controlled paths, no proxying bytes.
 */
const createPresignedUpload = async (userId, { contentType, sizeBytes, purpose }) => {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) throw ApiError.badRequest(`Unsupported content type: ${contentType}`);

  const kind = contentType.split('/')[0];
  if (sizeBytes > (MAX_SIZES[kind] || MAX_SIZES.image)) {
    throw ApiError.badRequest('File exceeds the maximum allowed size');
  }

  const key = `${purpose}/${new Date().toISOString().slice(0, 10)}/${userId}/${crypto.randomUUID()}.${ext}`;

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: sizeBytes,
    }),
    { expiresIn: 600 },
  );

  const publicBase = config.s3.endpoint
    ? `${config.s3.endpoint}/${config.s3.bucket}`
    : `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com`;

  return { uploadUrl, key, publicUrl: `${publicBase}/${key}`, expiresInSeconds: 600 };
};

module.exports = { createPresignedUpload };
