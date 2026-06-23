/**
 * Ayrshare Social Publishing Service
 *
 * TEMPORARY FRONTEND-ONLY PROTOTYPE.
 * Do not use this in production.
 * The Ayrshare API key must later be moved to a backend proxy.
 */

const AYRSHARE_API_KEY = import.meta.env.VITE_AYRSHARE_API_KEY || "";

// ─── Publish to Ayrshare ──────────────────────────────────────────────────────

/**
 * Post content to one or more social platforms via Ayrshare.
 *
 * @param {Object}   opts
 * @param {string}   opts.post       - The post text / caption.
 * @param {string[]} opts.platforms  - Ayrshare platform identifiers, e.g. ["facebook", "instagram"].
 * @param {string[]} [opts.mediaUrls] - Array of public image URLs.
 * @returns {Promise<Object>}        - Ayrshare API response.
 */
async function publishToAyrshare({ post, platforms, mediaUrls }) {
  if (!AYRSHARE_API_KEY) {
    throw new Error(
      "Ayrshare API key is not configured. Set VITE_AYRSHARE_API_KEY in your .env file."
    );
  }

  const payload = {
    post,
    platforms,
  };

  // Only include mediaUrls if we actually have valid entries
  if (Array.isArray(mediaUrls) && mediaUrls.length > 0) {
    payload.mediaUrls = mediaUrls;
  }

  const response = await fetch("https://api.ayrshare.com/api/post", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    // Ayrshare returns structured errors — extract the best message
    const message =
      data?.message ||
      data?.error ||
      data?.errors?.map((e) => e.message).join("; ") ||
      `Social publishing failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  return data;
}

// ─── Upload media to Ayrshare ─────────────────────────────────────────────────

/**
 * Upload a base64-encoded image to Ayrshare's media endpoint.
 * Returns the public URL that Ayrshare can use for posting.
 *
 * Uses the Ayrshare /api/media/upload endpoint which accepts:
 *   { file: "data:image/png;base64,..." }
 *
 * @param {string} dataUri - A full data URI (data:image/...;base64,...).
 * @returns {Promise<string>} - The public URL of the uploaded image.
 */
async function uploadMediaToAyrshare(dataUri) {
  if (!AYRSHARE_API_KEY) {
    throw new Error(
      "Ayrshare API key is not configured. Set VITE_AYRSHARE_API_KEY in your .env file."
    );
  }

  const response = await fetch("https://api.ayrshare.com/api/media/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AYRSHARE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: dataUri }),
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Media upload failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  // Ayrshare returns { url: "https://..." } on success
  const publicUrl = data?.url;
  if (!publicUrl) {
    throw new Error("Media upload succeeded but no URL was returned.");
  }

  return publicUrl;
}

// ─── Get Social Media URLs (with auto-upload) ──────────────────────────────────

/**
 * Returns an array of publicly-accessible image URLs for social publishing.
 * Ayrshare requires public URLs — blob:, data:, and localhost URLs
 * cannot be used directly.
 *
 * Strategy:
 *   1. If enhanced images exist → upload/resolve all to Ayrshare and return the public URLs.
 *   2. If no enhanced images exist, fallback to original photos → upload/resolve all.
 *   3. Return the array of valid public URLs.
 *
 * @param {string[]|null} enhancedUrls - Array of enhanced image URLs (often data: URIs).
 * @param {Object[]|null} photos       - Array of photo objects with { previewUrl, base64, mimeType }.
 * @returns {Promise<string[]>}        - Array of valid public URLs.
 */
async function getSocialMediaUrls(enhancedUrls, photos) {
  const urls = [];
  if (!Array.isArray(photos)) return urls;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const enhancedUrl = Array.isArray(enhancedUrls) ? enhancedUrls[i] : null;
    let resolved = false;

    // 1. Try to use the enhanced image first if available
    if (enhancedUrl && typeof enhancedUrl === "string") {
      if (isPublicUrl(enhancedUrl)) {
        urls.push(enhancedUrl);
        resolved = true;
      } else if (enhancedUrl.startsWith("data:")) {
        try {
          const publicUrl = await uploadMediaToAyrshare(enhancedUrl);
          urls.push(publicUrl);
          resolved = true;
        } catch (err) {
          console.warn("Failed to upload enhanced image to Ayrshare:", err.message);
        }
      }
    }

    // 2. If no enhanced image was resolved, fall back to the original photo
    if (!resolved && photo) {
      if (photo.base64 && photo.mimeType) {
        const dataUri = `data:${photo.mimeType};base64,${photo.base64}`;
        try {
          const publicUrl = await uploadMediaToAyrshare(dataUri);
          urls.push(publicUrl);
        } catch (err) {
          console.warn("Failed to upload original photo to Ayrshare:", err.message);
        }
      } else {
        const photoUrl = photo.previewUrl || photo.url || photo;
        if (typeof photoUrl === "string") {
          if (isPublicUrl(photoUrl)) {
            urls.push(photoUrl);
          } else if (photoUrl.startsWith("blob:")) {
            try {
              const dataUri = await blobUrlToDataUri(photoUrl);
              const publicUrl = await uploadMediaToAyrshare(dataUri);
              urls.push(publicUrl);
            } catch (err) {
              console.warn("Failed to convert and upload blob URL:", err.message);
            }
          }
        }
      }
    }
  }

  return urls;
}

/**
 * Convert a blob: URL to a data: URI.
 */
async function blobUrlToDataUri(blobUrl) {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if a URL is a valid public URL that Ayrshare can fetch.
 * Rejects blob:, data:, localhost, and empty strings.
 */
function isPublicUrl(url) {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject non-public URL schemes
  if (trimmed.startsWith("blob:")) return false;
  if (trimmed.startsWith("data:")) return false;

  // Reject localhost / 127.0.0.1
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "0.0.0.0"
    ) {
      return false;
    }
    // Must be http or https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export { publishToAyrshare, getSocialMediaUrls };
