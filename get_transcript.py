import os
import json
from youtube_transcript_api import YouTubeTranscriptApi

allow_fetching = False

# Set the cache folder and file path.
CACHE_DIR = "cache"
CACHE_FILE = os.path.join(CACHE_DIR, "transcript_cache.json")


def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    # Ensure the cache directory exists.
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f)


def get_transcript(video_id):
    # Load any existing cache.
    cache = load_cache()

    # If transcript for this video_id is already cached, return it.
    if video_id in cache:
        print(f"Using cached transcript for video with id {video_id}")
        return cache[video_id]

    # Otherwise, fetch the transcript.
    if not allow_fetching:
        print(f"allow_fetching is False, but video with id {video_id} was not in cache")
        exit(1)
    print(f"Fetching transcript from YouTube for video with id {video_id}...")
    transcript = YouTubeTranscriptApi.get_transcript(video_id)

    # Save transcript to cache and update the file.
    cache[video_id] = transcript
    save_cache(cache)

    return transcript


if __name__ == "__main__":
    # GTNH S02E25: what the endgame actually plays like
    # https://www.youtube.com/watch?v=5qDfpWolFyg
    # video_id = "5qDfpWolFyg"

    # GTNH S02E10: assembly line automation
    # https://www.youtube.com/watch?v=N_0ay7YLcdI
    video_id = "N_0ay7YLcdI"

    # GregTech New Horizons S3 - 96 - Automated Titanium
    # https://www.youtube.com/watch?v=UpR4vGNkFhY
    # video_id = "UpR4vGNkFhY"

    fetched_transcript = get_transcript(video_id)

    # Print each snippet from the transcript.
    for snippet in fetched_transcript:
        print(snippet["text"])
        break
    print(f"Total snippets: {len(fetched_transcript)}")

    # with open("output.txt", "w") as file:
    #     for snippet in fetched_transcript:
    #         file.write(snippet["text"] + "\n")
