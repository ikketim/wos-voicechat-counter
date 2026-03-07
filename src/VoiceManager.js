const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');
const { EmbedBuilder } = require('discord.js');
const { TTSService } = require('./TTSService');
const fs = require('fs');
const path = require('path');

class VoiceManager {

  constructor(client) {
    this.client = client;
    this.connections = new Map();
    this.audioPlayers = new Map();
    this.countdownTimers = new Map();
    this.ttsService = new TTSService();
    this.ttsService.setProvider('local');
  }

  async joinVoiceChannel(interaction) {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      throw new Error('You need to be in a voice channel to use this command!');
    }

    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      const audioPlayer = createAudioPlayer();
      connection.subscribe(audioPlayer);

      this.connections.set(interaction.guildId, connection);
      this.audioPlayers.set(interaction.guildId, audioPlayer);

      // Log state changes for debugging
      connection.on('stateChange', (oldState, newState) => {
        console.log(`Voice connection state: ${oldState.status} -> ${newState.status}`);
      });

      connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('Voice connection ready');
      });

      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          connection.destroy();
          this.connections.delete(interaction.guildId);
          this.audioPlayers.delete(interaction.guildId);
        }
      });

      return connection;

    } catch (error) {
      throw new Error(`Failed to join voice channel: ${error.message}`);
    }
  }

  leaveVoiceChannel(guildId) {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
      this.audioPlayers.delete(guildId);

      const timer = this.countdownTimers.get(guildId);
      if (timer) {
        clearTimeout(timer);
        this.countdownTimers.delete(guildId);
      }
    }
  }

  async startAttackCountdown(interaction, attackTiming) {
    if (!this.connections.has(interaction.guildId)) {
      throw new Error('Bot is not in a voice channel. Use /join first.');
    }

    const { players, totalDuration } = attackTiming;

    const groupText = attackTiming.attackGroup ? `Attack Group ${attackTiming.attackGroup}` : 'All Groups';
    const embed = new EmbedBuilder()
      .setTitle('🚀 Attack Sequence Initiated!')
      .setColor('#FF6B6B')
      .setDescription(`**${groupText}**\n**Total Duration:** ${totalDuration} seconds\n**Players:** ${players.length}`)
      .addFields(
        players.map(player => ({
          name: `Player ${player.attackOrder}: ${player.name} (Group ${player.attackGroup})`,
          value: `Starts in: **${player.attackStartTime}s** | Arrives in: **${player.timeToDestination}s**`,
          inline: false
        }))
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    await this.playSynchronizedCountdown(interaction.guildId, players, totalDuration);
  }

  async stopAttackCountdown(interaction) {
    const guildId = interaction.guildId;

    const timer = this.countdownTimers.get(guildId);
    if (timer) {
      clearTimeout(timer);
      this.countdownTimers.delete(guildId);
    }

    const audioPlayer = this.audioPlayers.get(guildId);
    if (audioPlayer) {
      audioPlayer.stop();
    }

    this.countdownTimers.delete(guildId);
    return true;
  }

  isCountdownActive(guildId) {
    return this.countdownTimers.has(guildId);
  }

  async playSynchronizedCountdown(guildId, players, totalDuration) {
    const connection = this.connections.get(guildId);
    const audioPlayer = this.audioPlayers.get(guildId);

    if (!connection || !audioPlayer) {
      throw new Error('Voice connection not available');
    }

    try {
      // Wait for connection to be fully ready
      if (connection.state.status !== VoiceConnectionStatus.Ready) {
        console.log('Waiting for voice connection to be ready...');
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      }
      console.log('Connection is ready, generating audio...');

      const audioResource = await this.ttsService.generateSynchronizedCountdown(players, totalDuration);

      if (audioResource) {
        // Re-subscribe to ensure player is still attached
        connection.subscribe(audioPlayer);

        const countdownTimer = setTimeout(() => {
          this.countdownTimers.delete(guildId);
        }, (totalDuration + 5) * 1000);

        this.countdownTimers.set(guildId, countdownTimer);

        audioPlayer.play(audioResource);
        console.log('Audio playing, player status:', audioPlayer.state.status);

        return new Promise((resolve) => {
          audioPlayer.once(AudioPlayerStatus.Idle, () => {
            this.countdownTimers.delete(guildId);
            resolve();
          });
          audioPlayer.once('error', (err) => {
            console.error('Audio player error during playback:', err.message);
            resolve();
          });
        });

      } else {
        throw new Error('Failed to generate countdown audio');
      }

    } catch (error) {
      console.error('Synchronized countdown error:', error);
      throw error;
    }
  }

  async speakText(audioPlayer, text) {
    try {
      const audioResource = await this.ttsService.generateSpeech(text);
      if (audioResource) {
        audioPlayer.play(audioResource);
        return new Promise((resolve) => {
          audioPlayer.once(AudioPlayerStatus.Idle, resolve);
        });
      } else {
        await this.delay(500);
      }
    } catch (error) {
      console.error('TTS error:', error);
      console.log(`🔊 TTS Fallback: ${text}`);
      await this.delay(500);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isInVoiceChannel(guildId) {
    return this.connections.has(guildId);
  }

  getConnection(guildId) {
    return this.connections.get(guildId);
  }
}

module.exports = { VoiceManager };
