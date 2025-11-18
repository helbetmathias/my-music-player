import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, FolderOpen, FileAudio, 
  Volume2, VolumeX, Repeat, Shuffle, ListMusic, Music, Trash2,
  Plus, Menu, X, Disc
} from 'lucide-react';

// Helper function to format time (seconds -> MM:SS)
const formatTime = (time) => {
  if (isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
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
  const [repeatMode, setRepeatMode] = useState('none'); // 'none', 'all', 'one'
  const [showPlaylistMobile, setShowPlaylistMobile] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeCoverArt, setActiveCoverArt] = useState(null); // For the big player

  // Refs
  const audioRef = useRef(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const currentTrackIdRef = useRef(null);

  // Supported extensions
  const supportedTypes = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'];

  // --- Load jsmediatags library dynamically ---
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // --- Audio Logic ---
  useEffect(() => {
    if (currentTrackIndex !== -1 && playlist[currentTrackIndex]) {
      const track = playlist[currentTrackIndex];
      
      if (currentTrackIdRef.current === track.id) return;
      currentTrackIdRef.current = track.id;

      const objectUrl = URL.createObjectURL(track.file);
      
      audioRef.current.src = objectUrl;
      audioRef.current.load();
      
      if (isPlaying) {
        audioRef.current.play().catch(e => console.error("Playback failed:", e));
      }

      if (track.cover) {
        setActiveCoverArt(track.cover);
      } else {
        setActiveCoverArt(null);
        extractArtForActiveTrack(track.file);
      }

      return () => {
        URL.revokeObjectURL(objectUrl);
      };
    }
  }, [currentTrackIndex, playlist, isPlaying]); 

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
        onError: (error) => console.log('Metadata extraction error:', error)
      });
    }
  };

  const onTimeUpdate = () => {
    setCurrentTime(audioRef.current.currentTime);
  };

  const onLoadedMetadata = () => {
    setDuration(audioRef.current.duration);
  };

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
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = currentTrackIndex + 1;
      if (nextIndex >= playlist.length) {
        if (repeatMode === 'all') nextIndex = 0;
        else {
          setIsPlaying(false);
          return; // Stop at end of playlist
        }
      }
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
    if (prevIndex < 0) {
      prevIndex = playlist.length - 1;
    }
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

  // --- Media Session & Keyboard Shortcuts ---
  useEffect(() => {
    const currentTrack = playlist[currentTrackIndex];
    if ('mediaSession' in navigator && currentTrack) {
      const artSrc = activeCoverArt || currentTrack.cover;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.name,
        artist: 'Local Library',
        album: 'SonicFlow',
        artwork: artSrc ? [
          { src: artSrc, sizes: '96x96', type: 'image/png' },
          { src: artSrc, sizes: '512x512', type: 'image/png' },
        ] : []
      });

      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', playPrev);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime && audioRef.current) {
            audioRef.current.currentTime = details.seekTime;
            setCurrentTime(details.seekTime);
          }
      });
    }

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space': e.preventDefault(); togglePlay(); break;
        case 'ArrowRight':
          if (e.ctrlKey || e.metaKey) playNext();
          else if (audioRef.current) {
             audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 5);
             setCurrentTime(audioRef.current.currentTime);
          }
          break;
        case 'ArrowLeft':
          if (e.ctrlKey || e.metaKey) playPrev();
          else if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
            setCurrentTime(audioRef.current.currentTime);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(prev => {
            const newVol = Math.min(1, prev + 0.1);
            audioRef.current.volume = newVol;
            setIsMuted(newVol === 0);
            return newVol;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(prev => {
            const newVol = Math.max(0, prev - 0.1);
            audioRef.current.volume = newVol;
            setIsMuted(newVol === 0);
            return newVol;
          });
          break;
        case 'KeyM': toggleMute(); break;
        default: break;
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
      alert("No supported audio files found in selection.");
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
              setPlaylist(currentPlaylist => 
                currentPlaylist.map(t => t.id === track.id ? { ...t, cover: coverUrl } : t)
              );
            }
          },
          onError: (error) => {}
        });
      });
    }
  };

  const handleFolderSelect = (e) => processFiles(e.target.files);
  const handleFileSelect = (e) => processFiles(e.target.files);

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.items) {
      const files = [];
      [...e.dataTransfer.items].forEach((item, i) => {
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
        let nextIndex;
        if (isShuffle) nextIndex = Math.floor(Math.random() * newPlaylist.length);
        else nextIndex = index < newPlaylist.length ? index : 0;
        
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
    playlist.forEach(track => {
      if (track.cover) URL.revokeObjectURL(track.cover);
    });
    setPlaylist([]);
    setCurrentTrackIndex(-1);
    setIsPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setActiveCoverArt(null);
    currentTrackIdRef.current = null;
  };

  return (
    <div 
      className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden selection:bg-indigo-500 selection:text-white"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={folderInputRef} 
        onChange={handleFolderSelect} 
        webkitdirectory="true" 
        directory="" 
        multiple 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        multiple 
        accept="audio/*" 
        className="hidden" 
      />
      <audio 
        ref={audioRef} 
        onTimeUpdate={onTimeUpdate} 
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onEnded}
      />

      {/* Drag Overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-indigo-600/90 flex items-center justify-center backdrop-blur-sm border-4 border-indigo-400 border-dashed m-4 rounded-2xl">
          <div className="text-center">
            <FolderOpen size={64} className="mx-auto mb-4 text-white animate-bounce" />
            <h2 className="text-3xl font-bold text-white">Drop Files Here</h2>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md z-20 relative">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Music size={18} className="text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-slate-100">Sonic<span className="text-indigo-400">Flow</span></h1>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => fileInputRef.current.click()}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
          >
            <Plus size={16} /> Add Files
          </button>
          <button 
            onClick={() => folderInputRef.current.click()}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10 rounded-md transition-colors border border-indigo-500/30"
          >
            <FolderOpen size={16} /> Add Folder
          </button>
          <button 
            onClick={() => setShowPlaylistMobile(!showPlaylistMobile)}
            className="md:hidden p-2 text-slate-300 hover:bg-slate-800 rounded-full"
          >
            <ListMusic size={24} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex relative overflow-hidden">
        
        {/* Left: Playlist (Sidebar) */}
        {/* Z-INDEX FIX: Changed z-10 to z-40 to properly overlay main content on mobile */}
        <aside className={`
          absolute inset-y-0 left-0 z-40 w-full md:w-80 bg-slate-900/95 md:bg-slate-900/50 border-r border-slate-800 transform transition-transform duration-300 ease-in-out flex flex-col backdrop-blur-xl
          ${showPlaylistMobile ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:relative
        `}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold text-slate-400 text-sm uppercase tracking-wider flex items-center gap-2">
              <ListMusic size={16} /> Your Queue ({playlist.length})
            </h2>
            <div className="flex items-center gap-2">
              {playlist.length > 0 && (
                <button 
                  onClick={clearPlaylist}
                  className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 hover:bg-red-500/10 rounded transition-colors"
                >
                  <Trash2 size={12} /> Clear
                </button>
              )}
              <button onClick={() => setShowPlaylistMobile(false)} className="md:hidden p-1 text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Mobile Only: Add Buttons in Playlist Drawer (since header buttons are hidden) */}
          <div className="md:hidden p-3 flex gap-2 border-b border-slate-800 bg-slate-900/50">
             <button 
               onClick={() => { fileInputRef.current.click(); setShowPlaylistMobile(false); }}
               className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors"
             >
               <Plus size={14} /> Add Files
             </button>
             <button 
               onClick={() => { folderInputRef.current.click(); setShowPlaylistMobile(false); }}
               className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors"
             >
               <FolderOpen size={14} /> Add Folder
             </button>
          </div>

          {/* Playlist Items */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 scrollbar-custom pb-24 md:pb-2">
            {playlist.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 p-6 text-center opacity-60">
                <Disc size={48} className="mb-2" />
                <p>No tracks loaded.</p>
                <p className="text-sm hidden md:block">Drag & drop folder here or use the Add buttons.</p>
                <p className="text-sm md:hidden">Tap buttons above to add music.</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {playlist.map((track, index) => (
                  <li 
                    key={track.id}
                    onClick={() => {
                      setCurrentTrackIndex(index);
                      setIsPlaying(true);
                      setShowPlaylistMobile(false); // Close drawer on selection
                    }}
                    className={`
                      group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200 select-none
                      ${currentTrackIndex === index 
                        ? 'bg-indigo-600/20 border border-indigo-500/30' 
                        : 'hover:bg-slate-800/50 border border-transparent'}
                    `}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`
                        w-10 h-10 rounded overflow-hidden flex-shrink-0 relative
                        ${currentTrackIndex === index ? 'ring-2 ring-indigo-500' : 'bg-slate-800'}
                      `}>
                         {track.cover ? (
                           <img src={track.cover} alt="art" className="w-full h-full object-cover" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center text-slate-500">
                             <FileAudio size={18} />
                           </div>
                         )}
                         {currentTrackIndex === index && isPlaying && (
                           <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <div className="flex gap-0.5 h-3 items-end">
                                <div className="w-0.5 bg-white animate-[music-bar_0.5s_ease-in-out_infinite]" style={{animationDelay: '0ms'}}></div>
                                <div className="w-0.5 bg-white animate-[music-bar_0.6s_ease-in-out_infinite]" style={{animationDelay: '100ms'}}></div>
                                <div className="w-0.5 bg-white animate-[music-bar_0.7s_ease-in-out_infinite]" style={{animationDelay: '200ms'}}></div>
                              </div>
                           </div>
                         )}
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${currentTrackIndex === index ? 'text-indigo-200' : 'text-slate-300'}`}>
                          {track.name}
                        </p>
                        <p className="text-xs text-slate-500">{track.type}</p>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => removeTrack(e, index)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-md transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Right: Visualization & Now Playing */}
        <main className="flex-1 flex flex-col items-center justify-center p-8 relative bg-radial-gradient z-0">
          {/* Background Ambient Glow */}
          <div className={`absolute w-96 h-96 bg-indigo-600 rounded-full blur-3xl opacity-10 pointer-events-none transition-all duration-1000 ${isPlaying ? 'scale-110 opacity-20' : 'scale-90'}`}></div>
          
          <div className="z-10 flex flex-col items-center max-w-2xl w-full text-center space-y-6 md:space-y-8">
            
            {/* Album Art Container - Optimized for mobile size */}
            <div className={`
              w-64 h-64 md:w-80 md:h-80 rounded-2xl shadow-2xl flex items-center justify-center relative overflow-hidden transition-all duration-500
              ${isPlaying ? 'shadow-indigo-500/20 rotate-0' : 'shadow-black/40'}
              bg-slate-900 border border-slate-700 group
            `}>
              {(activeCoverArt || (playlist[currentTrackIndex] && playlist[currentTrackIndex].cover)) ? (
                 <div className="relative w-full h-full group-hover:scale-105 transition-transform duration-700">
                    <img 
                      src={activeCoverArt || playlist[currentTrackIndex].cover} 
                      alt="Album Art" 
                      className="w-full h-full object-cover animate-in fade-in duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
                 </div>
              ) : (playlist[currentTrackIndex]) ? (
                 <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                    <Disc size={120} className={`text-indigo-500/30 ${isPlaying ? 'animate-spin-slow' : ''}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end justify-center p-6">
                       <div className="flex gap-1 h-16 items-end justify-center w-full">
                          {[...Array(12)].map((_, i) => (
                             <div 
                               key={i} 
                               className={`w-3 bg-indigo-500 rounded-t-sm transition-all duration-150 ease-out ${isPlaying ? 'opacity-100' : 'opacity-20 h-2'}`}
                               style={{
                                 height: isPlaying ? `${Math.max(15, Math.random() * 100)}%` : '10%',
                                 transitionDelay: `${i * 0.05}s`
                               }}
                             ></div>
                          ))}
                       </div>
                    </div>
                 </div>
              ) : (
                <div className="text-slate-600 flex flex-col items-center gap-2">
                  <Music size={64} />
                </div>
              )}
            </div>

            {/* Song Info - Fixed Text Scaling */}
            <div className="space-y-2 w-full px-4">
              <h2 className="text-xl md:text-4xl font-bold text-white tracking-tight drop-shadow-lg line-clamp-2 md:line-clamp-1">
                {playlist[currentTrackIndex] ? playlist[currentTrackIndex].name : "No Track Selected"}
              </h2>
              <p className="text-indigo-400 font-medium tracking-wide text-sm md:text-base">
                {playlist[currentTrackIndex] ? "Local Library" : "Select files to begin"}
              </p>
            </div>

          </div>
        </main>
      </div>

      {/* Player Controls Bar */}
      <div className="h-24 bg-slate-900 border-t border-slate-800 px-4 md:px-8 flex items-center gap-6 z-50 relative">
        
        {/* Playback Controls */}
        <div className="flex items-center gap-4 flex-1 md:flex-none justify-center md:justify-start order-2 md:order-1 w-full md:w-1/3">
          <button 
            onClick={() => setIsShuffle(!isShuffle)}
            className={`p-2 rounded-full transition-colors ${isShuffle ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}
            title="Shuffle"
          >
            <Shuffle size={18} />
          </button>
          
          <button onClick={playPrev} className="text-slate-300 hover:text-white transition-colors p-2">
            <SkipBack size={24} fill="currentColor" />
          </button>
          
          <button 
            onClick={togglePlay}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-white text-slate-900 hover:scale-105 transition-all shadow-lg shadow-white/10"
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
          </button>
          
          <button onClick={playNext} className="text-slate-300 hover:text-white transition-colors p-2">
            <SkipForward size={24} fill="currentColor" />
          </button>

          <button 
            onClick={() => setRepeatMode(prev => prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none')}
            className={`p-2 rounded-full transition-colors relative ${repeatMode !== 'none' ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-300'}`}
            title="Repeat"
          >
            <Repeat size={18} />
            {repeatMode === 'one' && <span className="absolute text-[8px] font-bold bottom-1 right-1.5">1</span>}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full flex-1 order-1 md:order-2 absolute top-0 left-0 right-0 -mt-1.5 md:relative md:mt-0 md:mx-4 group">
           <div className="flex items-center gap-3 w-full">
             <span className="text-xs font-mono text-slate-400 w-10 text-right hidden md:block">{formatTime(currentTime)}</span>
             <div className="relative flex-1 h-4 flex items-center group-hover:h-4">
                <input 
                  type="range" 
                  min={0} 
                  max={duration || 0} 
                  value={currentTime} 
                  onChange={handleSeek}
                  className="absolute z-20 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 relative" 
                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                  >
                     <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity md:block hidden" />
                  </div>
                </div>
             </div>
             <span className="text-xs font-mono text-slate-400 w-10 hidden md:block">{formatTime(duration)}</span>
           </div>
        </div>

        {/* Volume */}
        <div className="hidden md:flex items-center gap-3 w-1/3 justify-end order-3">
           <button onClick={toggleMute} className="text-slate-400 hover:text-white">
             {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
           </button>
           <div className="w-24 group relative flex items-center h-8">
             <input 
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolume}
                className="absolute z-10 w-full h-full opacity-0 cursor-pointer"
             />
             <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
               <div 
                 className="h-full bg-slate-300"
                 style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
               />
             </div>
           </div>
        </div>
      </div>
      
      <style>{`
        @keyframes music-bar {
          0%, 100% { height: 20%; }
          50% { height: 100%; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        .bg-radial-gradient {
          background-image: radial-gradient(circle at center, rgb(30, 41, 59) 0%, rgb(2, 6, 23) 100%);
        }
        
        /* Custom Scrollbar */
        .scrollbar-custom::-webkit-scrollbar {
          width: 6px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: rgba(15, 23, 42, 0.5);
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: #6366f1;
        }
      `}</style>
    </div>
  );
}