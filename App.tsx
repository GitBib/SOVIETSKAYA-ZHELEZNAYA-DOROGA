
import React, { useState, useEffect, useRef } from 'react';
import PostSovietTrainView from './components/PostSovietTrainView';

export type TimeOfDay = 'day' | 'night';
export type Weather = 'clear' | 'cloudy' | 'rain' | 'snow';

const App: React.FC = () => {
  const [isOverlayVisible, setIsOverlayVisible] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isAutoMode, setIsAutoMode] = useState(true);
  
  // Environment State
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('night');
  const [weather, setWeather] = useState<Weather>('clear');

  // Radio State
  const [isRadioOn, setIsRadioOn] = useState(false);
  const [radioFreq, setRadioFreq] = useState(94.5); // Start off-station
  const [radioVol, setRadioVol] = useState(0.5);

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
      const weathers: Weather[] = ['clear', 'cloudy', 'rain', 'snow'];
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
    const states: Weather[] = ['clear', 'cloudy', 'rain', 'snow'];
    const nextIndex = (states.indexOf(weather) + 1) % states.length;
    setWeather(states[nextIndex]);
  };

  const getTranslitWeather = (w: Weather) => {
    switch(w) {
        case 'clear': return 'YASNO';
        case 'cloudy': return 'OBLACHNO';
        case 'rain': return 'DOZHD';
        case 'snow': return 'SNEG';
    }
  };

  const getTranslitTime = (t: TimeOfDay) => {
      return t === 'day' ? 'DEN' : 'NOCH';
  };

  // Calculate simulated signal strength based on known stations
  // Stations at 96.0 and 104.5
  const getSignalStrength = (freq: number) => {
      const stations = [96.0, 104.5];
      let maxStrength = 0;
      stations.forEach(station => {
          const dist = Math.abs(freq - station);
          if (dist < 1.5) {
              const strength = 1 - (dist / 1.5);
              if (strength > maxStrength) maxStrength = strength;
          }
      });
      return maxStrength;
  };

  const signalStrength = getSignalStrength(radioFreq);

  return (
    <div className="relative w-full h-screen bg-black text-amber-500 overflow-hidden font-mono selection:bg-amber-900 selection:text-white">
      {/* CRT Styles */}
      <style>{`
        @keyframes scanline {
          0% { transform: translateY(0); }
          100% { transform: translateY(100vh); }
        }
        @keyframes flicker {
          0% { opacity: 0.97; }
          5% { opacity: 0.92; }
          10% { opacity: 0.98; }
          15% { opacity: 0.94; }
          20% { opacity: 0.98; }
          50% { opacity: 0.99; }
          80% { opacity: 0.96; }
          100% { opacity: 0.97; }
        }
        .crt-overlay::before {
          content: " ";
          display: block;
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          right: 0;
          background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
          z-index: 50;
          background-size: 100% 2px, 3px 100%;
          pointer-events: none;
        }
        .crt-scanline {
          width: 100%;
          height: 5px;
          background: rgba(255, 255, 255, 0.04);
          position: absolute;
          z-index: 51;
          top: 0;
          left: 0;
          animation: scanline 6s linear infinite;
          pointer-events: none;
        }
        .crt-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle, rgba(0,0,0,0) 60%, rgba(0,0,0,0.6) 100%);
          z-index: 52;
          pointer-events: none;
        }
        .text-glow {
          text-shadow: 0 0 4px rgba(245, 158, 11, 0.5), 0 0 8px rgba(245, 158, 11, 0.3);
        }
        .border-tech {
          position: relative;
          border: 1px solid rgba(245, 158, 11, 0.3);
          background: rgba(10, 5, 0, 0.85);
        }
        .border-tech::before {
          content: '';
          position: absolute;
          top: -1px; left: -1px;
          width: 6px; height: 6px;
          border-top: 2px solid rgba(245, 158, 11, 0.8);
          border-left: 2px solid rgba(245, 158, 11, 0.8);
        }
        .border-tech::after {
          content: '';
          position: absolute;
          bottom: -1px; right: -1px;
          width: 6px; height: 6px;
          border-bottom: 2px solid rgba(245, 158, 11, 0.8);
          border-right: 2px solid rgba(245, 158, 11, 0.8);
        }
        .toggle-switch {
          appearance: none;
          width: 32px;
          height: 12px;
          background: #332211;
          border: 1px solid #775522;
          position: relative;
          cursor: pointer;
          outline: none;
        }
        .toggle-switch::after {
          content: '';
          position: absolute;
          top: 1px; left: 1px;
          width: 8px; height: 8px;
          background: #554433;
          transition: 0.2s;
        }
        .toggle-switch:checked {
          background: #553311;
          border-color: #aa7722;
        }
        .toggle-switch:checked::after {
          left: 21px;
          background: #ff9933;
          box-shadow: 0 0 5px #ff9933;
        }
        .mechanical-btn:active {
            transform: translateY(1px);
        }
      `}</style>

      {/* 3D Scene Background */}
      <div className="absolute inset-0 z-0">
        <PostSovietTrainView 
          audioEnabled={isAudioEnabled} 
          timeOfDay={timeOfDay}
          weather={weather}
          radioOn={isRadioOn}
          radioFreq={radioFreq}
          radioVol={radioVol}
        />
      </div>

      {/* CRT Overlay Effects - Pass through clicks */}
      <div className="absolute inset-0 z-[100] crt-overlay pointer-events-none animate-[flicker_4s_infinite]">
        <div className="crt-scanline"></div>
        <div className="crt-vignette"></div>
      </div>

      {/* UI Layer - Pointer events none on container, auto on children */}
      <div 
        className={`absolute inset-0 z-10 transition-opacity duration-1000 ${isOverlayVisible ? 'opacity-100' : 'opacity-0'} pointer-events-none`}
      >
        {/* Top Info Panel - Compacted */}
        <div className="absolute top-4 left-4 p-3 border-tech w-64 shadow-lg backdrop-blur-sm pointer-events-auto">
          <div className="flex justify-between items-start mb-2 border-b border-amber-900/50 pb-1">
            <h1 className="text-sm font-bold tracking-widest text-amber-500 leading-none text-glow">
              SOVIETSKAYA<br/>ZHELEZNAYA DOROGA
            </h1>
            {isAutoMode && <span className="text-[9px] bg-amber-900/40 text-amber-200 px-1 py-0.5 border border-amber-500/50 animate-pulse tracking-widest">AUTO</span>}
          </div>
          
          <div className="space-y-1 text-[10px] font-mono text-amber-400/80">
             <div className="flex justify-between">
                <span className="opacity-60">SEKTOR</span>
                <span className="text-amber-300">{sector.toString().padStart(3, '0')}</span>
             </div>
             <div className="flex justify-between">
                <span className="opacity-60">REYS_ID</span>
                <span className="text-amber-300">{flightId}</span>
             </div>
             <div className="flex justify-between">
                <span className="opacity-60">OPER_DEN</span>
                <span className="text-amber-300">{dayCount}</span>
             </div>
          </div>

          <div className="mt-2 pt-1 border-t border-amber-900/50 text-[9px] text-amber-600 flex justify-between tracking-wide">
             <span>// SYS_READY</span>
             <span className="animate-pulse">_</span>
          </div>
        </div>

        {/* Status Bar Top Right - Compacted */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 items-end pointer-events-auto">
           <div className="border-tech px-3 py-1 text-[10px] flex gap-4">
              <span className="text-amber-600">POGODA:</span>
              <span className="text-amber-300 font-bold">{getTranslitWeather(weather)}</span>
           </div>
           <div className="border-tech px-3 py-1 text-[10px] flex gap-4">
              <span className="text-amber-600">VREMYA:</span>
              <span className="text-amber-300 font-bold">{getTranslitTime(timeOfDay)}</span>
           </div>
        </div>

        {/* Radio Module UI (Bottom Left) - Robust Hardware Style */}
        <div className="absolute bottom-8 left-8 z-50 pointer-events-auto">
            <div className="w-[360px] bg-[#080606] border border-amber-800/60 p-1 shadow-[0_0_30px_rgba(0,0,0,1)] relative">
                {/* Technical Label */}
                <div className="absolute -top-3 left-0 bg-[#080606] px-2 border border-amber-800/60 text-[9px] text-amber-600 tracking-widest font-bold">
                    R-326M // UNIT_04
                </div>
                {/* Decorative Screws */}
                <div className="absolute top-1 left-1 w-1 h-1 bg-amber-900/40 rounded-full"></div>
                <div className="absolute top-1 right-1 w-1 h-1 bg-amber-900/40 rounded-full"></div>
                <div className="absolute bottom-1 left-1 w-1 h-1 bg-amber-900/40 rounded-full"></div>
                <div className="absolute bottom-1 right-1 w-1 h-1 bg-amber-900/40 rounded-full"></div>
                
                <div className="border border-amber-900/30 p-3 flex flex-col gap-3 m-0.5 bg-[#0a0808]">
                    {/* Top Section: Signal & Display */}
                    <div className="flex justify-between items-end h-12">
                        {/* Signal Meter */}
                        <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-amber-700 tracking-wider">SIGNAL</span>
                            <div className="flex items-end gap-0.5 h-6">
                                {[1,2,3,4,5].map(i => (
                                    <div key={i} 
                                        className={`w-1.5 transition-all duration-300 ${isRadioOn && i <= signalStrength * 5 ? 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.8)]' : 'bg-amber-900/20 h-1'}`} 
                                        style={{ height: isRadioOn && i <= signalStrength * 5 ? `${i*4 + 4}px` : '4px' }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Frequency Display */}
                        <div className="bg-[#100c0c] border border-amber-900/50 px-4 py-1 relative min-w-[100px] text-right">
                            <span className={`font-mono text-3xl tracking-tighter ${isRadioOn ? 'text-amber-500 text-glow' : 'text-amber-900/20'}`}>
                                {isRadioOn ? radioFreq.toFixed(1) : '88.0'}
                            </span>
                            <span className="text-[8px] text-amber-700 absolute bottom-1 left-1">MHZ</span>
                        </div>
                    </div>

                    {/* Middle Section: Slider */}
                    <div className="relative h-10 bg-[#0c0a0a] border-t border-b border-amber-900/30 flex items-center px-2 group">
                        <div className="absolute inset-x-2 top-1/2 h-px bg-amber-900/40"></div>
                        {/* Ticks */}
                        <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none opacity-50">
                            {[...Array(21)].map((_, i) => (
                                <div key={i} className={`w-px bg-amber-800 ${i % 5 === 0 ? 'h-4' : 'h-2'}`}></div>
                            ))}
                        </div>
                        <input 
                            type="range" 
                            min="88.0" max="108.0" step="0.1" 
                            value={radioFreq}
                            onChange={(e) => setRadioFreq(parseFloat(e.target.value))}
                            className="w-full relative z-10 opacity-0 cursor-pointer h-full"
                        />
                        {/* Thumb */}
                        <div 
                            className="absolute top-1 bottom-1 w-0.5 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.8)] pointer-events-none transition-all duration-75"
                            style={{ left: `calc(${((radioFreq - 88) / 20) * 100}% - 1px)` }}
                        />
                    </div>

                    {/* Bottom Section: Controls */}
                    <div className="flex justify-between items-center pt-1">
                        {/* Volume */}
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] text-amber-700">VOL</span>
                            <div className="flex gap-0.5 items-end">
                                {[...Array(10)].map((_, i) => (
                                    <div 
                                        key={i}
                                        onClick={() => setRadioVol((i+1)/10)}
                                        className={`w-1.5 h-3 cursor-pointer hover:bg-amber-400/50 ${i < radioVol * 10 ? 'bg-amber-600' : 'bg-amber-900/30'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Power Switch */}
                        <button 
                            onClick={() => setIsRadioOn(!isRadioOn)}
                            className={`
                                relative px-4 py-1.5 text-[9px] font-bold tracking-widest border transition-all uppercase
                                ${isRadioOn 
                                    ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' 
                                    : 'bg-transparent text-amber-900 border-amber-900/50 hover:border-amber-700 hover:text-amber-700'
                                }
                            `}
                        >
                            {isRadioOn ? 'PWR_ON' : 'PWR_OFF'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

      </div>

      {/* Control Bank (Bottom Right) - Compacted & Fixed Z-Index */}
      <div className="absolute bottom-4 right-4 z-[90] pointer-events-auto">
         <div className="border-tech p-2 bg-[#0a0805] shadow-2xl">
             <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                 
                 {/* Group 1 */}
                 <div className="flex flex-col items-center gap-0.5">
                    <button 
                        onClick={toggleTime} 
                        className="mechanical-btn w-full h-6 bg-amber-900/20 border border-amber-700/50 hover:bg-amber-800/40 text-[9px] text-amber-400 tracking-widest transition-colors flex items-center justify-center uppercase"
                    >
                        {timeOfDay === 'day' ? 'D' : 'N'}
                    </button>
                    <span className="text-[7px] text-amber-800 uppercase tracking-widest">CYCLE</span>
                 </div>

                 <div className="flex flex-col items-center gap-0.5">
                    <button 
                        onClick={cycleWeather} 
                        className="mechanical-btn w-full h-6 bg-amber-900/20 border border-amber-700/50 hover:bg-amber-800/40 text-[9px] text-amber-400 tracking-widest transition-colors flex items-center justify-center uppercase"
                    >
                        {weather.substring(0,3).toUpperCase()}
                    </button>
                    <span className="text-[7px] text-amber-800 uppercase tracking-widest">ENV</span>
                 </div>

                 {/* Group 2 */}
                 <div className="flex flex-col items-center gap-0.5 mt-1">
                    <input 
                        type="checkbox" 
                        className="toggle-switch"
                        checked={isAutoMode}
                        onChange={() => setIsAutoMode(!isAutoMode)}
                    />
                    <span className="text-[7px] text-amber-800 uppercase tracking-widest">AUTO</span>
                 </div>

                 <div className="flex flex-col items-center gap-0.5 mt-1">
                    <input 
                        type="checkbox" 
                        className="toggle-switch"
                        checked={isAudioEnabled}
                        onChange={() => setIsAudioEnabled(!isAudioEnabled)}
                    />
                    <span className="text-[7px] text-amber-800 uppercase tracking-widest">AUD</span>
                 </div>

             </div>
             
             {/* Main Toggle */}
             <div className="mt-2 pt-1 border-t border-amber-900/30 flex justify-center">
                <button 
                    onClick={() => setIsOverlayVisible(!isOverlayVisible)}
                    className="text-[8px] text-amber-600 hover:text-amber-400 uppercase tracking-[0.15em] border border-transparent hover:border-amber-900/50 px-1 py-0.5 transition-all"
                >
                    {isOverlayVisible ? '[HIDE]' : '[HUD]'}
                </button>
             </div>
         </div>
      </div>
    </div>
  );
};

export default App;
