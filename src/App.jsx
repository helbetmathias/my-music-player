import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, FolderOpen, FileAudio, 
  Volume2, VolumeX, Repeat, Shuffle, ListMusic, Music, Trash2,
  Plus, Menu, X, Disc, Search
} from 'lucide-react';

// Helper function to format time (seconds -> MM:SS)
const formatTime = (time) => {
  if (isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
};

// Helper to extract dominant color
const getDominantColor = (imageUrl, callback) => {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  img.src = imageUrl;
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1;
    canvas.height = 1;
    ctx.drawImage(img, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    callback(`rgb(${r}, ${g}, ${b})`);
  };
  img.onerror = () => callback(null);
};

export default function App() {
  // --- State Management ---
  const [playlist, setPlaylist] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState('none');
  const [showPlaylistMobile, setShowPlaylistMobile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeCoverArt, setActiveCoverArt] = useState(null);
  
  // Feature States
  const [searchQuery, setSearchQuery] = useState("");
  const [themeColor, setThemeColor] = useState("rgb(99, 102, 241)"); // Default Indigo-500

  // Refs
  const audioRef = useRef(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentTrackIdRef = useRef(null);

  // Visualizer Refs
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationRef = useRef(null);

  // Supported extensions
  const supportedTypes = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'];

  // --- Load jsmediatags ---
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if(document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  // --- Audio Logic ---
  useEffect(() => {
    if (currentTrackIndex !== -1 && playlist[currentTrackIndex]) {
      const track = playlist[currentTrackIndex];
      
      // Only reload if track ID changed
      if (currentTrackIdRef.current !== track.id) {
        currentTrackIdRef.current = track.id;
        const objectUrl = URL.createObjectURL(track.file);
        audioRef.current.src = objectUrl;
        audioRef.current.load();
        
        // Extract art for the main player
        if (track.cover) {
          setActiveCoverArt(track.cover);
        } else {
          setActiveCoverArt(null);
          extractArtForActiveTrack(track.file);
        }
      }
      
      if (isPlaying) {
        audioRef.current.play()
          .then(() => initAudioContext()) 
          .catch(e => console.error("Playback failed:", e));
      }
    }
  }, [currentTrackIndex, playlist, isPlaying]); 

  // --- Visualizer Logic ---
  const initAudioContext = () => {
    if (!audioContextRef.current && audioRef.current) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 128; 
        
        sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
        
        drawVisualizer();
      } catch (e) {
        console.warn("Audio API error:", e);
      }
    } else if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const renderFrame = () => {
      animationRef.current = requestAnimationFrame(renderFrame);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw bars
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        ctx.fillStyle = `rgba(255, 255, 255, 0.5)`; 
        
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth - 1, barHeight, [2, 2, 0, 0]);
        ctx.fill();

        x += barWidth;
      }
    };
    renderFrame();
  };

  useEffect(() => {
    return () => { if(animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  // --- Dynamic Theme Color (Only for Glow) ---
  useEffect(() => {
    if (activeCoverArt) {
      getDominantColor(activeCoverArt, (color) => {
        if (color) setThemeColor(color);
      });
    } else {
      setThemeColor("rgb(99, 102, 241)");
    }
  }, [activeCoverArt]);

  const extractArtForActiveTrack = (file) => {
    if (window.jsmediatags) {
      window.jsmediatags.read(file, {
        onSuccess: (tag) => {
          const { picture } = tag.tags;
          if (picture) {
            const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format });
            const artUrl = URL.createObjectURL(blob);
            setActiveCoverArt(artUrl);
          }
        },
        onError: () => {}
      });
    }
  };

  const onTimeUpdate = () => setCurrentTime(audioRef.current.currentTime);
  const onLoadedMetadata = () => setDuration(audioRef.current.duration);
  const onEnded = () => {
    if (repeatMode === 'one') {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    } else {
      playNext();
    }
  };

  // --- Controls ---
  const togglePlay = () => {
    initAudioContext();
    if (currentTrackIndex === -1 && playlist.length > 0) {
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    } else if (currentTrackIndex !== -1) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const playNext = () => {
    if (playlist.length === 0) return;
    let nextIndex;
    if (isShuffle) nextIndex = Math.floor(Math.random() * playlist.length);
    else nextIndex = currentTrackIndex + 1;
    
    if (nextIndex >= playlist.length) {
      if (repeatMode === 'all') nextIndex = 0;
      else { setIsPlaying(false); return; }
    }
    setCurrentTrackIndex(nextIndex);
    setIsPlaying(true);
  };

  const playPrev = () => {
    if (playlist.length === 0) return;
    if (currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    let prevIndex = currentTrackIndex - 1;
    if (prevIndex < 0) prevIndex = playlist.length - 1;
    setCurrentTrackIndex(prevIndex);
    setIsPlaying(true);
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const handleVolume = (e) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    audioRef.current.volume = vol;
    setIsMuted(vol === 0);
  };

  const toggleMute = () => {
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // --- Media Session & Shortcuts ---
  useEffect(() => {
    const currentTrack = playlist[currentTrackIndex];
    if ('mediaSession' in navigator && currentTrack) {
      const artSrc = activeCoverArt || currentTrack.cover;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.name,
        artist: 'Local Library',
        album: 'SonicFlow',
        artwork: artSrc ? [{ src: artSrc, sizes: '512x512', type: 'image/png' }] : []
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', playPrev);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight': 
          if(e.ctrlKey) playNext(); 
          else if(audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 5);
          break;
        case 'ArrowLeft':
          if(e.ctrlKey) playPrev();
          else if(audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
          break;
        case 'KeyM': toggleMute(); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTrackIndex, isPlaying, activeCoverArt, togglePlay, playNext, playPrev, toggleMute]);

  // --- File Handling ---
  const processFiles = async (files) => {
    const newTracks = Array.from(files)
      .filter(file => supportedTypes.some(ext => file.name.toLowerCase().endsWith(ext)))
      .map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name.replace(/\.[^/.]+$/, ""),
        type: file.name.split('.').pop().toUpperCase(),
        file: file,
        cover: null 
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (newTracks.length === 0) {
      alert("No supported audio files found.");
      return;
    }
    setPlaylist(prev => [...prev, ...newTracks]);

    if (window.jsmediatags) {
      newTracks.forEach(track => {
        window.jsmediatags.read(track.file, {
          onSuccess: (tag) => {
            const { picture } = tag.tags;
            if (picture) {
              const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format });
              const coverUrl = URL.createObjectURL(blob);
              setPlaylist(prev => prev.map(t => t.id === track.id ? { ...t, cover: coverUrl } : t));
            }
          },
          onError: () => {}
        });
      });
    }
  };

  const handleFolderSelect = (e) => processFiles(e.target.files);
  const handleFileSelect = (e) => processFiles(e.target.files);
  
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.items) {
      const files = [];
      [...e.dataTransfer.items].forEach((item) => {
        if (item.kind === 'file') files.push(item.getAsFile());
      });
      processFiles(files);
    }
  };

  const removeTrack = (e, index) => {
    e.stopPropagation();
    const trackToRemove = playlist[index];
    if (trackToRemove.cover) URL.revokeObjectURL(trackToRemove.cover);

    const newPlaylist = [...playlist];
    newPlaylist.splice(index, 1);
    
    if (index === currentTrackIndex) {
      if (newPlaylist.length === 0) {
        setIsPlaying(false);
        setCurrentTrackIndex(-1);
        setDuration(0);
        setCurrentTime(0);
        setActiveCoverArt(null);
        currentTrackIdRef.current = null;
      } else {
        let nextIndex = isShuffle ? Math.floor(Math.random() * newPlaylist.length) : (index < newPlaylist.length ? index : 0);
        setCurrentTrackIndex(nextIndex);
        currentTrackIdRef.current = null; 
        setIsPlaying(true);
      }
    } else if (index < currentTrackIndex) {
      setCurrentTrackIndex(currentTrackIndex - 1);
    }
    setPlaylist(newPlaylist);
  };

  const clearPlaylist = () => {
    playlist.forEach(track => { if(track.cover) URL.revokeObjectURL(track.cover); });
    setPlaylist([]);
    setCurrentTrackIndex(-1);
    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setActiveCoverArt(null);
    currentTrackIdRef.current = null;
    setThemeColor("rgb(99, 102, 241)");
  };

  // --- Filtered Playlist ---
  const filteredPlaylist = useMemo(() => {
    if (!searchQuery) return playlist;
    return playlist.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [playlist, searchQuery]);

  const getOriginalIndex = (trackId) => playlist.findIndex(t => t.id === trackId);

  return (
    <div 
      className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-indigo-500/30 selection:text-white"
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Hidden Inputs */}
      <input type="file" ref={folderInputRef} onChange={handleFolderSelect} webkitdirectory="true" directory="" multiple className="hidden" />
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept="audio/*" className="hidden" />
      <audio ref={audioRef} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} crossOrigin="anonymous" />

      {/* Drag Overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-indigo-900/80 flex items-center justify-center backdrop-blur-sm border-4 border-indigo-400 border-dashed m-4 rounded-2xl">
          <div className="text-center">
            <FolderOpen size={64} className="mx-auto mb-4 text-white animate-bounce" />
            <h2 className="text-3xl font-bold text-white">Drop Files Here</h2>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md z-20 relative">
        <div className="flex items-center gap-3">
          {/* STATIC LOGO COLORS */}
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg bg-gradient-to-br from-indigo-500 to-purple-600"
          >
            <Music size={18} className="text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-slate-100">
            Sonic<span className="text-indigo-400">Flow</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current.click()} className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors">
            <Plus size={16} /> Add Files
          </button>
          <button onClick={() => folderInputRef.current.click()} className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors border border-slate-700">
            <FolderOpen size={16} /> Add Folder
          </button>
          <button onClick={() => setShowPlaylistMobile(!showPlaylistMobile)} className="md:hidden p-2 text-slate-300 hover:bg-slate-800 rounded-full">
            <ListMusic size={24} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        
        {/* Sidebar */}
        <aside className={`
          absolute inset-y-0 left-0 z-40 w-full md:w-80 bg-slate-900/95 md:bg-slate-900/50 border-r border-slate-800 transform transition-transform duration-300 ease-in-out flex flex-col backdrop-blur-xl
          ${showPlaylistMobile ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative
        `}>
          {/* Sidebar Header & Search */}
          <div className="p-4 border-b border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-400 text-sm uppercase tracking-wider flex items-center gap-2">
                <ListMusic size={16} /> Queue ({playlist.length})
              </h2>
              <div className="flex items-center gap-2">
                {playlist.length > 0 && (
                  <button onClick={clearPlaylist} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 hover:bg-red-500/10 rounded transition-colors">
                    <Trash2 size={12} /> Clear
                  </button>
                )}
                <button onClick={() => setShowPlaylistMobile(false)} className="md:hidden p-1 text-slate-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
            </div>
            {/* Search Input */}
            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-slate-300 transition-colors" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search library..."
                className="w-full bg-slate-800/50 border border-slate-700 rounded-full py-1.5 pl-9 pr-4 text-sm text-slate-200 focus:outline-none focus:border-slate-500 focus:bg-slate-800 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Mobile Add Buttons */}
          <div className="md:hidden p-3 flex gap-2 border-b border-slate-800 bg-slate-900/50">
             <button onClick={() => { fileInputRef.current.click(); setShowPlaylistMobile(false); }} className="flex-1 bg-slate-800 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2"><Plus size={14} /> Add Files</button>
             <button onClick={() => { folderInputRef.current.click(); setShowPlaylistMobile(false); }} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2"><FolderOpen size={14} /> Add Folder</button>
          </div>

          {/* Playlist Items */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-custom pb-24 md:pb-2">
            {filteredPlaylist.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 p-6 text-center opacity-60">
                {searchQuery ? <p>No matches found.</p> : (
                  <>
                    <Disc size={48} className="mb-2" />
                    <p>No tracks loaded.</p>
                    <p className="text-sm hidden md:block">Drag & drop folder here.</p>
                  </>
                )}
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredPlaylist.map((track, filteredIndex) => {
                  const originalIndex = getOriginalIndex(track.id);
                  return (
                    <li 
                      key={track.id}
                      onClick={() => {
                        setCurrentTrackIndex(originalIndex);
                        setIsPlaying(true);
                        setShowPlaylistMobile(false);
                      }}
                      className={`
                        group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-200 select-none
                        ${currentTrackIndex === originalIndex 
                          ? 'bg-indigo-600/20 border border-indigo-500/50' 
                          : 'hover:bg-slate-800/50 border border-transparent'}
                      `}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`
                          w-10 h-10 rounded overflow-hidden flex-shrink-0 relative
                          ${currentTrackIndex === originalIndex ? 'ring-2 ring-indigo-500' : 'bg-slate-800'}
                        `}>
                          {track.cover ? (
                            <img src={track.cover} alt="art" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500"><FileAudio size={18} /></div>
                          )}
                          {/* No overlay circle or animation here to prevent flickering */}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${currentTrackIndex === originalIndex ? 'text-indigo-200' : 'text-slate-300'}`}>
                            {track.name}
                          </p>
                          <p className="text-xs text-slate-500">{track.type}</p>
                        </div>
                      </div>
                      <button onClick={(e) => removeTrack(e, originalIndex)} className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-md transition-all">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right: Visualization & Now Playing */}
        <main className="flex-1 flex flex-col items-center justify-center p-8 relative z-0">
          {/* Dynamic Ambient Glow (Subtle) */}
          <div 
            className={`absolute w-96 h-96 rounded-full blur-[100px] opacity-20 pointer-events-none transition-colors duration-1000 ${isPlaying ? 'scale-110' : 'scale-90'}`}
            style={{ backgroundColor: themeColor }}
          ></div>
          
          <div className="z-10 flex flex-col items-center max-w-2xl w-full text-center space-y-6 md:space-y-8">
            
            {/* Album Art Container */}
            <div 
              className={`
                w-64 h-64 md:w-80 md:h-80 rounded-2xl shadow-2xl flex items-center justify-center relative overflow-hidden transition-all duration-500
                ${isPlaying ? 'shadow-lg' : 'shadow-black/40'}
                bg-slate-900 border border-slate-700 group
              `}
              style={{ boxShadow: isPlaying ? `0 20px 50px -12px ${themeColor}66` : '' }}
            >
              {(activeCoverArt || (playlist[currentTrackIndex] && playlist[currentTrackIndex].cover)) ? (
                 <div className="relative w-full h-full group-hover:scale-105 transition-transform duration-700 z-10">
                    <img 
                      src={activeCoverArt || playlist[currentTrackIndex].cover} 
                      alt="Album Art" 
                      className="w-full h-full object-cover animate-in fade-in duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent"></div>
                 </div>
              ) : (playlist[currentTrackIndex]) ? (
                 <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 z-10">
                    <Disc size={120} className={`text-slate-700 ${isPlaying ? 'animate-spin-slow' : ''}`} />
                 </div>
              ) : (
                <div className="text-slate-600 flex flex-col items-center gap-2 z-10"><Music size={64} /></div>
              )}

              {/* Real Audio Visualizer Overlay (Inside container) */}
              <div className="absolute bottom-0 left-0 right-0 h-32 z-20 pointer-events-none opacity-90 mix-blend-overlay">
                 <canvas ref={canvasRef} width={320} height={128} className="w-full h-full" />
              </div>
            </div>

            {/* Song Info */}
            <div className="space-y-2 w-full px-4">
              <h2 className="text-xl md:text-4xl font-bold text-white tracking-tight drop-shadow-lg line-clamp-2 md:line-clamp-1">
                {playlist[currentTrackIndex] ? playlist[currentTrackIndex].name : "No Track Selected"}
              </h2>
              <p className="font-medium tracking-wide text-sm md:text-base transition-colors duration-1000" style={{ color: themeColor }}>
                {playlist[currentTrackIndex] ? "Local Library" : "Select files to begin"}
              </p>
            </div>

          </div>
        </main>
      </div>

      {/* Player Controls Bar */}
      <div className="h-24 bg-slate-900 border-t border-slate-800 px-4 md:px-8 flex items-center gap-6 z-50 relative">
        <div className="flex items-center gap-4 flex-1 md:flex-none justify-center md:justify-start order-2 md:order-1 w-full md:w-1/3">
          <button onClick={() => setIsShuffle(!isShuffle)} className={`p-2 rounded-full transition-colors ${isShuffle ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}>
            <Shuffle size={18} />
          </button>
          <button onClick={playPrev} className="text-slate-300 hover:text-white transition-colors p-2"><SkipBack size={24} fill="currentColor" /></button>
          <button onClick={togglePlay} className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-slate-900 hover:scale-105 transition-all shadow-lg shadow-white/10">
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={playNext} className="text-slate-300 hover:text-white transition-colors p-2"><SkipForward size={24} fill="currentColor" /></button>
          <button onClick={() => setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')} className={`p-2 rounded-full transition-colors relative ${repeatMode !== 'none' ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}>
            <Repeat size={18} />
            {repeatMode === 'one' && <span className="absolute text-[8px] font-bold bottom-1 right-1.5">1</span>}
          </button>
        </div>

        <div className="w-full flex-1 order-1 md:order-2 absolute top-0 left-0 right-0 -mt-1.5 md:relative md:mt-0 md:mx-4 group">
           <div className="flex items-center gap-3 w-full">
             <span className="text-xs font-mono text-slate-400 w-10 text-right hidden md:block">{formatTime(currentTime)}</span>
             <div className="relative flex-1 h-4 flex items-center group-hover:h-4">
                <input type="range" min={0} max={duration || 0} value={currentTime} onChange={handleSeek} className="absolute z-20 w-full h-full opacity-0 cursor-pointer" />
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full relative transition-colors duration-1000" style={{ width: `${(currentTime / (duration || 1)) * 100}%`, backgroundColor: themeColor }}>
                     <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity md:block hidden" />
                  </div>
                </div>
             </div>
             <span className="text-xs font-mono text-slate-400 w-10 hidden md:block">{formatTime(duration)}</span>
           </div>
        </div>

        <div className="hidden md:flex items-center gap-3 w-1/3 justify-end order-3">
           <button onClick={toggleMute} className="text-slate-400 hover:text-white">{isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
           <div className="w-24 group relative flex items-center h-8">
             <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={handleVolume} className="absolute z-10 w-full h-full opacity-0 cursor-pointer" />
             <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
               <div className="h-full bg-slate-300" style={{ width: `${(isMuted ? 0 : volume) * 100}%` }} />
             </div>
           </div>
        </div>
      </div>
      
      <style>{`
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
        
        /* Custom Scrollbar */
        .scrollbar-custom::-webkit-scrollbar { width: 6px; }
        .scrollbar-custom::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); }
        .scrollbar-custom::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover { background: #6366f1; }
      `}</style>
    </div>
  );
}
