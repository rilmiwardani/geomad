
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateRandomLocation, evaluateGuess, resetGameService, getLocationCount, addCustomLocation, getCategories } from './services/geminiService';
import { audioManager } from './services/audioService';
import { tiktokService } from './services/tiktokService';
import StreetView from './components/StreetView';
import SettingsModal from './components/SettingsModal';
import HeartOverlay, { HeartOverlayRef } from './components/HeartOverlay';
import { AppStatus, GameState, LocationData, Player, ConnectionStatus, ChatMessage, GameSettings, WinnerNotification, MapCategory } from './types';
import { MapPin, Settings, Globe, Navigation, RefreshCw, Volume2, VolumeX, Trophy, SkipForward, Maximize, Minimize, Users, Zap, Play, Crown, Medal, Star, List, Skull, Clock, Timer, Lock, Check, Music, Flag, Compass } from 'lucide-react';

// Key for LocalStorage
const GLOBAL_LEADERBOARD_KEY = 'geoguesser_global_leaderboard_v1';
const SETTINGS_KEY = 'geoguesser_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
    concealClues: true,
    concealDuration: 10,
    roundDuration: 90,
    summaryDuration: 15
};

// SCORING CONFIGURATION
const SCORE_CONFIG = {
    BASE_CITY: 50,
    BASE_COUNTRY: 20,
    MULTIPLIER_CITY: 2,   // Points per second left
    MULTIPLIER_COUNTRY: 1, // Points per second left
    BONUS_DOUBLE: 150      // Bonus if player gets both
};

// WINNER LIMITS
const MAX_CITY_WINNERS = 2;
const MAX_COUNTRY_WINNERS = 3;

