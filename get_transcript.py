from flask import Flask, request, jsonify

from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)


@app.route("/transcript", methods=["GET"])
def get_transcript():
    video_id = request.args.get("video_id")
    if not video_id:
        return jsonify({"error": "The video_id query parameter is required."}), 400

    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        # transcript = [
        #     {
        #         "duration": 6.479,
        #         "start": 0.32,
        #         "text": "welcome back today we are going to enter",
        #     },
        #     {
        #         "duration": 6.041,
        #         "start": 3.439,
        #         "text": "the Luv tier to do that the first thing",
        #     },
        # ]
        return jsonify(transcript)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
