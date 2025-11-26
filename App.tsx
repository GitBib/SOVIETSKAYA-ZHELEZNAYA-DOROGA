import React, { useState, useEffect, useRef } from 'react';
import PostSovietTrainView from './components/PostSovietTrainView';

export type TimeOfDay = 'day' | 'night';
export type Weather = 'clear' | 'cloudy' | 'rain';

const App: React.FC = () => {
  const [isOverlayVisible, setIsOverlayVisible] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isAutoMode, setIsAutoMode] = useState(true);
  
  // Environment State
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('night');
  const [weather, setWeather] = useState<Weather>('clear');

  // Trip Data (Generated "Robot" Data)
  const [dayCount, setDayCount] = useState(() => Math.floor(Math.random() * 200) + 14);
  const [sector, setSector] = useState(() => Math.floor(Math.random() * 20) + 1);
  const [flightId] = useState(() => Math.floor(Math.random() * 899) + 100);

  // Track previous time to increment Day on Night -> Day transition
  const prevTimeRef = useRef<TimeOfDay>(timeOfDay);

  useEffect(() => {
    // Detect Night -> Day transition
    if (prevTimeRef.current === 'night' && timeOfDay === 'day') {
      setDayCount(prev => prev + 1);
      // Small chance to change sector on new day
      if (Math.random() > 0.8) {
        setSector(prev => prev + 1);
      }
    }
    prevTimeRef.current = timeOfDay;
  }, [timeOfDay]);

  // Automatic Cycle: Changes every minute (representing time passing)
  useEffect(() => {
    if (!isAutoMode) return;

    const randomizeEnvironment = () => {
      // Random Time
      const times: TimeOfDay[] = ['day', 'night'];
      const newTime = times[Math.floor(Math.random() * times.length)];
      
      // Random Weather
      const weathers: Weather[] = ['clear', 'cloudy', 'rain'];
      const newWeather = weathers[Math.floor(Math.random() * weathers.length)];

      setTimeOfDay(newTime);
      setWeather(newWeather);
    };

    const intervalId = setInterval(randomizeEnvironment, 60000); // 60 seconds
    return () => clearInterval(intervalId);
  }, [isAutoMode]);

  const toggleTime = () => {
    setIsAutoMode(false);
    setTimeOfDay(prev => prev === 'day' ? 'night' : 'day');
  };

  const cycleWeather = () => {
    setIsAutoMode(false);
    const states: Weather[] = ['clear', 'cloudy', 'rain'];
    const nextIndex = (states.indexOf(weather) + 1) % states.length;
    setWeather(states[nextIndex]);
  };

  const getTranslitWeather = (w: Weather) => {
    switch(w) {
        case 'clear': return 'YASNO';
        case 'cloudy': return 'OBLACHNO';
        case 'rain': return 'DOZHD';
    }
  };

  const getTranslitTime = (t: TimeOfDay) => {
      return t === 'day' ? 'DEN' : 'NOCH';
  };

  return (
    <div className="relative w-full h-screen bg-neutral-900 text-white overflow-hidden font-mono">
      {/* 3D Scene Background */}
      <div className="absolute inset-0 z-0">
        <PostSovietTrainView 
          audioEnabled={isAudioEnabled} 
          timeOfDay={timeOfDay}
          weather={weather}
        />
      </div>

      {/* UI Overlay */}
      <div 
        className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-1000 ${isOverlayVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="absolute top-8 left-8 p-6 bg-black/70 backdrop-blur-sm border-l-4 border-red-600 max-w-lg shadow-2xl">
          <div className="flex justify-between items-start">
            <h1 className="text-2xl font-bold tracking-widest mb-2 text-gray-100 leading-tight">
              SOVIETSKAYA<br/>ZHELEZNAYA DOROGA
            </h1>
            {isAutoMode && <span className="text-[10px] bg-red-900/50 text-red-200 px-2 py-1 rounded border border-red-700/50 animate-pulse ml-4 tracking-widest">AVTO</span>}
          </div>
          <p className="text-red-400/80 text-xs tracking-[0.2em] mb-1">SYSTEM_TERMINAL_V.19.84</p>
          <div className="h-px w-full bg-gray-700 mb-3"></div>
          <p className="text-gray-300 text-sm leading-relaxed mb-4 tracking-wide">
            PROMZONA &bull; SEKTOR_{sector.toString().padStart(2, '0')} &bull; REYS_{flightId}
          </p>
          <div className="flex gap-4 text-xs text-green-500/80 font-mono border-t border-gray-700 pt-3 uppercase tracking-wider">
             <span>DEN: {dayCount}</span>
             <span className="text-gray-600">//</span>
             <span>POGODA: {getTranslitWeather(weather)}</span>
             <span className="text-gray-600">//</span>
             <span>VREMYA: {getTranslitTime(timeOfDay)}</span>
          </div>
        </div>
      </div>

      {/* Controls Container */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-3 items-end">
         
        <div className="flex gap-2">
           <button 
             onClick={toggleTime}
             className="bg-black/40 hover:bg-black/60 text-amber-500/80 hover:text-amber-400 px-3 py-2 text-xs rounded-none uppercase tracking-widest backdrop-blur-md transition-all border border-white/10 hover:border-amber-500/50"
           >
             VREMYA: {getTranslitTime(timeOfDay)}
           </button>
           <button 
             onClick={cycleWeather}
             className="bg-black/40 hover:bg-black/60 text-blue-300/80 hover:text-blue-200 px-3 py-2 text-xs rounded-none uppercase tracking-widest backdrop-blur-md transition-all border border-white/10 hover:border-blue-300/50"
           >
             POGODA: {getTranslitWeather(weather)}
           </button>
        </div>

        <div className="flex gap-2">
            <button 
                onClick={() => setIsAutoMode(!isAutoMode)}
                className={`px-3 py-2 text-xs rounded-none uppercase tracking-widest backdrop-blur-md transition-all border 
                ${isAutoMode
                ? 'bg-green-900/60 text-green-200 border-green-700/50' 
                : 'bg-white/10 text-white/50 hover:bg-white/20 border-white/10'
                }`}
            >
                AVTO: {isAutoMode ? 'VKL' : 'VYKL'}
            </button>

            {/* Audio Toggle */}
            <button 
            onClick={() => setIsAudioEnabled(!isAudioEnabled)}
            className={`px-4 py-2 text-xs rounded-none uppercase tracking-widest backdrop-blur-md transition-all border 
                ${isAudioEnabled 
                ? 'bg-amber-600/60 text-white hover:bg-amber-500/60 border-amber-600/50' 
                : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white border-white/10'
                }`}
            >
            {isAudioEnabled ? 'ZVUK: VKL' : 'ZVUK: VYKL'}
            </button>
        </div>

        {/* UI Toggle */}
        <button 
          onClick={() => setIsOverlayVisible(!isOverlayVisible)}
          className="bg-white/10 hover:bg-white/20 text-white/50 hover:text-white px-4 py-2 text-xs rounded-none uppercase tracking-widest backdrop-blur-md transition-all border border-white/10"
        >
          {isOverlayVisible ? 'SKRYT INTERFEYS' : 'POKAZAT INTERFEYS'}
        </button>
      </div>
    </div>
  );
};

export default App;