import os
import json
import googleapiclient.discovery
from dotenv import load_dotenv

load_dotenv()

allow_fetching = False

# Configuration constants
CACHE_DIR = "cache"
CACHE_FILE = os.path.join(CACHE_DIR, "youtube_uploads_cache.json")
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"
DEVELOPER_KEY = os.getenv("YOUTUBE_DEVELOPER_KEY")


def load_cache():
    """Load the cache from the CACHE_FILE if it exists."""
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    """Save the cache dictionary to CACHE_FILE."""
    # Ensure the cache directory exists.
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)


def get_channel_uploads(channel_id):
    """
    Retrieves all video IDs and titles from the specified channel's uploads playlist.
    First checks the cache; if not found, it uses the YouTube API to fetch the data.
    """
    # Load cached data if available
    cache = load_cache()
    if channel_id in cache:
        print(f"Using cached uploads for channel id {channel_id}")
        return cache[channel_id]

    if not allow_fetching:
        print(
            f"allow_fetching is False, but channel with id {channel_id} was not in cache"
        )
        exit(1)

    # Build the YouTube API client
    youtube = googleapiclient.discovery.build(
        API_SERVICE_NAME, API_VERSION, developerKey=DEVELOPER_KEY
    )

    # Retrieve the channel's content details to get the uploads playlist ID
    request = youtube.channels().list(part="contentDetails", id=channel_id)
    response = request.execute()
    uploads_playlist_id = response["items"][0]["contentDetails"]["relatedPlaylists"][
        "uploads"
    ]

    # Retrieve video IDs and titles from the uploads playlist
    videos = []
    nextPageToken = None
    while True:
        playlist_request = youtube.playlistItems().list(
            part="snippet",
            playlistId=uploads_playlist_id,
            maxResults=50,
            pageToken=nextPageToken,
        )
        playlist_response = playlist_request.execute()
        for item in playlist_response["items"]:
            video_id = item["snippet"]["resourceId"]["videoId"]
            title = item["snippet"]["title"]
            videos.append({"video_id": video_id, "title": title})
        nextPageToken = playlist_response.get("nextPageToken")
        if not nextPageToken:
            break

    # Cache the results to avoid re-fetching in future runs
    cache[channel_id] = videos
    save_cache(cache)
    return videos


def main():
    # Replace with your desired channel ID

    # https://www.youtube.com/@AverageGregTechPlayer/videos
    channel_id = "UCv6GlCIlfC9hLW8shg4cRyw"

    # https://www.youtube.com/@Kharax82/videos
    # channel_id = "UCapAxx_bMPdOEl2SQxg2HAw"

    videos = get_channel_uploads(channel_id)

    print("Retrieved videos:")
    for video in videos:
        print(f"ID: {video['video_id']} | Title: {video['title']}")
        break
    print(f"Total videos: {len(videos)}")


if __name__ == "__main__":
    main()
