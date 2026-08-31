// public/app.js - frontend voice capture + send + TTS confirmation
(() => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const sendBtn = document.getElementById('sendBtn');
  const transcriptEl = document.getElementById('transcript');
  const logEl = document.getElementById('log');

  let recognition = null;
  let finalTranscript = '';

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    transcriptEl.textContent = 'SpeechRecognition not supported in this browser. Use Chrome or Edge (desktop) for best support.';
  } else {
    recognition = new SpeechRecognition();
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.continuous = true;

    recognition.onresult = (event) => {
      let interim = '';
      finalTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        const r = event.results[i];
        if (r.isFinal) finalTranscript += r[0].transcript;
        else interim += r[0].transcript;
      }
      transcriptEl.textContent = finalTranscript + '\n' + interim;
    };

    recognition.onerror = (e) => {
      log('Recognition error: ' + e.error);
    };

    recognition.onend = () => {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      log('Recognition stopped');
    };
  }

  startBtn.addEventListener('click', () => {
    if (!recognition) return;
    finalTranscript = '';
    transcriptEl.textContent = '';
    recognition.start();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    log('Listening...');
  });

  stopBtn.addEventListener('click', () => {
    if (!recognition) return;
    recognition.stop();
  });

  sendBtn.addEventListener('click', async () => {
    const text = (finalTranscript || transcriptEl.textContent || '').trim();
    if (!text) return alert('No transcript to send. Speak first or paste text.');
    log('Sending: ' + text);
    try {
      const resp = await fetch('/api/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const j = await resp.json();
      if (!j) throw new Error('No response');
      const spoken = j.spoken || (j.intent && j.intent.reply_text) || 'Done.';
      log('Server: ' + JSON.stringify(j));
      speak(spoken);
    } catch (e) {
      log('Error: ' + e.message);
      speak('Sorry, I failed to process the command.');
    }
  });

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      log('No speechSynthesis support. Showing text: ' + text);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function log(msg) {
    const t = new Date().toLocaleTimeString();
    logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
  }
})();
