// Adapted from Speaking v0.6.2: prefer Opus, fall back to MP4 for Safari/iPad.
export class LocalRecorder {
  constructor() { this.mediaRecorder = null; this.stream = null; this.chunks = []; this.url = ""; }
  static isSupported() { return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }
  async start() {
    if (!LocalRecorder.isSupported()) throw new Error("recordingUnsupported");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = {};
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) options.mimeType = "audio/webm;codecs=opus";
    else if (MediaRecorder.isTypeSupported("audio/mp4")) options.mimeType = "audio/mp4";
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream, options);
    this.mediaRecorder.addEventListener("dataavailable", (event) => { if (event.data.size) this.chunks.push(event.data); });
    this.mediaRecorder.start();
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state !== "recording") return resolve(null);
      this.mediaRecorder.addEventListener("stop", () => {
        const type = this.mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type });
        this.releaseStream();
        if (this.url) URL.revokeObjectURL(this.url);
        this.url = URL.createObjectURL(blob);
        resolve({ blob, url: this.url, type });
      }, { once: true });
      this.mediaRecorder.stop();
    });
  }
  releaseStream() { this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null; }
  clear() { this.releaseStream(); if (this.url) URL.revokeObjectURL(this.url); this.url = ""; this.chunks = []; }
}