const App: React.FC = () => {
  const [mapsApiKey, setMapsApiKey] = useState<string>(() => localStorage.getItem('maps_api_key') || '');
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  
  // Settings
  const [gameSettings, setGameSettings] = useState<GameSettings>(() => {
      const stored = localStorage.getItem(SETTINGS_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
  });

  // Game State
  const [gameState, setGameState] = useState<GameState>({
    currentLocation: null,
    round: 1,
    isGameOver: false,
    roundWinners: [],
    sessionLeaderboard: [],
    isCityFound: false,
    isCountryFound: false,
    cityFoundCount: 0,
    countryFoundCount: 0
  });

  // Category State
  const [categories, setCategories] = useState<MapCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(0);
  const [summaryTimeLeft, setSummaryTimeLeft] = useState(0);

  const [globalLeaderboard, setGlobalLeaderboard] = useState<Player[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]); 
  
  // UI States
  const [activeTab, setActiveTab] = useState<'session' | 'global'>('session');
  const [hostInput, setHostInput] = useState('');
  const [lastFeedback, setLastFeedback] = useState<{msg: string, type: 'success' | 'error' | 'info'} | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Audio States
  const [isBGMMuted, setIsBGMMuted] = useState(false);
  const [isSFXMuted, setIsSFXMuted] = useState(false);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [totalLocations, setTotalLocations] = useState(0);
  
  // New Feature: Hard Mode
  const [isHardMode, setIsHardMode] = useState(false);

  // Notification Queue System
  const [winnerQueue, setWinnerQueue] = useState<WinnerNotification[]>([]);
  const [currentNotification, setCurrentNotification] = useState<WinnerNotification | null>(null);

  // Hangman Reveal State
  const [cityIndices, setCityIndices] = useState<number[]>([]);
  const [countryIndices, setCountryIndices] = useState<number[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const heartOverlayRef = useRef<HeartOverlayRef>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const globalLeaderboardRef = useRef(globalLeaderboard);
  const timeLeftRef = useRef(0); // Ref for immediate access in callbacks
  
  useEffect(() => {
    globalLeaderboardRef.current = globalLeaderboard;
  }, [globalLeaderboard]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  // --- NOTIFICATION QUEUE PROCESSOR (FIXED RACE CONDITION) ---
  
  // 1. Queue Watcher: Only responsible for picking next item
  useEffect(() => {
      if (!currentNotification && winnerQueue.length > 0) {
          const nextNotification = winnerQueue[0];
          
          // Move from queue to active
          setCurrentNotification(nextNotification);
          setWinnerQueue(prev => prev.slice(1));
      }
  }, [winnerQueue, currentNotification]);

  // 2. Timer: Only responsible for clearing current item
  useEffect(() => {
      if (currentNotification) {
          const timer = setTimeout(() => {
              setCurrentNotification(null);
          }, 3000); // 3 Seconds display time

          return () => clearTimeout(timer);
      }
  }, [currentNotification]); // Only re-run when notification actually changes

  // --- INITIALIZATION ---
  useEffect(() => {
    setTotalLocations(getLocationCount());
    setCategories(getCategories()); // Load categories on startup
    loadGlobalLeaderboard();

    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const unsubStatus = tiktokService.onStatusChange((newStatus) => setConnectionStatus(newStatus));
    const unsubChat = tiktokService.onChat((msg) => processTikTokGuess(msg));
    const unsubLike = tiktokService.onLike((event) => heartOverlayRef.current?.addLike(event));
    tiktokService.connect();

    return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        tiktokService.disconnect();
        unsubStatus();
        unsubChat();
        unsubLike();
    };
  }, []); 

  // --- GLOBAL MAPS SCRIPT LOADER ---
  useEffect(() => {
      if (!mapsApiKey || window.google?.maps) return;

      const scriptId = 'google-maps-global-script';
      if (document.getElementById(scriptId)) return;

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
      
      console.log("Pre-loading Google Maps Script for validation service...");
  }, [mapsApiKey]);

  // --- TIMER LOGIC ---
  useEffect(() => {
      let interval: any;

      if (status === AppStatus.PLAYING) {
          interval = setInterval(() => {
              setTimeLeft((prev) => {
                  if (prev <= 1) {
                      finishRound();
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      } else if (status === AppStatus.ROUND_RESULT) {
          // Auto Advance Logic
          interval = setInterval(() => {
              setSummaryTimeLeft((prev) => {
                  if (prev <= 1) {
                      handleNextRound();
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      }

      return () => clearInterval(interval);
  }, [status]);

  // Reset tab when game ends
  useEffect(() => {
    if (status === AppStatus.GAME_OVER || status === AppStatus.ALL_LEVELS_COMPLETED) {
        setActiveTab('session');
    }
    // Reload categories whenever returning to IDLE to capture admin updates
    if (status === AppStatus.IDLE) {
        setCategories(getCategories());
    }
  }, [status]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const loadGlobalLeaderboard = () => {
    try {
      const stored = localStorage.getItem(GLOBAL_LEADERBOARD_KEY);
      if (stored) setGlobalLeaderboard(JSON.parse(stored));
    } catch (e) {
      console.error("Failed to load leaderboard", e);
    }
  };

  const saveToGlobalLeaderboard = (newSessionPlayers: Player[]) => {
    const currentGlobal = [...globalLeaderboardRef.current];
    newSessionPlayers.forEach(p => {
      const existingIndex = currentGlobal.findIndex(g => g.name === p.name);
      if (existingIndex >= 0) {
        currentGlobal[existingIndex].score += p.score;
        if (p.profilePictureUrl) {
            currentGlobal[existingIndex].profilePictureUrl = p.profilePictureUrl;
        }
      } else {
        currentGlobal.push({ ...p });
      }
    });
    currentGlobal.sort((a, b) => b.score - a.score);
    const top50 = currentGlobal.slice(0, 50);
    setGlobalLeaderboard(top50);
    localStorage.setItem(GLOBAL_LEADERBOARD_KEY, JSON.stringify(top50));
  };

  const handleRetryConnection = () => {
      audioManager.playSFX('click');
      tiktokService.connect();
  };

  const handleSimulationMode = () => {
      audioManager.playSFX('click');
      tiktokService.startSimulation();
  };

  const toggleBGM = () => {
      const isNowMuted = audioManager.toggleBGM();
      setIsBGMMuted(isNowMuted);
      if (!isSFXMuted) audioManager.playSFX('click');
  };

  const toggleSFX = () => {
      const isNowMuted = audioManager.toggleSFX();
      setIsSFXMuted(isNowMuted);
      // Play sound only if we just unmuted
      if (!isNowMuted) audioManager.playSFX('click');
  };

  const toggleFullscreen = async () => {
    audioManager.playSFX('click');
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(e => console.log(e));
    } else {
      if (document.exitFullscreen) await document.exitFullscreen();
    }
  };

  const saveSettings = (key: string, newSettings: GameSettings) => {
    audioManager.playSFX('click');
    setMapsApiKey(key);
    localStorage.setItem('maps_api_key', key);
    
    setGameSettings(newSettings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    
    setShowSettings(false);
  };

  const handleResetGlobalData = () => {
      if (window.confirm("Apakah Anda yakin ingin menghapus seluruh data Global Leaderboard?")) {
          audioManager.playSFX('click');
          localStorage.removeItem(GLOBAL_LEADERBOARD_KEY);
          setGlobalLeaderboard([]);
          setLastFeedback({ msg: "Global Leaderboard telah direset.", type: 'info' });
      }
  };

  const handleToggleHardMode = (enabled: boolean) => {
      setIsHardMode(enabled);
      audioManager.playSFX('click');
  };

  const handleAddLocation = async (lat: number, lng: number) => {
      try {
          const newLoc = await addCustomLocation(lat, lng);
          setTotalLocations(getLocationCount());
          audioManager.playSFX('correct');
          return newLoc;
      } catch (e) {
          audioManager.playSFX('wrong');
          throw e;
      }
  };

  // --- HANGMAN HELPER ---
  const createShuffledIndices = (length: number) => {
      const arr = Array.from({ length }, (_, i) => i);
      // Fisher-Yates shuffle
      for (let i = length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
  };

  const getMaskedText = (text: string, indices: number[], percentRevealed: number) => {
      const chars = text.split('');
      const countToReveal = Math.floor(chars.length * percentRevealed);
      const indicesToReveal = new Set(indices.slice(0, countToReveal));

      return chars.map((char, idx) => {
          if (char === ' ' || char === ',') return '\u00A0\u00A0\u00A0'; // Increased spacing between words
          return indicesToReveal.has(idx) ? char : '_';
      }).join(' ');
  };

  // --- GAME LOGIC ---

  const startNewRound = async (categoryId?: string) => {
    const activeCatId = categoryId || selectedCategoryId || undefined;
    
    if (gameState.round === 1 && gameState.sessionLeaderboard.length === 0) {
        audioManager.playBGM();
    }
    
    audioManager.playSFX('whoosh');
    setStatus(AppStatus.LOADING_LOCATION);
    setLastFeedback(null);
    setWinnerQueue([]); // Reset queue on new round
    setCurrentNotification(null);

    // Initial reset with selected category
    if (gameState.round === 1) {
        resetGameService(activeCatId);
    }

    try {
      const location = await generateRandomLocation(activeCatId);
      
      if (!location) {
        audioManager.stopBGM();
        audioManager.playSFX('gameOver');
        saveToGlobalLeaderboard(gameState.sessionLeaderboard);
        setStatus(AppStatus.ALL_LEVELS_COMPLETED);
        return;
      }

      setCityIndices(createShuffledIndices(location.city.length));
      setCountryIndices(createShuffledIndices(location.country.length));
      
      setTimeLeft(gameSettings.roundDuration);

      setGameState(prev => ({
        ...prev,
        currentLocation: location,
        roundWinners: [],
        isCityFound: false,
        isCountryFound: false,
        cityFoundCount: 0,
        countryFoundCount: 0
      }));
      setStatus(AppStatus.PLAYING);
    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleStartGame = (catId: string) => {
      setSelectedCategoryId(catId);
      audioManager.playSFX('click');
      startNewRound(catId);
  };

  const gameStateRef = useRef(gameState);
  const statusRef = useRef(status);
  const isHardModeRef = useRef(isHardMode);
  
  useEffect(() => {
      gameStateRef.current = gameState;
      statusRef.current = status;
      isHardModeRef.current = isHardMode;
  }, [gameState, status, isHardMode]);

  const processTikTokGuess = async (msg: ChatMessage) => {
      if (processedMessageIds.current.has(msg.uniqueId)) return;
      processedMessageIds.current.add(msg.uniqueId);

      const currentStatus = statusRef.current;
      const currentState = gameStateRef.current;
      const currentHardMode = isHardModeRef.current;

      let displayComment = msg.comment;
      let isCorrectGuess = false;
      let result = null;

      if (currentStatus === AppStatus.PLAYING && currentState.currentLocation) {
         result = await evaluateGuess(msg.comment, currentState.currentLocation, currentHardMode);
         
         if (result.correct) {
             isCorrectGuess = true;
             displayComment = "****** 🤫"; 
         }
      }

      setChatMessages(prev => {
        if (prev.some(p => p.uniqueId === msg.uniqueId)) return prev;
        const newMsg: ChatMessage = { ...msg, comment: displayComment, isCorrect: isCorrectGuess };
        const newFeed = [...prev, newMsg];
        if (newFeed.length > 15) newFeed.shift(); 
        return newFeed;
      });

      if (!isCorrectGuess || !result || !currentState.currentLocation) return;
      
      // Calculate Time Based Score
      const currentTimeLeft = timeLeftRef.current;
      let pointsToAdd = 0;
      let feedbackMsg = "";
      
      // Update Game State
      // Track counts locally before state update to check limits
      let currentCityCount = currentState.cityFoundCount;
      let currentCountryCount = currentState.countryFoundCount;

      // Cek apakah user ini sudah menebak sebelumnya di ronde ini
      const existingWinnerIndex = currentState.roundWinners.findIndex(w => w.name === msg.nickname);
      let winnerData: Player;

      if (existingWinnerIndex >= 0) {
          winnerData = { ...currentState.roundWinners[existingWinnerIndex] };
      } else {
          winnerData = {
              name: msg.nickname,
              score: 0,
              lastGuess: currentState.currentLocation.city,
              avatarColor: `hsl(${Math.random() * 360}, 70%, 50%)`,
              profilePictureUrl: msg.profilePictureUrl,
              foundCityInRound: false,
              foundCountryInRound: false,
              gotBonus: false
          };
      }

      let guessValid = false;
      let notificationType: 'CITY' | 'COUNTRY' | 'BONUS' = 'CITY';
      let typeToProcess = 'NONE';

      // --- SMART LOGIC FOR DUAL MATCHES (Ex: Singapore/Singapore) ---
      // If a guess matches BOTH, check which one the user *needs* or what slot is open.
      if (result.matchesCity && !winnerData.foundCityInRound && currentCityCount < MAX_CITY_WINNERS) {
          typeToProcess = 'CITY';
      } 
      else if (result.matchesCountry && !winnerData.foundCountryInRound && currentCountryCount < MAX_COUNTRY_WINNERS) {
          // If hard mode is on, we usually don't allow Country guesses, BUT if the string *also* matched City 
          // (but user already got city), allowing it as country depends on rules. 
          // Here we allow standard country processing if Hard Mode is OFF.
          if (!currentHardMode) {
              typeToProcess = 'COUNTRY';
          }
      }

      // LOGIKA SKOR BARU DENGAN LIMIT
      if (typeToProcess === 'CITY') {
          guessValid = true;
          winnerData.foundCityInRound = true;
          currentCityCount++; // Increment local tracker
          
          const timeBonus = currentTimeLeft * SCORE_CONFIG.MULTIPLIER_CITY;
          pointsToAdd = SCORE_CONFIG.BASE_CITY + timeBonus;
          feedbackMsg = `Menebak Kota!`;
          notificationType = 'CITY';
          audioManager.playSFX('coin');
      } 
      else if (typeToProcess === 'COUNTRY') {
          guessValid = true;
          winnerData.foundCountryInRound = true;
          currentCountryCount++; // Increment local tracker

          const timeBonus = currentTimeLeft * SCORE_CONFIG.MULTIPLIER_COUNTRY;
          pointsToAdd = SCORE_CONFIG.BASE_COUNTRY + timeBonus;
          feedbackMsg = `Menebak Negara!`;
          notificationType = 'COUNTRY';
          audioManager.playSFX('coin');
      }

      // CEK BONUS DOUBLE (JIKA PEMAIN SAMA MENEBAK KEDUANYA)
      if (winnerData.foundCityInRound && winnerData.foundCountryInRound && !winnerData.gotBonus) {
          winnerData.gotBonus = true;
          pointsToAdd += SCORE_CONFIG.BONUS_DOUBLE;
          feedbackMsg = `DOUBLE KILL! Bonus!`;
          notificationType = 'BONUS';
          audioManager.playSFX('combo'); // Special sound
      }

      if (pointsToAdd > 0 && guessValid) {
          winnerData.score += pointsToAdd;
          
          // ADD TO NOTIFICATION QUEUE
          const notification: WinnerNotification = {
              id: `${msg.uniqueId}_win`,
              player: { ...winnerData },
              type: notificationType,
              points: pointsToAdd,
              message: feedbackMsg
          };
          
          setWinnerQueue(prev => [...prev, notification]);

          setGameState(prev => {
              // Update Session Leaderboard
              const newSessionLB = [...prev.sessionLeaderboard];
              const sessionIdx = newSessionLB.findIndex(p => p.name === msg.nickname);
              if (sessionIdx >= 0) {
                  newSessionLB[sessionIdx].score += pointsToAdd;
                  if (msg.profilePictureUrl) newSessionLB[sessionIdx].profilePictureUrl = msg.profilePictureUrl;
              } else {
                  newSessionLB.push({ 
                      name: winnerData.name, 
                      score: pointsToAdd, 
                      profilePictureUrl: winnerData.profilePictureUrl,
                      avatarColor: winnerData.avatarColor 
                   });
              }
              newSessionLB.sort((a,b) => b.score - a.score);

              // Update Round Winners
              const newRoundWinners = [...prev.roundWinners];
              if (existingWinnerIndex >= 0) {
                  newRoundWinners[existingWinnerIndex] = winnerData;
              } else {
                  newRoundWinners.push(winnerData);
              }

              // Update Flags & Counts
              // Only reveal flags if limits are hit
              const newCityCount = prev.cityFoundCount + (typeToProcess === 'CITY' ? 1 : 0);
              const newCountryCount = prev.countryFoundCount + (typeToProcess === 'COUNTRY' ? 1 : 0);
              
              const isCityFull = newCityCount >= MAX_CITY_WINNERS;
              const isCountryFull = newCountryCount >= MAX_COUNTRY_WINNERS;

              // CEK GAME OVER CONDITION: SEMUA SLOT TERISI
              if (isCityFull && isCountryFull) {
                  setTimeout(() => finishRound(), 800); // Sedikit delay biar feedback terbaca
              }

              return {
                  ...prev,
                  roundWinners: newRoundWinners,
                  sessionLeaderboard: newSessionLB,
                  cityFoundCount: newCityCount,
                  countryFoundCount: newCountryCount,
                  isCityFound: isCityFull, // Only reveal if full
                  isCountryFound: isCountryFull // Only reveal if full
              };
          });
      }
  };

  const handleManualInput = () => {
      if (!hostInput.trim()) return;
      const parts = hostInput.split(' ');
      let nickname = "Host";
      let comment = hostInput;
      if (parts.length > 1) {
          nickname = parts[0];
          comment = parts.slice(1).join(' ');
      }
      const mockMsg: ChatMessage = { uniqueId: `host_${Date.now()}`, nickname: nickname, comment: comment };
      processTikTokGuess(mockMsg);
      setHostInput('');
  };

  const finishRound = () => {
    if (statusRef.current === AppStatus.ROUND_RESULT) return;
    setStatus(AppStatus.ROUND_RESULT);
    setSummaryTimeLeft(gameSettings.summaryDuration); // Start summary timer
    setCurrentNotification(null); // Clear popups immediately
    setWinnerQueue([]); 
    audioManager.playSFX('correct');
  };

  const handleNextRound = () => {
    audioManager.playSFX('click');
    if (gameState.round >= 10) {
      audioManager.stopBGM();
      audioManager.playSFX('gameOver');
      saveToGlobalLeaderboard(gameState.sessionLeaderboard);
      setStatus(AppStatus.GAME_OVER);
    } else {
      setGameState(prev => ({ ...prev, round: prev.round + 1 }));
      startNewRound();
    }
  };

  const handleRestartSession = () => {
    audioManager.playSFX('click');
    processedMessageIds.current.clear();
    setGameState({
      currentLocation: null,
      round: 1,
      isGameOver: false,
      roundWinners: [],
      sessionLeaderboard: [],
      isCityFound: false,
      isCountryFound: false,
      cityFoundCount: 0,
      countryFoundCount: 0
    });
    // Return to main menu instead of auto starting
    setStatus(AppStatus.IDLE);
    setSelectedCategoryId(null);
  };

  const handleFullReset = () => {
    audioManager.playSFX('click');
    processedMessageIds.current.clear();
    resetGameService();
    setGameState({
      currentLocation: null,
      round: 1,
      isGameOver: false,
      roundWinners: [],
      sessionLeaderboard: [],
      isCityFound: false,
      isCountryFound: false,
      cityFoundCount: 0,
      countryFoundCount: 0
    });
    setStatus(AppStatus.IDLE);
    setSelectedCategoryId(null);
  };

  const getRankStyle = (index: number) => {
    if (index === 0) return { bg: 'bg-yellow-500', text: 'text-yellow-400', border: 'border-yellow-400', shadow: 'shadow-yellow-500/50', gradient: 'from-yellow-400/20 to-amber-600/20' };
    if (index === 1) return { bg: 'bg-slate-300', text: 'text-slate-300', border: 'border-slate-300', shadow: 'shadow-slate-400/50', gradient: 'from-slate-400/20 to-slate-600/20' };
    if (index === 2) return { bg: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-400', shadow: 'shadow-orange-500/50', gradient: 'from-orange-400/20 to-red-600/20' };
    return { bg: 'bg-slate-700', text: 'text-white', border: 'border-slate-600', shadow: 'shadow-none', gradient: 'from-slate-800/50 to-slate-900/50' };
  };

  // --- RENDERERS ---

  const renderHangmanClue = () => {
      if (status !== AppStatus.PLAYING || !gameState.currentLocation) return null;
      if (!gameSettings.concealClues) return null;

      // REVEAL LOGIC UPDATE
      const cityLen = gameState.currentLocation.city.length;
      const countryLen = gameState.currentLocation.country.length;
      
      const maxCityRevealChars = Math.max(0, cityLen - 1); 
      const maxCountryRevealChars = Math.max(0, countryLen - 2); 

      const maxCityPercent = cityLen > 0 ? maxCityRevealChars / cityLen : 1;
      const maxCountryPercent = countryLen > 0 ? maxCountryRevealChars / countryLen : 1;

      const totalRevealWindow = gameSettings.roundDuration - gameSettings.concealDuration;
      const timeElapsed = gameSettings.roundDuration - timeLeft;
      const activeTime = Math.max(0, timeElapsed - gameSettings.concealDuration);
      
      let cityPercent = 0;
      let countryPercent = 0;

      const phaseDuration = totalRevealWindow / 2;

      if (activeTime > 0) {
          const rawCityProgress = Math.min(1, activeTime / phaseDuration);
          cityPercent = rawCityProgress * maxCityPercent;
          
          if (activeTime > phaseDuration) {
              const rawCountryProgress = Math.min(1, (activeTime - phaseDuration) / phaseDuration);
              countryPercent = rawCountryProgress * maxCountryPercent;
          }
      }

      if (gameState.isCityFound) cityPercent = 1;
      if (gameState.isCountryFound) countryPercent = 1;

      const maskedCity = getMaskedText(gameState.currentLocation.city, cityIndices, cityPercent);
      const maskedCountry = getMaskedText(gameState.currentLocation.country, countryIndices, countryPercent);

      return (
          // POSITIONED BELOW TIMER (TOP-20)
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none w-full max-w-sm px-4">
              <div className="bg-black/40 backdrop-blur-sm border border-white/10 px-4 py-2 rounded-xl shadow-lg flex flex-col items-center gap-0.5 w-auto min-w-[200px] animate-in slide-in-from-top-4 duration-500">
                  <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1 mb-0.5 opacity-80">
                      <MapPin size={10} /> Mystery Location
                  </div>
                  
                  {/* CITY */}
                  <div className={`text-lg md:text-xl font-mono font-black tracking-[0.15em] uppercase text-center drop-shadow-sm transition-all duration-300 ${gameState.isCityFound ? 'text-green-400 scale-105' : 'text-white'}`}>
                      {maskedCity}
                  </div>
                  
                  {/* COUNTRY */}
                  <div className={`text-sm md:text-base font-mono font-black tracking-[0.2em] uppercase text-center mt-1 transition-all duration-300 drop-shadow-md ${gameState.isCountryFound ? 'text-green-400 scale-105' : 'text-cyan-300'}`}>
                      {maskedCountry}
                  </div>
              </div>
              
              {/* Progress Indicators (Compact with Slots) */}
              <div className="flex gap-2 mt-1.5 opacity-90 scale-90">
                 {/* CITY SLOT INDICATOR */}
                 <div className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold border transition-colors ${gameState.isCityFound ? 'bg-green-500/80 border-green-400 text-white' : 'bg-slate-800/80 border-slate-600 text-slate-300'}`}>
                    <span>KOTA</span>
                    <div className="flex gap-0.5">
                        {[...Array(MAX_CITY_WINNERS)].map((_, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < gameState.cityFoundCount ? 'bg-green-400 shadow-[0_0_5px_lime]' : 'bg-slate-600'}`} />
                        ))}
                    </div>
                    <span>{gameState.cityFoundCount}/{MAX_CITY_WINNERS}</span>
                 </div>

                 {/* COUNTRY SLOT INDICATOR */}
                 <div className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded font-bold border transition-colors ${gameState.isCountryFound ? 'bg-green-500/80 border-green-400 text-white' : 'bg-slate-800/80 border-slate-600 text-slate-300'}`}>
                    <span>NEGARA</span>
                    <div className="flex gap-0.5">
                        {[...Array(MAX_COUNTRY_WINNERS)].map((_, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < gameState.countryFoundCount ? 'bg-cyan-400 shadow-[0_0_5px_cyan]' : 'bg-slate-600'}`} />
                        ))}
                    </div>
                    <span>{gameState.countryFoundCount}/{MAX_COUNTRY_WINNERS}</span>
                 </div>
              </div>
          </div>
      );
  };

  // --- NEW: POPUP WINNER NOTIFICATION (REPLACES OLD LIST) ---
  const renderWinnerPopUp = () => {
      if (!currentNotification) return null;

      const { player, type, points, message } = currentNotification;
      
      let typeConfig = {
          color: 'bg-slate-800',
          borderColor: 'border-slate-600',
          icon: <MapPin size={16} />,
          gradient: 'from-slate-700 to-slate-900'
      };

      if (type === 'CITY') {
          typeConfig = {
              color: 'text-green-300',
              borderColor: 'border-green-500/50',
              icon: <MapPin size={16} className="text-green-400" />,
              gradient: 'from-green-900/90 to-slate-900/95'
          };
      } else if (type === 'COUNTRY') {
          typeConfig = {
              color: 'text-cyan-300',
              borderColor: 'border-cyan-500/50',
              icon: <Flag size={16} className="text-cyan-400" />,
              gradient: 'from-cyan-900/90 to-slate-900/95'
          };
      } else if (type === 'BONUS') {
          typeConfig = {
              color: 'text-purple-300',
              borderColor: 'border-purple-500/50',
              icon: <Zap size={16} className="text-yellow-400 fill-yellow-400 animate-bounce" />,
              gradient: 'from-purple-900/90 to-indigo-900/95'
          };
      }

      return (
          // UPDATED POSITION: top-64 (256px) - Safe distance below Hangman (top-20 + height)
          <div className="absolute top-64 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-xs px-4 flex justify-center">
              <div className={`
                 relative flex items-center gap-3 pr-4 pl-1.5 py-1.5 rounded-full border ${typeConfig.borderColor} 
                 bg-gradient-to-r ${typeConfig.gradient} backdrop-blur-md shadow-2xl
                 animate-in slide-in-from-top-4 fade-in zoom-in duration-300
              `}>
                  {/* Avatar */}
                  <div className="relative shrink-0">
                      {player.profilePictureUrl ? (
                          <img src={player.profilePictureUrl} className="w-10 h-10 rounded-full border-2 border-white/20 shadow-sm object-cover" />
                      ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-black border-2 border-white/20 shadow-sm" style={{ backgroundColor: player.avatarColor }}>
                              {player.name[0].toUpperCase()}
                          </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                          {typeConfig.icon}
                      </div>
                  </div>

                  {/* Text */}
                  <div className="flex flex-col min-w-0">
                      <div className="text-white text-xs font-bold truncate max-w-[120px]">
                          {player.name}
                      </div>
                      <div className={`text-[10px] font-black uppercase tracking-wider ${typeConfig.color}`}>
                          {message}
                      </div>
                  </div>

                  {/* Points */}
                  <div className="ml-auto pl-3 border-l border-white/10 flex flex-col items-center">
                      <span className="text-xs font-black text-white">+{Math.floor(points)}</span>
                      <span className="text-[8px] text-slate-400 uppercase font-bold">PTS</span>
                  </div>
              </div>
          </div>
      );
  };

  // --- NEW FEEDBACK TOAST (Z-INDEX 50) ---
  const renderFeedbackToast = () => {
    if (!lastFeedback) return null;
    return (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className={`text-xs md:text-sm px-4 py-1.5 rounded-full font-bold shadow-[0_0_10px_rgba(0,0,0,0.5)] border backdrop-blur-md flex items-center gap-2 whitespace-nowrap
                ${lastFeedback.type === 'success' ? 'bg-green-600/90 border-green-400 text-white' : 
                  lastFeedback.type === 'error' ? 'bg-red-600/90 border-red-400 text-white' : 'bg-blue-600/90 border-blue-400 text-white'}`}>
                {lastFeedback.type === 'success' && <Zap size={12} className="text-yellow-300 fill-yellow-300" />}
                {lastFeedback.msg}
            </div>
        </div>
    );
  };

  const renderTimer = () => {
      if (status !== AppStatus.PLAYING && status !== AppStatus.ROUND_RESULT) return null;
      
      const currentTime = status === AppStatus.PLAYING ? timeLeft : summaryTimeLeft;
      const isCritical = currentTime < 10;
      
      return (
          // UPDATED: Centered Top Position, Smaller Aesthetic
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border shadow-sm backdrop-blur-md transition-all duration-300 ${isCritical ? 'bg-red-900/80 border-red-500 animate-pulse' : 'bg-slate-900/60 border-slate-600/50'}`}>
                  <Timer size={14} className={isCritical ? 'text-red-400' : 'text-cyan-400'} />
                  <span className={`font-mono text-sm font-bold tabular-nums ${isCritical ? 'text-red-400' : 'text-white'}`}>
                      {currentTime}s
                  </span>
              </div>
              
              {/* Optional Status Text below timer */}
              {status === AppStatus.ROUND_RESULT && (
                  <div className="text-[9px] text-slate-400 uppercase font-bold text-center mt-1 text-shadow-sm">
                      Next Round
                  </div>
              )}
          </div>
      );
  };

  const renderChatFeed = () => {
      if (status === AppStatus.IDLE) return null;
      return (
          <div className="absolute bottom-48 left-4 z-20 w-64 md:w-80 h-48 pointer-events-none flex flex-col justify-end mask-image-linear-gradient-to-t">
             <div className="flex-1 overflow-y-auto space-y-1.5 p-1 flex flex-col justify-end" style={{scrollbarWidth: 'none', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%)'}}>
                {chatMessages.map((msg, i) => (
                    <div key={i} className="flex items-baseline gap-2 animate-in slide-in-from-left-2 duration-300">
                        {msg.profilePictureUrl ? (
                            <img src={msg.profilePictureUrl} className="w-5 h-5 rounded-full border border-white/20 shadow-sm shrink-0 object-cover" />
                        ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-500/50 border border-white/20 shrink-0" />
                        )}
                        <div className="text-sm leading-tight drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)]">
                            <span className="font-bold text-yellow-400 mr-1">{msg.nickname}:</span>
                            <span className={`font-medium ${msg.isCorrect ? 'text-green-400 italic' : 'text-white'}`}>
                                {msg.comment}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={chatEndRef} />
             </div>
          </div>
      );
  };

  const renderOverlay = () => {
    if (status === AppStatus.IDLE) {
      return (
        <div className="absolute inset-0 z-10 bg-slate-900 flex flex-col items-center p-6 text-center overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {/* Header */}
            <div className="flex flex-col items-center w-full max-w-4xl animate-in fade-in slide-in-from-top-10 duration-700 mt-10">
                <Globe className="w-16 h-16 text-cyan-400 mb-2 animate-bounce" />
                <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 mb-2 tracking-tighter italic">
                    GEOMAD
                </h1>
                <p className="text-slate-400 font-mono text-sm mb-10 flex items-center gap-2">
                    <MapPin size={16} /> Pilih kategori untuk memulai petualangan
                </p>

                {/* Connection Status Mini */}
                <div className={`mb-8 px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-2 ${
                    connectionStatus === ConnectionStatus.CONNECTED ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                    connectionStatus === ConnectionStatus.CONNECTING ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                    <div className={`w-2 h-2 rounded-full ${connectionStatus === ConnectionStatus.CONNECTED ? 'bg-green-400' : connectionStatus === ConnectionStatus.CONNECTING ? 'bg-yellow-400' : 'bg-red-400'} animate-pulse`} />
                    {connectionStatus === ConnectionStatus.CONNECTED ? "TikTok Connected" : connectionStatus}
                </div>

                {/* CATEGORY GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full px-4 pb-20">
                    {categories.map((cat, idx) => {
                         const count = getLocationCount(cat.id);
                         return (
                            <button 
                                key={cat.id} 
                                onClick={() => handleStartGame(cat.id)}
                                disabled={count === 0}
                                className="group relative h-64 rounded-2xl overflow-hidden border border-slate-700 hover:border-cyan-400 transition-all duration-300 hover:shadow-[0_0_30px_rgba(34,211,238,0.2)] hover:-translate-y-2 text-left"
                            >
                                {/* Background Image */}
                                <div className="absolute inset-0">
                                    <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 grayscale group-hover:grayscale-0" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/60 to-transparent group-hover:via-slate-900/30 transition-all"></div>
                                </div>

                                {/* Content */}
                                <div className="absolute bottom-0 left-0 w-full p-5">
                                    <h3 className="text-2xl font-black text-white mb-1 leading-tight group-hover:text-cyan-300 transition-colors uppercase italic tracking-tight">
                                        {cat.name}
                                    </h3>
                                    <p className="text-xs text-slate-300 line-clamp-2 mb-3 font-medium opacity-80 group-hover:opacity-100">
                                        {cat.description}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-white">
                                        <span className="bg-slate-900/80 px-2 py-1 rounded backdrop-blur-sm border border-slate-700 group-hover:border-cyan-500/50 transition-colors">
                                            {count} Maps
                                        </span>
                                        {count === 0 && <span className="text-red-400">Empty</span>}
                                    </div>
                                </div>

                                {/* Play Icon Overlay */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-cyan-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100 transition-all duration-300 shadow-lg z-10">
                                    <Play size={24} className="fill-white text-white ml-1" />
                                </div>
                            </button>
                         );
                    })}
                </div>
                
                {/* Footer Controls */}
                <div className="fixed bottom-0 left-0 w-full p-4 bg-gradient-to-t from-slate-950 to-transparent flex justify-center gap-2 pointer-events-none">
                     <div className="pointer-events-auto flex gap-2">
                        {connectionStatus !== ConnectionStatus.CONNECTED && (
                            <button onClick={handleRetryConnection} className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 backdrop-blur-md border border-slate-600 rounded-full text-white text-xs font-bold flex items-center gap-2 transition">
                                <RefreshCw size={12} /> Reconnect
                            </button>
                        )}
                        <button onClick={handleSimulationMode} className="px-4 py-2 bg-blue-900/40 hover:bg-blue-800/60 backdrop-blur-md border border-blue-500/30 rounded-full text-blue-300 text-xs font-bold flex items-center gap-2 transition">
                             <Play size={12} /> Demo Mode
                        </button>
                     </div>
                </div>

            </div>
        </div>
      );
    }

    if (status === AppStatus.LOADING_LOCATION) {
      return (
        <div className="absolute inset-0 z-10 bg-slate-900 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-cyan-400 font-mono animate-pulse">Mencari Lokasi Misterius...</p>
        </div>
      );
    }

    if (status === AppStatus.ROUND_RESULT) {
        // Find best player of the round (highest score in this round)
        const sortedWinners = [...gameState.roundWinners].sort((a,b) => b.score - a.score);
        const topWinner = sortedWinners[0];

        return (
            <div className="absolute inset-0 z-20 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
                <div className="w-full max-w-md relative">
                    {/* Header Card */}
                    <div className="bg-slate-800/50 border border-white/10 rounded-2xl p-6 text-center mb-6 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-purple-500/10" />
                        <h2 className="text-3xl font-black text-white mb-2 relative z-10 uppercase tracking-tight">Ronde {gameState.round} Selesai</h2>
                        <div className="inline-flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/10 relative z-10">
                            <MapPin size={16} className="text-red-500" />
                            <span className="text-white font-bold">{gameState.currentLocation?.city}, <span className="text-slate-400">{gameState.currentLocation?.country}</span></span>
                        </div>
                    </div>

                    {/* Winners Display */}
                    <div className="space-y-3 mb-8">
                        {sortedWinners.length === 0 ? (
                            <div className="text-center text-slate-500 py-8 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                                Tidak ada yang menjawab benar.
                            </div>
                        ) : (
                            <>
                                {topWinner && (
                                    <div className="bg-gradient-to-r from-yellow-900/40 to-black border border-yellow-500/50 rounded-xl p-4 flex items-center gap-4 relative overflow-hidden animate-in zoom-in duration-500 shadow-[0_0_30px_rgba(234,179,8,0.2)]">
                                        <div className="absolute top-0 right-0 p-2 opacity-20">
                                            <Crown size={60} className="text-yellow-500" />
                                        </div>
                                        <div className="relative">
                                            {topWinner.profilePictureUrl ? (
                                                <img src={topWinner.profilePictureUrl} className="w-16 h-16 rounded-full border-2 border-yellow-400 object-cover shadow-lg" />
                                            ) : (
                                                <div className="w-16 h-16 rounded-full bg-yellow-600 flex items-center justify-center text-xl font-bold text-black border-2 border-yellow-400">
                                                    {topWinner.name[0]}
                                                </div>
                                            )}
                                            <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full border border-black">#1</div>
                                        </div>
                                        <div className="flex-1 z-10">
                                            <div className="text-yellow-400 font-bold text-lg flex items-center gap-2">
                                                {topWinner.name} <Zap size={14} className="fill-yellow-400 animate-pulse" />
                                            </div>
                                            <div className="flex gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                                {topWinner.foundCityInRound && <span className="text-green-400 bg-green-900/30 px-1.5 rounded">CITY</span>}
                                                {topWinner.foundCountryInRound && <span className="text-cyan-400 bg-cyan-900/30 px-1.5 rounded">COUNTRY</span>}
                                                {topWinner.gotBonus && <span className="text-purple-400 bg-purple-900/30 px-1.5 rounded">BONUS</span>}
                                            </div>
                                            <div className="text-2xl font-black text-white">+{topWinner.score} pts</div>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-2 mt-2 max-h-[30vh] overflow-y-auto">
                                    {sortedWinners.slice(1).map((w, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 border border-white/5 rounded-lg animate-in slide-in-from-bottom-2" style={{animationDelay: `${i * 100}ms`}}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 text-center font-mono text-slate-500 font-bold">#{i+2}</div>
                                                {w.profilePictureUrl ? (
                                                    <img src={w.profilePictureUrl} className="w-8 h-8 rounded-full bg-slate-700 object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs" style={{background: w.avatarColor}}>{w.name[0]}</div>
                                                )}
                                                <div className="flex flex-col">
                                                    <span className="text-white font-medium text-sm">{w.name}</span>
                                                    <div className="flex gap-1 text-[8px] font-bold text-slate-500">
                                                        {w.gotBonus ? "DOUBLE KILL" : (w.foundCityInRound ? "CITY" : "COUNTRY")}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-green-400 font-bold">+{w.score}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <button
                        onClick={handleNextRound}
                        className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold shadow-lg transition flex items-center justify-center gap-2 group border border-emerald-400/30 relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-black/10" style={{ width: `${(summaryTimeLeft / gameSettings.summaryDuration) * 100}%`, transition: 'width 1s linear' }} />
                        <span className="relative z-10 flex items-center gap-2">
                            {gameState.round >= 10 ? "LIHAT HASIL AKHIR" : `RONDE BERIKUTNYA (${summaryTimeLeft}s)`} 
                            <Navigation size={20} className="group-hover:translate-x-1 transition-transform" />
                        </span>
                    </button>
                </div>
            </div>
        );
    }

    if (status === AppStatus.GAME_OVER || status === AppStatus.ALL_LEVELS_COMPLETED) {
      const sessionWinners = [...gameState.sessionLeaderboard];
      const top1 = sessionWinners[0];
      const top2 = sessionWinners[1];
      const top3 = sessionWinners[2];
      const restSession = sessionWinners.slice(3);

      return (
        <div className="absolute inset-0 z-20 bg-slate-900 flex flex-col p-4 overflow-y-auto bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
            <div className="max-w-md mx-auto w-full mt-4 mb-20 animate-in slide-in-from-bottom-10">
                <div className="text-center mb-6">
                    <div className="inline-block p-4 rounded-full bg-yellow-500/10 mb-2 border border-yellow-500/30 shadow-[0_0_40px_rgba(234,179,8,0.3)]">
                        <Trophy className="w-12 h-12 text-yellow-400 animate-bounce" />
                    </div>
                    <h2 className="text-4xl font-black text-white tracking-tight">GAME OVER</h2>
                </div>
                <div className="flex bg-slate-800/50 p-1 rounded-xl mb-6 border border-slate-700 backdrop-blur-sm">
                    <button onClick={() => setActiveTab('session')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'session' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                        <Trophy size={14} /> Hasil Sesi
                    </button>
                    <button onClick={() => setActiveTab('global')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'global' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200'}`}>
                        <Globe size={14} /> Top Global
                    </button>
                </div>
                
                {activeTab === 'session' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        {sessionWinners.length > 0 ? (
                            <>
                                <div className="flex items-end justify-center gap-2 mb-8 h-48">
                                    <div className={`flex flex-col items-center w-1/3 ${top2 ? 'opacity-100' : 'opacity-0'}`}>
                                        {top2 && (
                                            <>
                                                <div className="relative mb-2 animate-in slide-in-from-bottom-4 duration-700">
                                                    <img src={top2.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${top2.name}`} className="w-14 h-14 rounded-full border-2 border-slate-300 shadow-lg object-cover" />
                                                    <div className="absolute -bottom-2 inset-x-0 mx-auto w-5 h-5 bg-slate-300 rounded-full flex items-center justify-center text-[10px] font-bold text-slate-900 border border-white">2</div>
                                                </div>
                                                <div className="w-full bg-gradient-to-t from-slate-800 to-slate-700/50 rounded-t-lg border-t border-slate-500 h-24 flex flex-col items-center justify-end pb-2 backdrop-blur-sm">
                                                    <span className="text-white text-xs font-bold truncate max-w-[80%] mb-1">{top2.name}</span>
                                                    <span className="text-slate-300 font-mono text-sm">{top2.score}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center w-1/3 z-10 -mx-1">
                                         <div className="relative mb-2 animate-in slide-in-from-bottom-4 duration-500">
                                            <div className="absolute -top-6 left-0 right-0 flex justify-center">
                                                <Crown className="text-yellow-400 fill-yellow-400 drop-shadow-lg animate-pulse" size={24} />
                                            </div>
                                            <img src={top1?.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${top1?.name}`} className="w-20 h-20 rounded-full border-4 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)] object-cover" />
                                            <div className="absolute -bottom-3 inset-x-0 mx-auto w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center text-xs font-bold text-yellow-900 border-2 border-white shadow-sm">1</div>
                                        </div>
                                        <div className="w-full bg-gradient-to-t from-yellow-900/80 to-yellow-600/50 rounded-t-lg border-t border-yellow-400 h-32 flex flex-col items-center justify-end pb-4 backdrop-blur-md shadow-2xl">
                                            <span className="text-white text-sm font-black truncate max-w-[90%] mb-1">{top1?.name}</span>
                                            <span className="text-yellow-200 font-mono text-lg font-bold">{top1?.score}</span>
                                        </div>
                                    </div>
                                    <div className={`flex flex-col items-center w-1/3 ${top3 ? 'opacity-100' : 'opacity-0'}`}>
                                         {top3 && (
                                            <>
                                                <div className="relative mb-2 animate-in slide-in-from-bottom-4 duration-1000">
                                                    <img src={top3.profilePictureUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${top3.name}`} className="w-14 h-14 rounded-full border-2 border-orange-400 shadow-lg object-cover" />
                                                    <div className="absolute -bottom-2 inset-x-0 mx-auto w-5 h-5 bg-orange-400 rounded-full flex items-center justify-center text-[10px] font-bold text-orange-900 border border-white">3</div>
                                                </div>
                                                <div className="w-full bg-gradient-to-t from-orange-900/60 to-orange-700/40 rounded-t-lg border-t border-orange-500 h-20 flex flex-col items-center justify-end pb-2 backdrop-blur-sm">
                                                    <span className="text-white text-xs font-bold truncate max-w-[80%] mb-1">{top3.name}</span>
                                                    <span className="text-orange-200 font-mono text-sm">{top3.score}</span>
                                                </div>
                                            </>
                                         )}
                                    </div>
                                </div>
                                {restSession.length > 0 && (
                                    <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 overflow-hidden mb-8 backdrop-blur-sm">
                                         <div className="bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                             <Users size={14} /> Peringkat 4 - {sessionWinners.length}
                                         </div>
                                         <div className="max-h-60 overflow-y-auto">
                                            {restSession.map((p, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-mono text-slate-500 text-sm w-6">#{i+4}</span>
                                                        {p.profilePictureUrl ? (
                                                            <img src={p.profilePictureUrl} className="w-8 h-8 rounded-full bg-slate-700 object-cover" />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white" style={{background: p.avatarColor}}>{p.name[0]}</div>
                                                        )}
                                                        <span className="text-slate-200 text-sm font-medium">{p.name}</span>
                                                    </div>
                                                    <span className="text-slate-400 font-mono text-sm">{p.score}</span>
                                                </div>
                                            ))}
                                         </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-center py-12 text-slate-500 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700 mb-8">
                                <p>Belum ada pemenang di sesi ini.</p>
                            </div>
                        )}
                    </div>
                )}
                
                {activeTab === 'global' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-gradient-to-br from-indigo-900/40 to-slate-900/80 rounded-2xl border border-indigo-500/30 overflow-hidden mb-8 shadow-xl">
                            <div className="bg-indigo-900/30 px-4 py-3 font-bold text-indigo-300 flex items-center justify-between border-b border-indigo-500/20">
                                <div className="flex items-center gap-2"><Globe size={16} /> Leaderboard Global</div>
                                <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-200">All Time Best</span>
                            </div>
                            
                            {globalLeaderboard.length > 0 ? (
                                <div className="p-2 space-y-1.5 max-h-[50vh] overflow-y-auto">
                                     {globalLeaderboard.map((p, i) => {
                                         const rankStyle = getRankStyle(i);
                                         return (
                                            <div key={i} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${i < 3 ? `bg-gradient-to-r ${rankStyle.gradient} ${rankStyle.border} ${rankStyle.shadow}` : 'border-transparent bg-slate-800/40 hover:bg-slate-700/50'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black shadow-sm ${i<3 ? `${rankStyle.bg} text-black` : 'text-slate-400 bg-slate-700/50 border border-slate-600'}`}>
                                                        {i+1}
                                                    </div>
                                                    <div className="relative">
                                                        {p.profilePictureUrl ? (
                                                            <img src={p.profilePictureUrl} className={`w-8 h-8 rounded-full object-cover ${i===0 ? 'border-2 border-yellow-400':''}`} />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold" style={{background: p.avatarColor}}>{p.name[0]}</div>
                                                        )}
                                                        {i===0 && <div className="absolute -top-2 -right-1"><Crown size={12} className="text-yellow-400 fill-yellow-400"/></div>}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm font-bold leading-tight ${i<3 ? 'text-white' : 'text-slate-300'}`}>{p.name}</span>
                                                        <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
                                                            Last: {p.lastGuess || '-'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`font-mono font-black ${i<3 ? 'text-xl text-white' : 'text-lg text-slate-400'}`}>{p.score}</span>
                                            </div>
                                         )
                                    })}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-500 text-sm">
                                    Belum ada data global. Jadilah yang pertama!
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-2 sticky bottom-0 pt-4 bg-gradient-to-t from-slate-900 to-transparent pb-4">
                    <button onClick={handleRestartSession} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-bold shadow-lg shadow-blue-900/50 transition flex items-center justify-center gap-2 group">
                        <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-500" /> Main Lagi
                    </button>
                    {status === AppStatus.ALL_LEVELS_COMPLETED && (
                        <button onClick={handleFullReset} className="px-4 py-4 bg-slate-800 border border-slate-600 rounded-xl text-slate-300 font-bold hover:bg-slate-700 transition">
                            Reset
                        </button>
                    )}
                </div>
            </div>
        </div>
      );
    }

    return null;
  };

  const renderGameControls = () => {
    if (status !== AppStatus.PLAYING && status !== AppStatus.EVALUATING) return null;

    return (
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 pb-8 bg-gradient-to-t from-black/95 via-black/80 to-transparent pointer-events-none">
        <div className="max-w-3xl mx-auto w-full pointer-events-auto">
            <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center gap-2">
                    <div className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded animate-pulse shadow-[0_0_10px_red]">LIVE</div>
                    <span className="text-white font-bold shadow-black drop-shadow-md flex items-center gap-1">
                        Round {gameState.round}<span className="text-slate-400">/10</span>
                    </span>
                    {selectedCategoryId && (
                        <div className="ml-2 bg-slate-800/80 border border-slate-600 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                            <Compass size={10} className="text-cyan-400"/>
                            {categories.find(c => c.id === selectedCategoryId)?.name || 'Custom'}
                        </div>
                    )}
                    {isHardMode && (
                        <div className="ml-2 bg-red-900/80 border border-red-500 text-red-200 text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 shadow-sm">
                            <Skull size={10} /> HARD MODE
                        </div>
                    )}
                 </div>
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex gap-2 opacity-30 hover:opacity-100 transition-opacity focus-within:opacity-100">
                    <input
                        type="text"
                        value={hostInput}
                        onChange={(e) => setHostInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleManualInput()}
                        placeholder="Manual Input (Debug)"
                        className="w-full h-8 pl-3 rounded-lg bg-slate-900/90 border border-slate-700 text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <button onClick={handleManualInput} className="px-3 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg text-xs text-white transition">Send</button>
                </div>
                
                <button onClick={() => finishRound()} className="self-center mt-1 text-[10px] text-slate-600 hover:text-white flex items-center gap-1 transition-colors">
                    <SkipForward size={10} /> Force Finish Round
                </button>
            </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-900 overflow-hidden font-sans selection:bg-cyan-500/30">
      {gameState.currentLocation && status !== AppStatus.LOADING_LOCATION ? (
         <StreetView location={gameState.currentLocation} apiKey={mapsApiKey} />
      ) : (
        <div className="w-full h-full bg-slate-950" /> 
      )}

      {renderChatFeed()}
      {/* renderLiveWinnersOverlay() REMOVED */}
      {renderWinnerPopUp()}
      {renderHangmanClue()} 
      {renderFeedbackToast()} {/* ADDED FEEDBACK TOAST */}
      {renderTimer()}
      
      <HeartOverlay ref={heartOverlayRef} />

      {/* UPDATED: SINGLE SETTINGS BUTTON IN TOP RIGHT */}
      <div className="absolute top-4 right-4 z-50">
        <button onClick={() => { audioManager.playSFX('click'); setShowSettings(true); }} className="p-2.5 bg-black/40 hover:bg-black/80 rounded-full text-white backdrop-blur-sm border border-white/5 hover:border-white/20 transition-all shadow-lg">
            <Settings size={20} />
        </button>
      </div>

      {renderOverlay()}
      {/* Removed renderHintOverlay() */}
      {renderGameControls()}

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => { audioManager.playSFX('click'); setShowSettings(false); }} 
        onSave={saveSettings} 
        onResetData={handleResetGlobalData}
        currentKey={mapsApiKey}
        currentSettings={gameSettings}
        // New Props for Audio/Display
        isHardMode={isHardMode}
        onToggleHardMode={handleToggleHardMode} 
        onAddLocation={handleAddLocation}
        isBGMMuted={isBGMMuted}
        isSFXMuted={isSFXMuted}
        isFullscreen={isFullscreen}
        onToggleBGM={toggleBGM}
        onToggleSFX={toggleSFX}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  );
};

export default App;
