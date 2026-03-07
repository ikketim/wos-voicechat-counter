const { createAudioResource } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');

class TTSService {

  constructor() {
    this.provider = 'console';
    this.audioCache = new Map();
    this.numberLibrary = new Map();
    this.libraryInitialized = false;
    this.platform = process.platform;
    this.windowsVoice = null; // cached after first detection
  }

  setProvider(provider) {
    this.provider = provider;
  }

  // Detect the first available Windows SAPI voice (cached after first call)
  async getWindowsVoice() {
    if (this.windowsVoice !== null) return this.windowsVoice;
    return new Promise((resolve) => {
      const cmd = `powershell.exe -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name } | Select-Object -First 1"`;
      exec(cmd, (error, stdout) => {
        const voice = (!error && stdout.trim()) ? stdout.trim() : null;
        this.windowsVoice = voice;
        console.log(`🔊 Detected Windows voice: ${voice || '(system default)'}`);
        resolve(voice);
      });
    });
  }

  // Main TTS generation — skips say package, goes straight to platform-specific
  async generateCrossPlatformTTS(text, outputFile) {
    return this.generatePlatformSpecificTTS(text, outputFile);
  }

  // Platform-specific TTS
  async generatePlatformSpecificTTS(text, outputFile) {
    const platform = this.platform;

    if (platform === 'win32') {
      const voice = await this.getWindowsVoice();
      const selectVoice = voice ? `$synthesizer.SelectVoice('${voice}');` : '';
      const safeText = text.replace(/'/g, "''");
      // Escape backslashes for PowerShell string
      const safePath = outputFile.replace(/\\/g, '\\\\');
      const command = `powershell.exe -Command "Add-Type -AssemblyName System.Speech; $synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${selectVoice} $synthesizer.SetOutputToWaveFile('${safePath}'); $synthesizer.Speak('${safeText}'); $synthesizer.Dispose()"`;
      return new Promise((resolve, reject) => {
        exec(command, { timeout: 30000 }, (error) => {
          if (error) {
            reject(new Error(`Windows TTS failed for "${text}": ${error.message}`));
          } else if (!fs.existsSync(outputFile)) {
            reject(new Error(`Windows TTS ran but produced no file for "${text}"`));
          } else {
            resolve();
          }
        });
      });

    } else if (platform === 'darwin') {
      const safeText = text.replace(/"/g, '\\"');
      const command = `say -o "${outputFile}" -v "Samantha" -r 170 "${safeText}"`;
      return new Promise((resolve, reject) => {
        exec(command, (error) => {
          if (error) reject(new Error(`macOS TTS failed: ${error.message}`));
          else resolve();
        });
      });

    } else {
      // Linux / Docker / unknown — try espeak first, then festival
      const safeText = text.replace(/"/g, '\\"');
      return new Promise((resolve, reject) => {
        exec(`espeak -w "${outputFile}" "${safeText}"`, (error) => {
          if (!error) return resolve();
          exec(`echo "${safeText}" | festival --tts --output "${outputFile}"`, (error2) => {
            if (!error2) return resolve();
            reject(new Error(`All TTS engines failed. espeak: ${error.message} | festival: ${error2.message}`));
          });
        });
      });
    }
  }

  // Initialize the number library (pre-generate numbers 1-200)
  async initializeNumberLibrary() {
    if (this.libraryInitialized) return;

    try {
      const ffmpegPath = require('ffmpeg-static');
      const libraryDir = path.join(__dirname, '../temp/library');
      if (!fs.existsSync(libraryDir)) fs.mkdirSync(libraryDir, { recursive: true });

      const runFfmpeg = (args) => new Promise((resolve, reject) => {
        execFile(ffmpegPath, args, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve();
        });
      });

      console.log('🔊 Initializing number library (1-200)...');

      for (let i = 1; i <= 200; i++) {
        const numberFile = path.join(libraryDir, `${i}.wav`);
        if (fs.existsSync(numberFile)) {
          this.numberLibrary.set(i, numberFile);
          continue;
        }

        const rawFile = path.join(libraryDir, `raw_${i}.wav`);
        try {
          await this.generateCrossPlatformTTS(`${i}.`, rawFile);
          await runFfmpeg(['-y', '-i', rawFile, '-af', 'apad=pad_dur=1,atrim=0:1', '-ar', '48000', '-ac', '2', '-sample_fmt', 's16', numberFile]);
          try { fs.unlinkSync(rawFile); } catch (_) {}
          this.numberLibrary.set(i, numberFile);
        } catch (numErr) {
          console.warn(`⚠️ Failed to generate number ${i}, skipping: ${numErr.message}`);
          try { fs.unlinkSync(rawFile); } catch (_) {}
        }
      }

      this.libraryInitialized = true;
      console.log('✅ Number library initialized!');

    } catch (error) {
      console.error('❌ Failed to initialize number library:', error);
      throw error;
    }
  }

  // Generate speech from text
  async generateSpeech(text, options = {}) {
    switch (this.provider) {
      case 'console': return this.consoleTTS(text);
      case 'local':   return this.localTTS(text, options);
      case 'google':  return this.googleTTS(text, options);
      case 'azure':   return this.azureTTS(text, options);
      case 'polly':   return this.amazonPollyTTS(text, options);
      default:        return this.consoleTTS(text);
    }
  }

  async consoleTTS(text) {
    console.log(`🔊 TTS: ${text}`);
    return null;
  }

  buildCountdownCacheKey(players) {
    const normalized = [...players]
      .map(p => ({ name: String(p.name), t: Number(p.attackStartTime) }))
      .sort((a, b) => (a.t - b.t) || a.name.localeCompare(b.name));

    const payload = {
      v: 'sync-v7',
      platform: this.platform,
      players: normalized,
    };

    return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex');
  }

  async generateSynchronizedCountdown(players, totalDuration) {
    try {
      await this.initializeNumberLibrary();

      const cacheKey = this.buildCountdownCacheKey(players);
      const cachedPath = this.audioCache.get(cacheKey);
      if (cachedPath && fs.existsSync(cachedPath)) {
        return createAudioResource(cachedPath);
      }

      const ffmpegPath = require('ffmpeg-static');
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const runFfmpeg = (args) => new Promise((resolve, reject) => {
        execFile(ffmpegPath, args, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve();
        });
      });

      const firstPlayer = players.find(p => p.attackStartTime === 0) || players[0];
      const maxTime = Math.max(...players.map(p => p.attackStartTime));

      let introScript = `Synchronized attack sequence. ${firstPlayer.name} starts first. `;
      players.forEach((p) => {
        if (p.attackStartTime === 0) introScript += `${p.name} starts immediately. `;
        else introScript += `${p.name} starts at second ${p.attackStartTime}. `;
      });
      introScript += `${firstPlayer.name} ready. Three. Two. One. Go. `;

      const ts = Date.now();
      const introRaw = path.join(tempDir, `intro_raw_${ts}.wav`);
      const introFile = path.join(tempDir, `intro_${ts}.wav`);

      await this.generateCrossPlatformTTS(introScript, introRaw);
      await runFfmpeg(['-y', '-i', introRaw, '-ar', '48000', '-ac', '2', '-sample_fmt', 's16', introFile]);
      try { fs.unlinkSync(introRaw); } catch (_) {}

      const numberFiles = [];
      for (let i = 1; i <= maxTime; i++) {
        const numberFile = this.numberLibrary.get(i);
        if (numberFile && fs.existsSync(numberFile)) {
          numberFiles.push(numberFile);
        } else {
          console.warn(`Number ${i} not found in library, generating on the fly...`);
          const raw = path.join(tempDir, `raw_${i}_${ts}.wav`);
          const seg = path.join(tempDir, `seg_${i}_${ts}.wav`);
          await this.generateCrossPlatformTTS(`${i}.`, raw);
          await runFfmpeg(['-y', '-i', raw, '-af', 'apad=pad_dur=1,atrim=0:1', '-ar', '48000', '-ac', '2', '-sample_fmt', 's16', seg]);
          numberFiles.push(seg);
          try { fs.unlinkSync(raw); } catch (_) {}
        }
      }

      const finalRaw = path.join(tempDir, `final_raw_${ts}.wav`);
      const finalWav = path.join(tempDir, `final_${ts}.wav`);
      await this.generateCrossPlatformTTS("Sequence complete.", finalRaw);
      await runFfmpeg(['-y', '-i', finalRaw, '-ar', '48000', '-ac', '2', '-sample_fmt', 's16', finalWav]);
      try { fs.unlinkSync(finalRaw); } catch (_) {}

      const listFile = path.join(tempDir, `list_${ts}.txt`);
      const outputFile = path.join(tempDir, `sync_countdown_${cacheKey}.wav`);
      const concatFiles = [introFile, ...numberFiles, finalWav];
      fs.writeFileSync(listFile, concatFiles.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "\\'")}'`).join('\n'));

      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', outputFile]);

      try { fs.unlinkSync(introFile); } catch (_) {}
      try { fs.unlinkSync(finalWav); } catch (_) {}
      try { fs.unlinkSync(listFile); } catch (_) {}
      for (const f of numberFiles) {
        if (f.includes(`seg_${ts}`)) try { fs.unlinkSync(f); } catch (_) {}
      }

      this.audioCache.set(cacheKey, outputFile);
      return createAudioResource(outputFile);

    } catch (error) {
      console.error('Synchronized countdown error:', error);
      throw error;
    }
  }

