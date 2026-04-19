
import React, { useState } from 'react';
import { Trash2, AlertTriangle, Skull, MapPin, Search, PlusCircle, CheckCircle, Link, Clock, Eye, EyeOff, Timer, Database, ExternalLink, Music, Volume2, VolumeX, Maximize, Minimize, Monitor, Speaker } from 'lucide-react';
import { LocationData, GameSettings } from '../types';
import { parseCoordinatesFromUrl } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (key: string, settings: GameSettings) => void;
  onResetData: () => void;
  currentKey: string;
  currentSettings: GameSettings;
  // Game Mode Props
  isHardMode: boolean;
  onToggleHardMode: (enabled: boolean) => void;
  // Custom Location Props
  onAddLocation?: (lat: number, lng: number) => Promise<LocationData>;
  // Audio & Display Props (Moved from App.tsx)
  isBGMMuted: boolean;
  isSFXMuted: boolean;
  isFullscreen: boolean;
  onToggleBGM: () => void;
  onToggleSFX: () => void;
  onToggleFullscreen: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
    isOpen, 
    onClose, 
    onSave, 
    onResetData, 
    currentKey, 
    currentSettings,
    isHardMode, 
    onToggleHardMode,
    onAddLocation,
    isBGMMuted,
    isSFXMuted,
    isFullscreen,
    onToggleBGM,
    onToggleSFX,
    onToggleFullscreen
}) => {
  const [keyInput, setKeyInput] = useState(currentKey);
  
  // Game Settings States
  const [settings, setSettings] = useState<GameSettings>(currentSettings);

  // Custom Location States
  const [urlInput, setUrlInput] = useState('');
  const [newLat, setNewLat] = useState('');
  const [newLng, setNewLng] = useState('');
  const [isAddingLoc, setIsAddingLoc] = useState(false);
  const [addLocStatus, setAddLocStatus] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  if (!isOpen) return null;

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setUrlInput(val);
      
      // Auto-parse on paste
      const coords = parseCoordinatesFromUrl(val);
      if (coords) {
          setNewLat(coords.lat.toString());
          setNewLng(coords.lng.toString());
          setAddLocStatus({ msg: "Koordinat ditemukan dari URL! Silakan klik tombol 'Deteksi'.", type: 'success' });
      }
  };

  const handleAddLocationClick = async () => {
      if (!onAddLocation) return;
      setAddLocStatus(null);
      
      const lat = parseFloat(newLat);
      const lng = parseFloat(newLng);

      if (isNaN(lat) || isNaN(lng)) {
          setAddLocStatus({ msg: "Koordinat tidak valid. Paste URL yang benar atau isi manual.", type: 'error' });
          return;
      }

      setIsAddingLoc(true);
      try {
          const loc = await onAddLocation(lat, lng);
          setAddLocStatus({ msg: `Berhasil: ${loc.city}, ${loc.country}`, type: 'success' });
          setNewLat('');
          setNewLng('');
          setUrlInput('');
      } catch (err: any) {
          setAddLocStatus({ msg: err.message || "Gagal mendeteksi lokasi.", type: 'error' });
      } finally {
          setIsAddingLoc(false);
      }
  };

  const updateSetting = (key: keyof GameSettings, value: any) => {
      setSettings(prev => ({
          ...prev,
          [key]: value
      }));
  };

  const openAdminPanel = () => {
      window.open(window.location.pathname + '?mode=admin', '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-full max-w-md shadow-2xl scale-100 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-white mb-4">Pengaturan</h2>
        
        {/* DISPLAY & AUDIO SETTINGS (NEW SECTION) */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-3">
           <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-slate-700 pb-2">
               <Monitor size={16} className="text-purple-400" /> Tampilan & Audio
           </h3>
           
           <div className="grid grid-cols-3 gap-3">
               {/* Fullscreen Toggle */}
               <button 
                  onClick={onToggleFullscreen}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all ${isFullscreen ? 'bg-blue-600/20 border-blue-500/50 text-blue-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
               >
                   {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                   <span className="text-[10px] font-bold">Fullscreen</span>
               </button>

               {/* BGM Toggle */}
               <button 
                  onClick={onToggleBGM}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all ${!isBGMMuted ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
               >
                   <Music size={20} className={isBGMMuted ? "opacity-50" : ""} />
                   <span className="text-[10px] font-bold">{isBGMMuted ? 'BGM Off' : 'BGM On'}</span>
               </button>

               {/* SFX Toggle */}
               <button 
                  onClick={onToggleSFX}
                  className={`flex flex-col items-center justify-center gap-2 p-3 rounded-lg border transition-all ${!isSFXMuted ? 'bg-green-600/20 border-green-500/50 text-green-300' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
               >
                   {isSFXMuted ? <VolumeX size={20} className="opacity-50" /> : <Volume2 size={20} />}
                   <span className="text-[10px] font-bold">{isSFXMuted ? 'SFX Off' : 'SFX On'}</span>
               </button>
           </div>
        </div>

        {/* Game Mode Settings */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-4">
           <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-slate-700 pb-2">
               <Skull size={16} className="text-red-400" /> Gameplay
           </h3>
           
           {/* Hard Mode Toggle */}
           <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                   <div className={`p-2 rounded-full ${isHardMode ? 'bg-red-500/20 text-red-400' : 'bg-slate-700 text-slate-400'}`}>
                       <Skull size={18} />
                   </div>
                   <div>
                       <div className="text-white font-bold text-sm">Hard Mode</div>
                       <div className="text-[10px] text-slate-400">Hanya tebakan KOTA yang dihitung.</div>
                   </div>
               </div>
               <button 
                  onClick={() => onToggleHardMode(!isHardMode)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${isHardMode ? 'bg-red-600' : 'bg-slate-600'}`}
               >
                   <span 
                      className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out ${isHardMode ? 'translate-x-6' : 'translate-x-0'}`}
                   />
               </button>
           </div>
        </div>

        {/* Timing & Clues Settings (Hangman Style) */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 border-b border-slate-700 pb-2">
               <Clock size={16} className="text-yellow-400" /> Waktu & Clue
           </h3>

           {/* Conceal Toggle */}
           <div className="flex items-center justify-between">
               <div className="flex items-center gap-2">
                   <div className={`p-2 rounded-full ${settings.concealClues ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700 text-slate-400'}`}>
                       {settings.concealClues ? <EyeOff size={18} /> : <Eye size={18} />}
                   </div>
                   <div>
                       <div className="text-white font-bold text-sm">Conceal Clues</div>
                       <div className="text-[10px] text-slate-400">Sembunyikan nama kota di awal.</div>
                   </div>
               </div>
               <button 
                  onClick={() => updateSetting('concealClues', !settings.concealClues)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${settings.concealClues ? 'bg-cyan-600' : 'bg-slate-600'}`}
               >
                   <span 
                      className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ease-in-out ${settings.concealClues ? 'translate-x-6' : 'translate-x-0'}`}
                   />
               </button>
           </div>

           {/* Round Duration */}
           <div>
               <label className="text-xs font-bold text-slate-400 flex justify-between mb-1">
                   Round Duration (Detik) <span className="text-white">{settings.roundDuration}s</span>
               </label>
               <input 
                  type="range" min="30" max="300" step="10"
                  value={settings.roundDuration}
                  onChange={(e) => updateSetting('roundDuration', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
               />
           </div>

           {/* Concealment Duration */}
           <div className={!settings.concealClues ? 'opacity-50 pointer-events-none' : ''}>
               <label className="text-xs font-bold text-slate-400 flex justify-between mb-1">
                   Concealment Duration (Detik) <span className="text-white">{settings.concealDuration}s</span>
               </label>
               <input 
                  type="range" min="0" max={settings.roundDuration - 10} step="5"
                  value={settings.concealDuration}
                  onChange={(e) => updateSetting('concealDuration', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
               />
               <p className="text-[10px] text-slate-500 mt-1">Waktu sebelum huruf mulai terbuka satu per satu.</p>
           </div>

           {/* Summary Duration */}
           <div>
               <label className="text-xs font-bold text-slate-400 flex justify-between mb-1">
                   Summary Duration (Detik) <span className="text-white">{settings.summaryDuration}s</span>
               </label>
               <input 
                  type="range" min="5" max="60" step="5"
                  value={settings.summaryDuration}
                  onChange={(e) => updateSetting('summaryDuration', parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
               />
               <p className="text-[10px] text-slate-500 mt-1">Otomatis lanjut ronde setelah hasil muncul.</p>
           </div>
        </div>

        {/* ADMIN SHORTCUT BUTTON */}
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
             <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                 <Database size={16} className="text-indigo-400"/> Manajemen Data
             </h3>
             <button
                 onClick={openAdminPanel}
                 className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-white text-xs font-bold flex items-center justify-center gap-2 transition"
             >
                 <ExternalLink size={14} /> Buka Admin Panel (CRUD)
             </button>
             <p className="text-[10px] text-slate-500 mt-2">
                 Kelola database lokasi (Tambah, Edit, Hapus) di halaman khusus.
             </p>
        </div>

        {/* Add Custom Location (Quick) */}
        {onAddLocation && (
            <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                    <MapPin size={16} className="text-green-400"/> Tambah Cepat
                </h3>
                
                {/* URL Input */}
                <div className="mb-3 relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        <Link size={14} />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Paste Link MapCrunch / Google Maps..." 
                        value={urlInput}
                        onChange={handleUrlChange}
                        className="w-full bg-slate-800 border border-slate-600 rounded px-3 pl-9 py-2 text-xs text-white focus:outline-none focus:border-green-500 placeholder-slate-500"
                    />
                </div>

                {/* Manual Lat/Lng Inputs */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                    <input 
                        type="number" 
                        placeholder="Latitude" 
                        value={newLat}
                        onChange={(e) => setNewLat(e.target.value)}
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                    />
                    <input 
                        type="number" 
                        placeholder="Longitude" 
                        value={newLng}
                        onChange={(e) => setNewLng(e.target.value)}
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green-500"
                    />
                </div>
                
                <button 
                    onClick={handleAddLocationClick}
                    disabled={isAddingLoc}
                    className="w-full bg-green-700 hover:bg-green-600 disabled:bg-slate-600 text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 transition"
                >
                    {isAddingLoc ? (
                        <>Loading...</>
                    ) : (
                        <><Search size={14} /> Deteksi & Tambah</>
                    )}
                </button>
                {addLocStatus && (
                    <div className={`mt-2 text-xs p-2 rounded flex items-center gap-2 ${addLocStatus.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {addLocStatus.type === 'success' ? <CheckCircle size={12}/> : <AlertTriangle size={12}/>}
                        {addLocStatus.msg}
                    </div>
                )}
            </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Google Maps API Key (Opsional)
          </label>
          <input
            type="text"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Biarkan kosong untuk Mode Gratis"
            className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Danger Zone */}
        <div className="mb-6 pt-4 border-t border-slate-700">
            <h3 className="text-sm font-bold text-slate-400 mb-2 flex items-center gap-2">
                <AlertTriangle size={14} className="text-yellow-500" /> Data Game
            </h3>
            <button
                onClick={onResetData}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-900/20 border border-red-500/30 text-red-400 hover:bg-red-900/40 hover:border-red-500/60 transition text-sm font-bold"
            >
                <Trash2 size={16} /> Hapus Global Leaderboard
            </button>
        </div>

        <div className="flex justify-end space-x-3 pt-2 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition font-medium"
          >
            Tutup
          </button>
          <button
            onClick={() => onSave(keyInput, settings)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg shadow-blue-500/20"
          >
            Simpan & Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
