
// Audio Assets URLs (Using reliable CDNs for demo purposes)
const ASSETS = {
    // Relaxing Lo-Fi / Travel vibe
    bgm: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    // Crisp UI Click
    click: 'https://assets.mixkit.co/sfx/preview/mixkit-modern-technology-select-3124.mp3',
    // Success Chime (Standard Correct)
    correct: 'https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3',
    // Coin / Point Addictive Sound (Slot Filled)
    coin: 'https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3',
    // Combo / Double Kill
    combo: 'https://assets.mixkit.co/sfx/preview/mixkit-arcade-score-interface-217.mp3',
    // Error / Buzzer
    wrong: 'https://assets.mixkit.co/sfx/preview/mixkit-wrong-answer-fail-notification-946.mp3',
    // Transition Swoosh
    whoosh: 'https://assets.mixkit.co/sfx/preview/mixkit-quick-jump-arcade-game-239.mp3',
    // Game Over Fanfare
    gameOver: 'https://assets.mixkit.co/sfx/preview/mixkit-animated-small-group-applause-523.mp3'
  };
  
  type SoundType = 'click' | 'correct' | 'wrong' | 'whoosh' | 'gameOver' | 'coin' | 'combo';
  
  class AudioService {
    private bgm: HTMLAudioElement;
    private sfx: Record<SoundType, HTMLAudioElement>;
    private isBGMMuted: boolean = false;
    private isSFXMuted: boolean = false;
  
    constructor() {
      this.bgm = new Audio(ASSETS.bgm);
      this.bgm.loop = true;
      this.bgm.volume = 0.3; // Lower volume for background
  
      this.sfx = {
        click: new Audio(ASSETS.click),
        correct: new Audio(ASSETS.correct),
        coin: new Audio(ASSETS.coin),
        combo: new Audio(ASSETS.combo),
        wrong: new Audio(ASSETS.wrong),
        whoosh: new Audio(ASSETS.whoosh),
        gameOver: new Audio(ASSETS.gameOver)
      };
      
      // Preload SFX
      Object.values(this.sfx).forEach(audio => {
        audio.volume = 0.7; // Slightly louder SFX
        audio.load();
      });
    }

    // Toggle BGM and return new state
    toggleBGM(): boolean {
        this.isBGMMuted = !this.isBGMMuted;
        
        if (this.isBGMMuted) {
            this.bgm.pause();
        } else {
            // Resume/Play if unmuted
            this.bgm.play().catch(e => console.log("BGM play failed:", e));
        }
        
        return this.isBGMMuted;
    }

    // Toggle SFX and return new state
    toggleSFX(): boolean {
        this.isSFXMuted = !this.isSFXMuted;
        return this.isSFXMuted;
    }
  
    playBGM() {
      if (this.isBGMMuted) return;
      // User interaction check is handled by the browser, 
      // but we wrap in try-catch just in case called too early
      this.bgm.play().catch(e => console.log("Audio play failed (waiting for interaction):", e));
    }
  
    stopBGM() {
      this.bgm.pause();
      this.bgm.currentTime = 0;
    }
  
    playSFX(type: SoundType) {
      if (this.isSFXMuted) return;
      
      const sound = this.sfx[type];
      if (sound) {
        sound.currentTime = 0; // Reset to start for rapid playing
        // Randomize pitch slightly for 'coin' to make it more addictive/organic
        if (type === 'coin') {
            sound.playbackRate = 0.9 + Math.random() * 0.2;
        } else {
            sound.playbackRate = 1;
        }
        sound.play().catch(e => console.log("SFX play failed:", e));
      }
    }
  }
  
  // Singleton instance
  export const audioManager = new AudioService();
