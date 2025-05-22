import os
import uuid
import threading
import configparser
from flask import Flask, request, send_from_directory, jsonify, render_template, redirect, url_for
from spotipy import Spotify
from spotipy.oauth2 import SpotifyClientCredentials
from spotify_to_mp3 import find_and_download_songs

# Suppress Spotipy destructor warning
SpotifyClientCredentials._session = None

# Load config
cfg = configparser.ConfigParser()
cfg.read('config.ini')
CLIENT_ID     = cfg.get('Settings', 'client_id')
CLIENT_SECRET = cfg.get('Settings', 'client_secret')
FFMPEG_PATH   = cfg.get('Settings', 'ffmpeg_path', fallback=None)
if FFMPEG_PATH:
    os.environ['PATH'] += os.pathsep + os.path.dirname(FFMPEG_PATH)

app = Flask(__name__, static_folder='static', template_folder='static')
DOWNLOAD_DIR = os.path.abspath('downloads')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


def schedule_delete(path, delay=600):
    """Delete file at path after delay seconds"""
    def _del():
        try:
            os.remove(path)
        except OSError:
            pass
    threading.Timer(delay, _del).start()


def convert_and_notify(spotify_url: str, job_id: str):
    # Prepare reference file
    ref_txt = os.path.join(DOWNLOAD_DIR, f"{job_id}.txt")

    # Authenticate & write track info
    auth = SpotifyClientCredentials(client_id=CLIENT_ID,
                                    client_secret=CLIENT_SECRET)
    sp = Spotify(auth_manager=auth)
    tid = spotify_url.rstrip('/').split('/')[-1].split('?')[0]
    track = sp.track(tid)
    line = (
        f"{track['name']},"
        f"{track['artists'][0]['name']},"
        f"{spotify_url},"
        f"{track['album']['images'][0]['url']}\n"
    )
    with open(ref_txt, 'w', encoding='utf-8') as f:
        f.write(line)

    # Download & convert (outputs {job_id}_0.mp3) :contentReference[oaicite:1]{index=1}
    find_and_download_songs(ref_txt)

    # Schedule auto-deletion of reference file
    schedule_delete(ref_txt)


@app.route('/')
def home():
    return redirect(url_for('static', filename='index.html'))


@app.route('/convert', methods=['GET', 'POST'])
def convert():
    if request.method == 'POST':
        spotify_url = request.form.get('spotify_url', '').strip()
        if not spotify_url:
            return jsonify({'error': 'No URL provided.'}), 400

        # 1) generate job ID (still used for the temp .txt)
        job_id = uuid.uuid4().hex

        # 2) fetch metadata
        auth = SpotifyClientCredentials(client_id=CLIENT_ID,
                                        client_secret=CLIENT_SECRET)
        sp = Spotify(auth_manager=auth)
        tid = spotify_url.rstrip('/').split('/')[-1].split('?')[0]
        try:
            track = sp.track(tid)
        except Exception:
            return jsonify({'error': 'Invalid Spotify URL or track not found.'}), 400

        name      = track['name']
        artist    = track['artists'][0]['name']
        album_art = track['album']['images'][0]['url']

        # 3) perform conversion (this writes downloads/_0.webm → downloads/_0.mp3)
        try:
            convert_and_notify(spotify_url, job_id)
        except Exception as e:
            msg = str(e)
            if 'ffmpeg' in msg.lower():
                msg = 'ffmpeg not found; check your config.ini'
            return jsonify({'error': msg}), 500

        # 4) schedule deletion of the output file (_0.mp3)
        output_path = os.path.join(DOWNLOAD_DIR, '_0.mp3')
        schedule_delete(output_path)

        # 5) respond with fixed download URL and metadata
        download_url = url_for('download', filename='_0.mp3')
        return jsonify({
            'download_url': download_url,
            'name': name,
            'artist': artist,
            'album_art': album_art
        })

    # GET → render converter page
    return render_template('converter.html')


@app.route('/download/<path:filename>')
def download(filename):
    return send_from_directory(DOWNLOAD_DIR, filename, as_attachment=True)


if __name__ == '__main__':
    app.run(debug=True)
