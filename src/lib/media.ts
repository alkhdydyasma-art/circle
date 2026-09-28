// Shared by the upload action (server) and the upload control (browser).
export const MEDIA_BUCKET = "clinic-media";
/** Hard server limit; the browser shrinks photos well below it before uploading. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_CASES = 6;
export const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp";
