// Elements
const fileInput    = document.getElementById('file-input');
const audioPlayer  = document.getElementById('audio-player');
const canvas       = document.getElementById('vis-canvas');
const ctx          = canvas.getContext('2d');
const modeSel      = document.getElementById('vis-mode');
const colorPick    = document.getElementById('vis-color');
const speedControl = document.getElementById('speed-control');
const speedDisplay = document.getElementById('speed-display');

let audioCtx, analyser, source, dataArray, timeArray;
let frame = 0;

// File load & audio setup
fileInput.addEventListener('change', () => {
  if (audioCtx) audioCtx.close();
  const file = fileInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);

  audioPlayer.src = url;
  audioPlayer.play();
  speedControl.dispatchEvent(new Event('input'));

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.95;
  source = audioCtx.createMediaElementSource(audioPlayer);
  source.connect(analyser);
  analyser.connect(audioCtx.destination);

  const len = analyser.frequencyBinCount;
  dataArray = new Uint8Array(len);
  timeArray = new Uint8Array(len);

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(draw);
});

// Speed control
speedControl.addEventListener('input', () => {
  const v = parseFloat(speedControl.value);
  audioPlayer.playbackRate = v;
  speedDisplay.textContent = v.toFixed(1) + '×';
});

// Handle high-DPI
function resizeCanvas() {
  canvas.width  = canvas.parentElement.clientWidth * devicePixelRatio;
  canvas.height = canvas.parentElement.clientHeight * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);
}