  async localTTS(text, options = {}) {
    try {
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const outputFile = path.join(tempDir, `tts_${Date.now()}.wav`);
      await this.generateCrossPlatformTTS(text, outputFile);

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (fs.existsSync(outputFile)) {
            const audioResource = createAudioResource(outputFile);
            resolve(audioResource);
            setTimeout(() => {
              try { fs.unlinkSync(outputFile); } catch (_) {}
            }, 10000);
          } else {
            reject(new Error('Audio file was not created'));
          }
        }, 500);
      });

    } catch (error) {
      console.error('Local TTS error:', error);
      return this.consoleTTS(text);
    }
  }

  async googleTTS(text, options = {}) {
    console.log(`🔊 Google TTS: ${text}`);
    return null;
  }

  async azureTTS(text, options = {}) {
    console.log(`🔊 Azure TTS: ${text}`);
    return null;
  }

  async amazonPollyTTS(text, options = {}) {
    console.log(`🔊 Amazon Polly TTS: ${text}`);
    return null;
  }

  getAvailableProviders() {
    return ['console', 'local', 'google', 'azure', 'polly'];
  }

  isProviderAvailable(provider) {
    return this.getAvailableProviders().includes(provider);
  }

  getCurrentProvider() {
    return this.provider;
  }
}

module.exports = { TTSService };
