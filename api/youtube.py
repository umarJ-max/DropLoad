from http.server import BaseHTTPRequestHandler
import json
import yt_dlp


def get_video_info(url):
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    title     = info.get("title", "YouTube Video")
    thumbnail = info.get("thumbnail", "")
    formats   = info.get("formats", [])

    qualities = []
    seen = set()

    for f in formats:
        if f.get("vcodec") == "none" or f.get("acodec") == "none":
            continue
        height = f.get("height")
        furl   = f.get("url")
        if not furl or not height:
            continue
        label = f"{height}p"
        if label in seen:
            continue
        seen.add(label)
        tbr      = f.get("tbr")
        filesize = f.get("filesize") or f.get("filesize_approx")
        if tbr:
            size_str = f"{round(tbr)} kbps"
        elif filesize:
            size_str = f"{round(filesize / 1048576, 1)} MB"
        else:
            size_str = "MP4"
        qualities.append({
            "label": label,
            "size":  size_str,
            "url":   furl,
        })

    qualities.sort(key=lambda x: int(x["label"].replace("p", "")), reverse=True)

    if not qualities:
        raise ValueError("No downloadable formats found.")

    # Also grab best audio-only for audio download option
    audio_url = None
    for f in reversed(formats):
        if f.get("vcodec") == "none" and f.get("acodec") != "none" and f.get("url"):
            audio_url = f.get("url")
            break

    return {
        "title":     title,
        "thumbnail": thumbnail,
        "qualities": qualities,
        "audioUrl":  audio_url,
    }


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

        try:
            data = json.loads(body)
        except Exception:
            self._json(400, {"error": "Invalid JSON."})
            return

        url = data.get("url", "").strip()
        if not url:
            self._json(400, {"error": "No URL provided."})
            return

        if not any(x in url for x in ["youtube.com", "youtu.be"]):
            self._json(400, {"error": "Not a YouTube URL."})
            return

        try:
            result = get_video_info(url)
            self._json(200, {
                "success":   True,
                "platform":  "YouTube",
                "title":     result["title"],
                "thumbnail": result["thumbnail"],
                "videoUrl":  result["qualities"][0]["url"],
                "audioUrl":  result["audioUrl"],
                "qualities": result["qualities"],
            })
        except ValueError as e:
            self._json(404, {"error": str(e)})
        except Exception as e:
            self._json(500, {"error": f"Could not extract video: {str(e)}"})

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
