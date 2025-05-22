import os
import urllib.request
import yt_dlp
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, error


def find_and_download_songs(reference_file: str, prefix: str = ""):
    """
    Reads a reference file where each line has:
      name,artist,spotify_url,album_art_url
    Uses yt_dlp to search YouTube, download audio, convert to MP3,
    and embed cover art. Output files are named '<prefix>_<index>.mp3'.
    """
    download_dir = os.path.dirname(reference_file)
    job_id = os.path.basename(reference_file).rsplit('.', 1)[0]

    # Read reference line(s)
    with open(reference_file, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]
    if not lines:
        raise ValueError("Reference file is empty")

    for idx, line in enumerate(lines):
        parts = line.split(',', 3)
        if len(parts) < 4:
            print(f"Skipping malformed line: {line}")
            continue
        name, artist, _, album_art_url = parts

        # Download album art
        art_path = os.path.join(download_dir, f"{job_id}_{idx}.jpg")
        try:
            urllib.request.urlretrieve(album_art_url, art_path)
        except Exception:
            art_path = None

        # yt_dlp options: search + extract audio
        outtmpl = os.path.join(download_dir, f"{prefix}_{idx}.%(ext)s")
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': outtmpl,
            'default_search': 'ytsearch1',
            'noplaylist': True,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }

        search_term = f"{artist} - {name}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(search_term, download=True)

        # Verify MP3 creation
        mp3_path = os.path.join(download_dir, f"{prefix}_{idx}.mp3")
        if not os.path.isfile(mp3_path) or os.path.getsize(mp3_path) == 0:
            print(f"MP3 not created for {search_term}")
            if art_path and os.path.exists(art_path):
                os.remove(art_path)
            continue

        # Embed cover art if downloaded
        if art_path and os.path.exists(art_path):
            try:
                audio = MP3(mp3_path, ID3=ID3)
                if audio.tags is None:
                    audio.add_tags()
                with open(art_path, 'rb') as img_f:
                    audio.tags.add(
                        APIC(
                            encoding=3,
                            mime='image/jpeg',
                            type=3,
                            desc='Cover',
                            data=img_f.read()
                        )
                    )
                audio.save()
            except error:
                print(f"Failed to embed cover art for {search_term}")
            finally:
                os.remove(art_path)
