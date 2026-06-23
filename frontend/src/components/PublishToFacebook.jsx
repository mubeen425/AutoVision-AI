import React from "react";
import {
  FaSpinner,
  FaCircleCheck,
  FaTriangleExclamation,
  FaXmark,
  FaFacebook,
} from "react-icons/fa6";
import { useLanguage } from "../context/LanguageContext";

const FB_APP_ID = "YOUR_FACEBOOK_APP_ID"; // Replace with your App ID

// ─── Sub-components ───────────────────────────────────────────────────────────

function Overlay({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    />
  );
}

function Modal({ children, onClose }) {
  return (
    <>
      <Overlay onClose={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8"
      >
        <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200 max-h-[94dvh] sm:max-w-lg">
          {children}
        </div>
      </div>
    </>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-black/80 px-6 py-4 backdrop-blur-xl sm:px-8 sm:py-5">
      <div>
        <span className="text-sm font-semibold text-white">{title}</span>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-tight text-gray-400">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
        aria-label="Close"
      >
        <FaXmark className="h-4 w-4" />
      </button>
    </div>
  );
}

function ModalContent({ children }) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
      {children}
    </div>
  );
}

function ModalFooter({ children }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/60 px-6 py-4 backdrop-blur-xl sm:px-8">
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PublishToFacebook({
  open,
  onClose,
  form = {},
  advert = null,
  photos = [],
  enhancedUrls = null,
}) {
  const { t, language } = useLanguage();

  // State
  const [stage, setStage] = React.useState("idle"); // "idle" | "auth" | "posting" | "done" | "error"
  const [errorMsg, setErrorMsg] = React.useState("");

  // Initialize Facebook SDK
  React.useEffect(() => {
    if (typeof window !== "undefined" && !window.fbInitialized) {
      window.fbInitialized = true;
      if (window.FB) {
        window.FB.init({
          appId: FB_APP_ID,
          xfbml: false,
          version: "v19.0",
        });
      }
    }
  }, []);

  // Get the main car image (prefer enhanced)
  const getMainImage = () => {
    if (enhancedUrls && enhancedUrls.length > 0 && enhancedUrls[0]) {
      return enhancedUrls[0];
    }
    if (photos && photos.length > 0 && photos[0]?.previewUrl) {
      return photos[0].previewUrl;
    }
    return null;
  };

  // Build post text from advert
  const buildPostText = () => {
    const ad = advert?.[language] || advert?.en;
    if (!ad) return "";

    const title = form.year && form.make && form.model 
      ? `${form.year} ${form.make} ${form.model}`
      : "Check out this car listing!";

    const lines = [
      `🚗 ${title}`,
      "",
      ad.short_caption || "",
      "",
      form.asking_price_thb 
        ? `💰 Price: ฿${Number(form.asking_price_thb).toLocaleString()}`
        : "",
      form.mileage_km 
        ? `📍 Mileage: ${Number(form.mileage_km).toLocaleString()} km`
        : "",
    ];

    return lines.filter(Boolean).join("\n");
  };

  const handlePublish = async () => {
    if (!window.FB) {
      setErrorMsg("Facebook SDK not loaded. Please refresh the page.");
      setStage("error");
      return;
    }

    setStage("auth");
    setErrorMsg("");

    try {
      // Step 1: Login and get access token
      window.FB.login(
        (response) => {
          if (response.authResponse) {
            // Step 2: Post to user's feed
            postToFeed(response.authResponse.accessToken);
          } else {
            setErrorMsg("You cancelled the login. Please try again.");
            setStage("error");
          }
        },
        { 
          scope: "pages_manage_posts,pages_read_user_content,publish_to_pages",
          return_scopes: true 
        }
      );
    } catch (err) {
      setErrorMsg(err?.message || "An error occurred.");
      setStage("error");
    }
  };

  const postToFeed = (accessToken) => {
    setStage("posting");
    const postText = buildPostText();
    const mainImage = getMainImage();

    // Build the post object
    const postData = {
      message: postText,
      access_token: accessToken,
    };

    // If we have an image, add it
    if (mainImage) {
      postData.picture = mainImage;
      postData.link = window.location.href;
    }

    // Post to user's feed
    window.FB.api(
      "/me/feed",
      "POST",
      postData,
      function (response) {
        if (response && !response.error) {
          setStage("done");
        } else {
          const errorMessage = response?.error?.message || "Failed to post to Facebook";
          setErrorMsg(errorMessage);
          setStage("error");
        }
      }
    );
  };

  const handleClose = () => {
    setStage("idle");
    setErrorMsg("");
    onClose();
  };

  const handleDone = () => {
    setStage("idle");
    setErrorMsg("");
    onClose();
  };

  if (!open) return null;

  return (
    <Modal onClose={handleClose}>
      <ModalHeader
        title="Post to Facebook"
        subtitle="Share your car listing to your Facebook timeline"
        onClose={handleClose}
      />

      {stage === "idle" && (
        <>
          <ModalContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-400/30 bg-blue-50/10 p-4">
                <p className="text-sm text-blue-200">
                  Click below to authorize and automatically post your car listing to your Facebook timeline.
                </p>
              </div>

              {form.year && form.make && form.model && (
                <div className="rounded-lg bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white mb-2">
                    {form.year} {form.make} {form.model}
                    {form.trim && ` ${form.trim}`}
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {advert?.[language]?.short_caption ||
                      advert?.en?.short_caption ||
                      "Beautiful car listing awaiting your post"}
                  </p>
                </div>
              )}

              {getMainImage() && (
                <div className="rounded-lg overflow-hidden border border-white/10">
                  <img
                    src={getMainImage()}
                    alt="Car preview"
                    className="w-full h-32 object-cover"
                  />
                </div>
              )}
            </div>
          </ModalContent>

          <ModalFooter>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-600 bg-gray-800/50 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePublish}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <FaFacebook className="h-4 w-4" />
              Post to Facebook
            </button>
          </ModalFooter>
        </>
      )}

      {stage === "auth" && (
        <>
          <ModalContent>
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-300">Connecting to Facebook...</p>
            </div>
          </ModalContent>
        </>
      )}

      {stage === "posting" && (
        <>
          <ModalContent>
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <FaSpinner className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm text-gray-300">Posting to your timeline...</p>
            </div>
          </ModalContent>
        </>
      )}

      {stage === "done" && (
        <>
          <ModalContent>
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <FaCircleCheck className="h-12 w-12 text-emerald-500" />
              <p className="text-sm font-semibold text-white">
                Posted to Facebook!
              </p>
              <p className="text-xs text-gray-400 text-center">
                Your car listing is now on your Facebook timeline.
              </p>
            </div>
          </ModalContent>

          <ModalFooter>
            <button
              type="button"
              onClick={handleDone}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Done
            </button>
          </ModalFooter>
        </>
      )}

      {stage === "error" && (
        <>
          <ModalContent>
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <FaTriangleExclamation className="h-12 w-12 text-red-500" />
              <p className="text-sm font-semibold text-white">Error</p>
              <p className="text-xs text-gray-300 text-center">{errorMsg}</p>
            </div>
          </ModalContent>

          <ModalFooter>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-600 bg-gray-800/50 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePublish}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <FaFacebook className="h-4 w-4" />
              Try Again
            </button>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