// Main render
function draw() {
  frame++;
  requestAnimationFrame(draw);

  const W = canvas.parentElement.clientWidth;
  const H = canvas.parentElement.clientHeight;

  // fade
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(0, 0, W, H);

  // glow & smoothing
  ctx.shadowBlur = 12;
  ctx.shadowColor = colorPick.value;
  ctx.lineCap = 'round';

  const mode = modeSel.value;
  const accent = colorPick.value;

  // ── Bars Mode ──
  if (mode === 'bars') {
    analyser.getByteFrequencyData(dataArray);
    const base = W / dataArray.length;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 255;
      const barH = v * H;
      const scale = 1 + (i / dataArray.length) * 1.5;
      const bw = base * scale;
      const x = i * base - (bw - base) / 2;
      const grad = ctx.createLinearGradient(0, H - barH, 0, H);
      grad.addColorStop(0, '#000');
      grad.addColorStop(0.8, accent);
      grad.addColorStop(1, '#fff');
      ctx.fillStyle = grad;
      ctx.globalAlpha = v + 0.2;
      ctx.fillRect(x, H - barH, bw, barH);
    }
  }

  // ── Waveform Mode ──
  else if (mode === 'waveform') {
    analyser.getByteTimeDomainData(timeArray);
    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const slice = W / (timeArray.length - 1);
    for (let i = 0; i < timeArray.length; i++) {
      const v = timeArray[i] / 128 - 1;
      const y = H / 2 + v * H * 0.4;
      const x = i * slice;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H / 2);
    ctx.stroke();
  }

  // ── Rainbow Ripple ──
  else if (mode === 'rainbow') {
    const cx1 = W * 0.2, cy = H / 2, cx2 = W * 0.8;
    const maxR = Math.min(W, H) * 0.4, rings = 12, spd = 2;
    for (let j = 0; j < 2; j++) {
      const cx = j ? cx2 : cx1;
      for (let i = 0; i < rings; i++) {
        const r = ((frame * spd + i * (maxR / rings)) % maxR) + 20;
        const hue = (i * (360 / rings) + frame * 1.5) % 360;
        ctx.lineWidth = 3;
        ctx.strokeStyle = `hsl(${hue},100%,60%)`;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    analyser.getByteTimeDomainData(timeArray);
    for (let i = 0; i < 199; i++) {
      const t1 = timeArray[Math.floor((i / 200) * timeArray.length)] / 128 - 1;
      const t2 = timeArray[Math.floor(((i + 1) / 200) * timeArray.length)] / 128 - 1;
      const x1 = cx1 + (cx2 - cx1) * (i / 199);
      const x2 = cx1 + (cx2 - cx1) * ((i + 1) / 199);
      const y1 = cy + t1 * (H * 0.35);
      const y2 = cy + t2 * (H * 0.35);
      const hue = (i * (360 / 200) + frame * 2) % 360;
      ctx.lineWidth = 4;
      ctx.strokeStyle = `hsl(${hue},100%,70%)`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  // ── Retro Synth-Wave Mode ──
  else if (mode === 'retro') {
    const horizon = H * 0.4, halfW = W / 2, lines = 30;
    ctx.strokeStyle = 'rgba(200,50,200,0.3)';
    ctx.lineWidth = 1;

    // horizontal grid
    for (let i = 1; i < lines; i++) {
      const y = horizon + (H - horizon) * (i / lines);
      const span = halfW * (1 - i / lines);
      ctx.beginPath();
      ctx.moveTo(halfW - span, y);
      ctx.lineTo(halfW + span, y);
      ctx.stroke();
    }
    // vertical converging lines
    for (let i = -10; i <= 10; i++) {
      const x = halfW + i * (W / 20);
      ctx.beginPath();
      ctx.moveTo(halfW, horizon);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // neon sun
    const sunR = W * 0.2 * (0.8 + 0.2 * Math.sin(frame * 0.01));
    const grd = ctx.createRadialGradient(
      halfW, horizon, sunR * 0.1,
      halfW, horizon, sunR
    );
    grd.addColorStop(0, 'rgba(255,150,0,0.8)');
    grd.addColorStop(1, 'rgba(255,50,100,0.2)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(halfW, horizon, sunR, 0, Math.PI * 2);
    ctx.fill();

    // horizon peaks
    analyser.getByteFrequencyData(dataArray);
    const slice = W / dataArray.length;
    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 255;
      const hval = v * H * 0.15;
      const x = i * slice;
      const hue = Math.floor(330 * (i / dataArray.length));
      ctx.fillStyle = `hsl(${hue},100%,60%)`;
      ctx.fillRect(x, horizon - hval, slice * 0.8, hval);
    }
  }

  // reset for next frame
  ctx.globalAlpha = 1;
  ctx.shadowBlur   = 0;
}

// ── Download MP4 Button ──
const downloadBtn = document.getElementById('download-btn');
let mediaRecorder, recordedChunks = [];

// When user clicks, record entire playthrough, then auto-download.
downloadBtn.addEventListener('click', () => {
  if (!audioPlayer.src) return alert('Please load a file first.');

  // Disable button & prepare recorder
  downloadBtn.disabled   = true;
  downloadBtn.textContent = 'Preparing…';

  // 1) video from canvas
  const videoStream = canvas.captureStream(30);

  // 2) audio from WebAudio graph
  const destination = audioCtx.createMediaStreamDestination();
  source.connect(destination);
  const audioStream = destination.stream;

  // 3) combine tracks
  const combined = new MediaStream([
    ...videoStream.getVideoTracks(),
    ...audioStream.getAudioTracks()
  ]);

  // 4) start MediaRecorder
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(combined, { mimeType: 'video/mp4' });
  mediaRecorder.ondataavailable = e => {
    if (e.data.size) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    // Build blob & trigger download
    const blob = new Blob(recordedChunks, { type: 'video/mp4' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'visualizer.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();

    // cleanup & reset UI
    downloadBtn.disabled   = false;
    downloadBtn.textContent = 'Download MP4';
  };

  mediaRecorder.start();
  downloadBtn.textContent = 'Recording…';

  // 5) when audio ends, stop recorder
  audioPlayer.onended = () => {
    mediaRecorder.stop();
    source.disconnect(destination);  // avoid leaks
  };

  // 6) also start playback from beginning
  audioPlayer.currentTime = 0;
  audioPlayer.play();
});
