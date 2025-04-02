import os
import logging
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import WebshareProxyConfig

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Load environment variables from the .env file
try:
    load_dotenv()
    logger.info("Environment variables loaded successfully.")
except Exception as e:
    logger.error("Failed to load environment variables: %s", e)
    raise

# Retrieve the environment variables
proxy_username = os.getenv("WEBSHARE_PROXY_USERNAME")
proxy_password = os.getenv("WEBSHARE_PROXY_PASSWORD")

if not proxy_username or not proxy_password:
    logger.error(
        "Proxy credentials are missing. Please check your environment variables."
    )
    raise EnvironmentError("Missing proxy credentials in environment variables.")

# Initialize the YouTubeTranscriptApi with proxy configuration
try:
    ytt_api = YouTubeTranscriptApi(
        proxy_config=WebshareProxyConfig(
            proxy_username=proxy_username,
            proxy_password=proxy_password,
        )
    )
    logger.info("YouTubeTranscriptApi initialized successfully.")
except Exception as e:
    logger.error("Failed to initialize YouTubeTranscriptApi: %s", e)
    raise

app = Flask(__name__)


@app.route("/transcript", methods=["GET"])
def get_transcript():
    video_id = request.args.get("video_id")
    if not video_id:
        logger.warning("Request missing video_id parameter.")
        return jsonify({"error": "The video_id query parameter is required."}), 400

    logger.info("Fetching transcript for video_id: %s", video_id)
    try:
        transcript = ytt_api.fetch(video_id)
        logger.info("Transcript fetched successfully for video_id: %s", video_id)
        return jsonify({"has_transcript": True, "transcript": transcript})
    except Exception as e:
        error_message = str(e)
        # Check for the specific error message indicating subtitles are disabled
        if "Could not retrieve a transcript for the video" in error_message:
            logger.warning(
                "Transcript not available for video_id %s: %s", video_id, error_message
            )
            return jsonify({"has_transcript": False}), 200
        else:
            logger.error(
                "Error fetching transcript for video_id %s: %s",
                video_id,
                error_message,
                exc_info=True,
            )
            return (
                jsonify({"error": f"Failed to fetch transcript: {error_message}"}),
                500,
            )


if __name__ == "__main__":
    try:
        logger.info("Starting Flask app on 0.0.0.0:5000")
        app.run(host="0.0.0.0", port=5000)
    except Exception as e:
        logger.critical("Failed to start Flask app: %s", e, exc_info=True)
        raise
