import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { TimeOfDay, Weather } from "../App";

interface PostSovietTrainViewProps {
  audioEnabled: boolean;
  timeOfDay: TimeOfDay;
  weather: Weather;
  radioOn: boolean;
  radioFreq: number;
  radioVol: number;
}

const PostSovietTrainView: React.FC<PostSovietTrainViewProps> = ({ 
    audioEnabled, 
    timeOfDay, 
    weather,
    radioOn,
    radioFreq,
    radioVol
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const rainGainRef = useRef<GainNode | null>(null);
  
  // Radio Audio Refs
  const radioMasterGainRef = useRef<GainNode | null>(null);
  const radioStaticGainRef = useRef<GainNode | null>(null);
  const radioMusicGainRef = useRef<GainNode | null>(null);
  const radioFilterRef = useRef<BiquadFilterNode | null>(null);
  const sequencerInterval = useRef<any>(null);

  // Scene Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const interiorLightRef = useRef<THREE.PointLight | null>(null);
  const rainSystemRef = useRef<THREE.Points | null>(null);
  const snowSystemRef = useRef<THREE.Points | null>(null);
  const starsRef = useRef<THREE.Points | null>(null);
  const streetLightsRef = useRef<THREE.PointLight[]>([]);
  const snowCapsRef = useRef<THREE.Mesh[]>([]); // Track snow caps for smooth fading
  const groundRef = useRef<THREE.Mesh | null>(null);
  const wiperPivotRef = useRef<THREE.Group | null>(null);
  const peopleRef = useRef<THREE.Group[]>([]);
  
  // Instrument Refs
  const gaugeNeedlesRef = useRef<THREE.Object3D[]>([]);
  const gaugeMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Speed Logic Refs
  const currentSpeedRef = useRef<number>(60);
  const targetSpeedRef = useRef<number>(60);
  const nextSignTimeRef = useRef<number>(0);
  const activeSignsRef = useRef<{ mesh: THREE.Group, limit: number, passed: boolean }[]>([]);

  // Refs for Animation Loop logic
  const weatherRef = useRef<Weather>(weather);

  // --- Environment Interpolation Targets ---
  // We store the "Desired" state here, and lerp towards it in the animate loop
  const envTargets = useRef({
      fogColor: new THREE.Color(0x8a96a3),
      fogDensity: 0.02,
      ambientIntensity: 0.3,
      dirIntensity: 0.6,
      dirColor: new THREE.Color(0xaaccff),
      interiorIntensity: 0.1,
      interiorColor: new THREE.Color(0xffaa55),
      rainOpacity: 0,
      snowOpacity: 0,
      starOpacity: 0,
      snowCapOpacity: 0,
      groundColor: new THREE.Color(0x383a38),
      groundRoughness: 1.0,
      streetLightIntensity: 0,
      instrumentEmission: 0,
  });

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  // --- Environment Reactive Updates (Setting Targets) ---
  useEffect(() => {
    const isNight = timeOfDay === 'night';
    const isRain = weather === 'rain';
    const isSnow = weather === 'snow';
    const isCloudy = weather === 'cloudy';

    const t = envTargets.current;

    // 1. Fog & Background Color Targets
    if (isNight) {
        t.fogColor.setHex(0x05070a); // Deep dark night
        if (isSnow) {
            t.fogColor.setHex(0x1a1c22); // Night Snow (slightly brighter reflection)
            t.fogDensity = 0.035;
        } else {
            t.fogDensity = isRain ? 0.04 : 0.015;
        }
    } else {
        // Day
        if (isRain) {
            t.fogColor.setHex(0x556677); // Grey Rain
            t.fogDensity = 0.05;
        } else if (isSnow) {
            t.fogColor.setHex(0xccdde5); // White/Grey Snow Mist
            t.fogDensity = 0.04;
        } else if (isCloudy) {
            t.fogColor.setHex(0x778899); // Cloudy
            t.fogDensity = 0.03;
        } else {
            t.fogColor.setHex(0x8a96a3); // Clear Day
            t.fogDensity = 0.02;
        }
    }

    // 2. Particle Opacity Targets
    t.rainOpacity = isRain ? 0.6 : 0;
    t.snowOpacity = isSnow ? 0.8 : 0;
    
    // 3. Stars Opacity Targets
    t.starOpacity = (isNight && !isRain && !isCloudy && !isSnow) ? 0.8 : 0;

    // 4. Lighting Targets
    const snowBoost = isSnow ? 0.2 : 0;
    t.ambientIntensity = (isNight ? 0.1 : (isRain ? 0.3 : 0.5)) + snowBoost;
    
    t.dirIntensity = isNight ? 0.1 : (isRain || isSnow ? 0.2 : 0.8);
    t.dirColor.setHex(isNight ? 0x88aaff : (isSnow ? 0xddeeff : 0xffddaa));

    t.interiorIntensity = isNight ? 0.4 : 0.05;
    t.interiorColor.setHex(isNight ? 0xffaa55 : 0xffffff);

    t.streetLightIntensity = isNight ? 2.0 : 0;

    // 5. Snow Accumulation Targets
    t.snowCapOpacity = isSnow ? 1.0 : 0.0;
    if (isSnow) {
        t.groundColor.setHex(0xdddddd);
        t.groundRoughness = 0.6;
    } else {
        t.groundColor.setHex(0x383a38);
        t.groundRoughness = 1.0;
    }

    // 6. Instrument Backlight (On at night OR bad weather)
    t.instrumentEmission = (isNight || isRain || isCloudy || isSnow) ? 3.0 : 0.0; // Higher intensity for glow

  }, [timeOfDay, weather]);

  // --- Audio Logic Initialization ---
  useEffect(() => {
    if (audioEnabled) {
      if (!audioCtxRef.current) {
        // Initialize Audio Context
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(ctx.destination);
        masterGainRef.current = masterGain;

        // 1. Background Rumble
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0; 
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5; 
        }

        const rumbleSrc = ctx.createBufferSource();
        rumbleSrc.buffer = buffer;
        rumbleSrc.loop = true;

        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.value = 120;

        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0.3;

        rumbleSrc.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(masterGain);
        rumbleSrc.start();

        // 2. Rain Noise
        const rainBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const rainData = rainBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            rainData[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            rainData[i] *= 0.11; 
            b6 = white * 0.115926;
        }
        
        const rainSrc = ctx.createBufferSource();
        rainSrc.buffer = rainBuffer;
        rainSrc.loop = true;

        const rainFilter = ctx.createBiquadFilter();
        rainFilter.type = 'highpass';
        rainFilter.frequency.value = 400;

        const rainGain = ctx.createGain();
        rainGain.gain.value = 0; // Start silent
        rainGainRef.current = rainGain;

        rainSrc.connect(rainFilter);
        rainFilter.connect(rainGain);
        rainGain.connect(masterGain);
        rainSrc.start();

        // --- RADIO SYSTEM SETUP ---
        const radioMaster = ctx.createGain();
        radioMaster.gain.value = 0;
        radioMaster.connect(masterGain);
        radioMasterGainRef.current = radioMaster;

        const radioFilter = ctx.createBiquadFilter();
        radioFilter.type = 'bandpass';
        radioFilter.frequency.value = 1000;
        radioFilter.Q.value = 1.0;
        radioFilter.connect(radioMaster);
        radioFilterRef.current = radioFilter;

        const staticBufferSize = ctx.sampleRate;
        const staticBuffer = ctx.createBuffer(1, staticBufferSize, ctx.sampleRate);
        const staticData = staticBuffer.getChannelData(0);
        for(let i=0; i<staticBufferSize; i++) {
            staticData[i] = Math.random() * 2 - 1;
        }
        const staticSrc = ctx.createBufferSource();
        staticSrc.buffer = staticBuffer;
        staticSrc.loop = true;
        
        const staticGain = ctx.createGain();
        staticGain.gain.value = 0.5;
        staticSrc.connect(staticGain);
        staticGain.connect(radioFilter);
        staticSrc.start();
        radioStaticGainRef.current = staticGain;

        const musicGain = ctx.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(radioFilter);
        radioMusicGainRef.current = musicGain;

        startProceduralRadio(ctx, musicGain);
      }

      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    } else {
      if (audioCtxRef.current && audioCtxRef.current.state === 'running') {
        audioCtxRef.current.suspend();
      }
    }
  }, [audioEnabled]);

  // Handle Radio Volume & Tuning
  useEffect(() => {
    if (!audioCtxRef.current || !radioMasterGainRef.current || !radioStaticGainRef.current || !radioMusicGainRef.current) return;
    
    const masterTarget = radioOn ? radioVol : 0;
    radioMasterGainRef.current.gain.setTargetAtTime(masterTarget, audioCtxRef.current.currentTime, 0.1);

    const stations = [
        { freq: 96.0, type: 'music', bandwidth: 0.8 },
        { freq: 104.5, type: 'buzzer', bandwidth: 0.4 }
    ];

    let bestStationDiff = 100;
    let closestStation = null;

    stations.forEach(s => {
        const diff = Math.abs(radioFreq - s.freq);
        if (diff < bestStationDiff) {
            bestStationDiff = diff;
            closestStation = s;
        }
    });

    let signalQuality = 0; 
    if (closestStation && bestStationDiff < 1.5) {
        signalQuality = 1 - (bestStationDiff / 1.5);
        signalQuality = Math.max(0, signalQuality);
        if (signalQuality < 0.8 && Math.random() > 0.9) {
            signalQuality *= 0.5;
        }
    }

    const staticVol = (1.0 - signalQuality) * 0.4 + 0.05; 
    const musicVol = signalQuality; 

    radioStaticGainRef.current.gain.setTargetAtTime(staticVol, audioCtxRef.current.currentTime, 0.1);
    radioMusicGainRef.current.gain.setTargetAtTime(musicVol, audioCtxRef.current.currentTime, 0.1);

    if (radioFilterRef.current) {
        const drift = (bestStationDiff * 500) * (Math.random() > 0.5 ? 1 : -1);
        const targetFreq = 1000 + drift;
        radioFilterRef.current.frequency.setTargetAtTime(targetFreq, audioCtxRef.current.currentTime, 0.1);
    }

  }, [radioOn, radioFreq, radioVol, audioEnabled]);

  // Handle Rain Audio Volume (Smooth Ramp)
  useEffect(() => {
    if (rainGainRef.current && audioCtxRef.current) {
        const t = audioCtxRef.current.currentTime;
        // Also ramp rain volume if snow is falling but less loud
        const targetVol = weather === 'rain' ? 0.35 : (weather === 'snow' ? 0.05 : 0);
        rainGainRef.current.gain.setTargetAtTime(targetVol, t, 1.5); // Slower ramp for smoother feel
    }
  }, [weather]);

  // --- Procedural Radio ---
  const startProceduralRadio = (ctx: AudioContext, output: GainNode) => {
      const scale = [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00]; 
      const bassProgression = [55.00, 43.65, 65.41, 49.00]; 
      let step = 0;
      let bar = 0;
      const compressor = ctx.createDynamicsCompressor();
      compressor.connect(output);
      const reverbRate = ctx.sampleRate;
      const reverbLen = reverbRate * 1.5;
      const impulse = ctx.createBuffer(2, reverbLen, reverbRate);
      for(let i=0; i<reverbLen; i++) {
         const decay = Math.pow(1 - i/reverbLen, 3);
         impulse.getChannelData(0)[i] = (Math.random() * 2 - 1) * decay;
         impulse.getChannelData(1)[i] = (Math.random() * 2 - 1) * decay;
      }
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse;
      const reverbMix = ctx.createGain();
      reverbMix.gain.value = 0.4;
      reverb.connect(reverbMix);
      reverbMix.connect(compressor);

      const playNote = (freq: number, type: 'sawtooth' | 'sine' | 'square', dur: number, vol: number, isBass: boolean) => {
         const osc = ctx.createOscillator();
         const gain = ctx.createGain();
         const filter = ctx.createBiquadFilter();
         osc.type = type;
         osc.frequency.value = freq;
         osc.detune.value = (Math.random() - 0.5) * 15; 
         filter.type = 'lowpass';
         filter.frequency.value = isBass ? 400 : 2000;
         filter.Q.value = 2;
         osc.connect(filter);
         filter.connect(gain);
         gain.connect(compressor); 
         if (!isBass) gain.connect(reverb); 
         const t = ctx.currentTime;
         gain.gain.setValueAtTime(0, t);
         gain.gain.linearRampToValueAtTime(vol, t + 0.05);
         gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
         osc.start(t);
         osc.stop(t + dur + 0.1);
         setTimeout(() => { osc.disconnect(); gain.disconnect(); }, (dur + 1) * 1000);
      };

      const playNoise = (dur: number) => {
         const bufferSize = ctx.sampleRate * dur;
         const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
         const data = buffer.getChannelData(0);
         for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
         const src = ctx.createBufferSource();
         src.buffer = buffer;
         const filter = ctx.createBiquadFilter();
         filter.type = 'lowpass';
         filter.frequency.value = 800;
         const gain = ctx.createGain();
         gain.gain.value = 0.15;
         src.connect(filter);
         filter.connect(gain);
         gain.connect(compressor);
         src.start();
      };

      const beatTime = 0.6; 
      sequencerInterval.current = setInterval(() => {
         if (ctx.state !== 'running') return;
         if (step % 8 === 0) {
            const bassNote = bassProgression[(bar % 4)];
            playNote(bassNote, 'sawtooth', beatTime * 8, 0.3, true);
         }
         if (Math.random() > 0.4) {
             const note = scale[Math.floor(Math.random() * scale.length)];
             const oct = Math.random() > 0.5 ? 1 : 2;
             playNote(note * oct, 'square', beatTime, 0.05, false);
         }
         if (step % 4 === 0) {
             const osc = ctx.createOscillator();
             const g = ctx.createGain();
             osc.frequency.setValueAtTime(150, ctx.currentTime);
             osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
             g.gain.setValueAtTime(0.4, ctx.currentTime);
             g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
             osc.connect(g);
             g.connect(compressor);
             osc.start();
             osc.stop(ctx.currentTime + 0.5);
         } else if (step % 4 === 2) {
             playNoise(0.1);
         }
         if (step % 2 === 0) playNoise(0.02);
         step++;
         if (step >= 16) { step = 0; bar++; }
      }, beatTime * 1000);
  };

  useEffect(() => {
      return () => { if (sequencerInterval.current) clearInterval(sequencerInterval.current); };
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (!audioEnabled) return;
    let timeoutId: any;
    const playClack = () => {
      const ctx = audioCtxRef.current;
      const master = masterGainRef.current;
      if (!ctx || !master || ctx.state !== 'running') return;
      
      const speedRatio = currentSpeedRef.current / 60; // 1.0 at 60km/h
      if (speedRatio < 0.1) {
          // Train stopped or very slow, loop check slowly
          timeoutId = setTimeout(playClack, 1000);
          return;
      }

      const t = ctx.currentTime;
      const createHit = (time: number, vol: number) => {
        const bSize = ctx.sampleRate * 0.1;
        const bBuffer = ctx.createBuffer(1, bSize, ctx.sampleRate);
        const bData = bBuffer.getChannelData(0);
        for (let i = 0; i < bSize; i++) bData[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = bBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start(time);
        src.stop(time + 0.15);
      };
      
      // Volume scales with speed slightly
      const volScale = Math.min(1.0, 0.2 + speedRatio * 0.3);
      createHit(t, 0.4 * volScale);
      createHit(t + 0.14 / speedRatio, 0.3 * volScale);
      
      const baseDelay = 1600;
      const nextDelay = (baseDelay / speedRatio) + (Math.random() * 200);
      timeoutId = setTimeout(playClack, nextDelay);
    };
    playClack();
    return () => clearTimeout(timeoutId);
  }, [audioEnabled]);


  // --- Three.js Scene Setup ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // --- Scene & Camera ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    
    // Initial Fog (using current envTargets)
    scene.fog = new THREE.FogExp2(envTargets.current.fogColor, envTargets.current.fogDensity);
    scene.background = envTargets.current.fogColor.clone();

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    camera.position.set(0, 1.2, 0.8);
    camera.lookAt(0, 1.0, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false; 
    container.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0xb0b5c0, envTargets.current.ambientIntensity);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const dir = new THREE.DirectionalLight(envTargets.current.dirColor, envTargets.current.dirIntensity);
    dir.position.set(-20, 30, 10);
    scene.add(dir);
    dirLightRef.current = dir;

    const interiorLight = new THREE.PointLight(envTargets.current.interiorColor, envTargets.current.interiorIntensity, 5);
    interiorLight.position.set(0, 2, 1);
    scene.add(interiorLight);
    interiorLightRef.current = interiorLight;

    // --- Interior ---
    const interior = new THREE.Group();
    scene.add(interior);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(4, 4);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.9, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.0, 1.0);
    interior.add(floor);

    // Window Frame & Glass
    const windowGroup = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.3 });
    const frameWidth = 2.4; // Wider to account for pillars
    const frameHeight = 1.15;
    const frameThickness = 0.12; // Thicker
    const frameDepth = 0.1;
    
    const verticalGeo = new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth);
    const horizontalGeo = new THREE.BoxGeometry(frameWidth, 0.08, frameDepth);
    
    const leftFrame = new THREE.Mesh(verticalGeo, frameMaterial);
    leftFrame.position.set(-frameWidth / 2 + 0.2, 1.2, -0.6); // Moved in slightly
    
    const rightFrame = leftFrame.clone();
    rightFrame.position.x = frameWidth / 2 - 0.2;
    
    const topFrame = new THREE.Mesh(horizontalGeo, frameMaterial);
    topFrame.position.set(0, 1.2 + frameHeight / 2, -0.6);
    
    // Glass
    const glassGeo = new THREE.PlaneGeometry(frameWidth - 0.4, frameHeight);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.15, roughness: 0.1, metalness: 0.6, side: THREE.DoubleSide });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 1.2, -0.6);
    
    windowGroup.add(glass);
    windowGroup.add(leftFrame, rightFrame, topFrame);
    interior.add(windowGroup);

    // --- Cabin Dashboard & Ceiling (Restricting View) ---
    
    // Dashboard (Bottom console)
    // LOWERED dashboard slightly more to 0.4 (Top at 0.85) to ensure gauges sit cleanly
    const dashboardGeo = new THREE.BoxGeometry(4, 0.9, 0.8);
    const dashboardMat = new THREE.MeshStandardMaterial({ color: 0x181a1b, roughness: 0.7, metalness: 0.4 });
    const dashboard = new THREE.Mesh(dashboardGeo, dashboardMat);
    // Positioned lower: height 0.9, y at 0.40 means top is at 0.85
    dashboard.position.set(0, 0.40, -0.5); 
    interior.add(dashboard);

    // Ceiling (Top visor)
    const ceilingGeo = new THREE.BoxGeometry(4, 0.5, 1.5);
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.9 });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    // Positioned to block top edge
    ceiling.position.set(0, 2.0, -0.4); 
    interior.add(ceiling);

    // --- Instruments / Gauges ---
    gaugeNeedlesRef.current = [];
    gaugeMaterialsRef.current = [];

    function createGaugeTexture(label: string, min: number, max: number, steps: number, hasRedZone: boolean) {
        const size = 512; // Increased resolution
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.CanvasTexture(canvas);

        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 10;

        // Background (Subtle radial gradient for realism)
        const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
        grad.addColorStop(0, '#1a1a1a');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);

        // Rim
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 10;
        ctx.stroke();

        // Safe/Red Zones
        const startAngle = Math.PI * 0.75;
        const totalAngle = Math.PI * 1.5;
        
        // Draw Scale Arc
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 40, startAngle, startAngle + totalAngle);
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Red Zone (Last 20%)
        if (hasRedZone) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius - 40, startAngle + totalAngle * 0.8, startAngle + totalAngle);
            ctx.strokeStyle = '#cc0000';
            ctx.lineWidth = 12; // Thicker zone
            ctx.stroke();
        }

        // Ticks & Numbers
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        for(let i=0; i<=steps; i++) {
            const ratio = i / steps;
            const angle = startAngle + (totalAngle * ratio);
            
            const isMajor = i % 2 === 0;
            const tickLen = isMajor ? 35 : 20;
            const tickColor = (hasRedZone && ratio > 0.8) ? '#ff3333' : '#ffffff';

            const x1 = cx + Math.cos(angle) * (radius - 40);
            const y1 = cy + Math.sin(angle) * (radius - 40);
            const x2 = cx + Math.cos(angle) * (radius - 40 - tickLen);
            const y2 = cy + Math.sin(angle) * (radius - 40 - tickLen);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = tickColor;
            ctx.lineWidth = isMajor ? 8 : 4;
            ctx.stroke();

            // Numbers
            if (isMajor) {
                 const tx = cx + Math.cos(angle) * (radius - 100);
                 const ty = cy + Math.sin(angle) * (radius - 100);
                 const val = Math.round(min + (max-min) * ratio);
                 
                 ctx.font = 'bold 50px monospace';
                 ctx.fillStyle = tickColor;
                 ctx.fillText(val.toString(), tx, ty);
            }
        }
        
        // Label
        ctx.fillStyle = '#aaaaaa';
        ctx.font = 'bold 36px monospace';
        ctx.fillText(label, cx, cy + 80);

        return new THREE.CanvasTexture(canvas);
    }

    function createGauge(x: number, label: string, range: [number, number], hasRedZone = false, steps = 10) {
        const group = new THREE.Group();
        // Positioned on the dashboard surface (approx y=0.92 based on dashboard top)
        // Moved down and angled up for better visibility
        group.position.set(x, 0.92, -0.45); 
        group.rotation.x = -Math.PI / 4; // Angled 45 deg up

        // Housing
        const housingGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 32);
        const housingMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4 });
        const housing = new THREE.Mesh(housingGeo, housingMat);
        housing.rotation.x = Math.PI / 2;
        group.add(housing);

        // Face
        const tex = createGaugeTexture(label, range[0], range[1], steps, hasRedZone);
        const faceGeo = new THREE.CircleGeometry(0.10, 32);
        const faceMat = new THREE.MeshStandardMaterial({ 
            map: tex, 
            color: 0xffffff,
            emissive: 0x33ff33, // Radioactive Green
            emissiveMap: tex,   // Only the white parts of texture will emit light
            emissiveIntensity: 0,
            roughness: 0.5,
            metalness: 0.1      // Reduced metalness for better visibility
        });
        const face = new THREE.Mesh(faceGeo, faceMat);
        face.position.z = 0.026;
        gaugeMaterialsRef.current.push(faceMat);
        group.add(face);

        // Needle
        const needleGroup = new THREE.Group();
        needleGroup.position.z = 0.04; // Push needle out slightly more
        // Needle geometry: pivot at one end
        const needleGeo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
             0, -0.01, 0,
             0.005, 0.0, 0,
             0, 0.09, 0,
             -0.005, 0.0, 0
        ]);
        const indices = [0,1,2, 0,2,3];
        needleGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        needleGeo.setIndex(indices);
        needleGeo.computeVertexNormals();

        const needleMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
        const needle = new THREE.Mesh(needleGeo, needleMat);
        needle.rotation.z = 0; // Reset
        needleGroup.add(needle);
        
        // Needle Cap
        const capGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.01, 16);
        const capMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.rotation.x = Math.PI/2;
        needleGroup.add(cap);

        gaugeNeedlesRef.current.push(needleGroup);
        group.add(needleGroup);

        // Glass cover
        const coverGeo = new THREE.CircleGeometry(0.11, 32);
        const coverMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, transparent: true, opacity: 0.15, roughness: 0.1, metalness: 0.9 
        });
        const cover = new THREE.Mesh(coverGeo, coverMat);
        cover.position.z = 0.055;
        group.add(cover);

        interior.add(group);
    }

    // Add Gauges with Red Zones
    // Speedometer: use 12 steps so we get 120/12 = 10 per step, Major every 2 = 20km/h increments (0, 20, 40...)
    createGauge(-0.4, "KM/H", [0, 120], true, 12); 
    createGauge(0, "ATM", [0, 10], true, 10);      // Pressure
    createGauge(0.4, "V", [0, 250], false, 10);     // Voltage

    // Wiper
    const wiperGroup = new THREE.Group();
    wiperGroup.position.set(0, 1.2 - frameHeight/2 + 0.1, -0.62); 
    const wiperArmGeo = new THREE.BoxGeometry(0.02, 0.7, 0.02); // Slightly shorter
    const wiperMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
    const wiperArm = new THREE.Mesh(wiperArmGeo, wiperMat);
    wiperArm.position.y = 0.35;
    wiperGroup.add(wiperArm);
    const wiperBladeGeo = new THREE.BoxGeometry(0.01, 0.7, 0.04);
    const wiperBlade = new THREE.Mesh(wiperBladeGeo, wiperMat);
    wiperBlade.position.y = 0.35;
    wiperBlade.rotation.y = Math.PI / 8;
    wiperGroup.add(wiperBlade);
    const pivotGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16);
    const pivot = new THREE.Mesh(pivotGeo, wiperMat);
    pivot.rotation.x = Math.PI / 2;
    wiperGroup.add(pivot);
    interior.add(wiperGroup);
    wiperPivotRef.current = wiperGroup;

    // --- Rain System ---
    const rainCount = 1500;
    const rainGeo = new THREE.BufferGeometry();
    const rainPos = new Float32Array(rainCount * 3);
    for(let i=0; i<rainCount; i++) {
        rainPos[i*3] = (Math.random() - 0.5) * 10;
        rainPos[i*3+1] = Math.random() * 5;
        rainPos[i*3+2] = -1 - Math.random() * 5;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
        color: 0xaaaaaa, size: 0.03, transparent: true, opacity: 0, blending: THREE.AdditiveBlending
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    scene.add(rainSystem);
    rainSystemRef.current = rainSystem;

    // --- Snow System ---
    const snowCount = 2000;
    const snowGeo = new THREE.BufferGeometry();
    const snowPos = new Float32Array(snowCount * 3);
    for(let i=0; i<snowCount; i++) {
        snowPos[i*3] = (Math.random() - 0.5) * 15;
        snowPos[i*3+1] = Math.random() * 8;
        snowPos[i*3+2] = -2 - Math.random() * 8;
    }
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    const snowMat = new THREE.PointsMaterial({
        color: 0xffffff, size: 0.04, transparent: true, opacity: 0, 
        map: (() => {
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            const context = canvas.getContext('2d');
            if(context) { context.fillStyle = 'white'; context.beginPath(); context.arc(16, 16, 14, 0, Math.PI * 2); context.fill(); }
            return new THREE.CanvasTexture(canvas);
        })(),
        sizeAttenuation: true
    });
    const snowSystem = new THREE.Points(snowGeo, snowMat);
    scene.add(snowSystem);
    snowSystemRef.current = snowSystem;

    // --- Stars System ---
    const starCount = 400;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for(let i=0; i<starCount; i++) {
      starPos[i*3] = (Math.random() - 0.5) * 200;
      starPos[i*3+1] = Math.random() * 50 + 10; 
      starPos[i*3+2] = -50 - Math.random() * 100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0, sizeAttenuation: true });
    const stars = new THREE.Points(starGeo, starsMat);
    scene.add(stars);
    starsRef.current = stars;

    // --- Exterior World ---
    const world = new THREE.Group();
    scene.add(world);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(200, 120);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x383a38, roughness: 1.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.name = 'ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.1, -60);
    world.add(ground);
    groundRef.current = ground;

    const railMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.4 });
    const railGeo = new THREE.BoxGeometry(0.08, 0.1, 150);
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-0.6, 0.05, -50);
    const rightRail = leftRail.clone();
    rightRail.position.x = 0.6;
    world.add(leftRail, rightRail);
    const ballastGeo = new THREE.BoxGeometry(2.8, 0.05, 150);
    const ballastMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1.0 });
    const ballast = new THREE.Mesh(ballastGeo, ballastMat);
    ballast.position.set(0, 0.0, -50);
    world.add(ballast);

    // --- Object Generation ---
    const movingObjects: THREE.Object3D[] = [];
    streetLightsRef.current = [];
    peopleRef.current = [];
    activeSignsRef.current = [];
    snowCapsRef.current = []; // Reset snow caps list

    const panelColors = [0x70757a, 0x676d72, 0x585c60, 0x6c6f77, 0x7e8380];
    const graffitiColors = [0x884444, 0x448844, 0x444488, 0xccccaa, 0x222222];

    function createSpeedLimitSign(limit: number, z: number) {
        const group = new THREE.Group();
        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.6 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.5;
        group.add(pole);

        // Sign Face (Canvas Texture)
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.stroke();
            
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 60px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(limit.toString(), size/2, size/2 + 5);
        }
        const tex = new THREE.CanvasTexture(canvas);
        const signGeo = new THREE.CircleGeometry(0.4, 32);
        const signMat = new THREE.MeshStandardMaterial({ 
            map: tex, 
            color: 0xffffff,
            roughness: 0.5,
            emissive: 0xffffff,
            emissiveIntensity: 0.1 // Slight glow to be visible at night
        });
        const sign = new THREE.Mesh(signGeo, signMat);
        sign.position.set(0, 2.5, 0.06);
        group.add(sign);

        // Back of sign
        const backGeo = new THREE.CircleGeometry(0.4, 32);
        const backMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
        const back = new THREE.Mesh(backGeo, backMat);
        back.position.set(0, 2.5, 0.05);
        back.rotation.y = Math.PI;
        group.add(back);

        group.position.set(2.5, 0, z); // Always on right side
        group.rotation.y = -Math.PI / 8; // Angled slightly towards track
        
        world.add(group);
        movingObjects.push(group);
        activeSignsRef.current.push({ mesh: group, limit, passed: false });
    }

    function createPanelHouse(x: number, z: number) {
      const group = new THREE.Group();
      const width = 1.2 + Math.random() * 1.5;
      const height = 2.0 + Math.random() * 2.5;
      const depth = 0.8 + Math.random() * 0.8;
      
      const geo = new THREE.BoxGeometry(width, height, depth);
      const color = panelColors[Math.floor(Math.random() * panelColors.length)];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = height / 2;
      group.add(mesh);

      // Snow Cap (Transparent for fading)
      const capGeo = new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1, transparent: true, opacity: 0 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = height + 0.025;
      snowCapsRef.current.push(cap);
      group.add(cap);

      const numPatches = Math.floor(Math.random() * 4);
      for(let k=0; k<numPatches; k++) {
         const pWidth = 0.3 + Math.random() * 0.4;
         const pHeight = 0.3 + Math.random() * 0.4;
         const pGeo = new THREE.PlaneGeometry(pWidth, pHeight);
         const pColor = graffitiColors[Math.floor(Math.random() * graffitiColors.length)];
         const pMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 0.6 });
         const patch = new THREE.Mesh(pGeo, pMat);
         const side = x > 0 ? -1 : 1; 
         patch.position.set((width/2 * side) + (side * 0.01), Math.random() * (height * 0.8) + 0.5, (Math.random() - 0.5) * depth * 0.8);
         patch.rotation.y = side === 1 ? Math.PI / 2 : -Math.PI / 2;
         group.add(patch);
      }
      group.position.set(x, 0, z);
      world.add(group);
      movingObjects.push(group);
    }

    function createFactory(x: number, z: number) {
      const group = new THREE.Group();
      const baseWidth = 2.5 + Math.random() * 2.0;
      const baseHeight = 1.2 + Math.random() * 0.8;
      const baseGeo = new THREE.BoxGeometry(baseWidth, baseHeight, 2.0);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a4d4f, roughness: 0.95 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = baseHeight / 2;
      group.add(base);

      const capGeo = new THREE.BoxGeometry(baseWidth + 0.1, 0.05, 2.1);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1, transparent: true, opacity: 0 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = baseHeight + 0.025;
      snowCapsRef.current.push(cap);
      group.add(cap);

      const pipeHeight = 4.0 + Math.random() * 3.0;
      const pipeGeo = new THREE.CylinderGeometry(0.2, 0.3, pipeHeight, 12);
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x59463c, roughness: 1.0 });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set((Math.random() - 0.5) * (baseWidth * 0.5), baseHeight + pipeHeight/2 - 0.2, 0);
      group.add(pipe);

      group.position.set(x, 0, z);
      world.add(group);
      movingObjects.push(group);
    }

    function createPoleSpan(z: number) {
      const group = new THREE.Group();
      const poleGeo = new THREE.BoxGeometry(0.1, 3.5, 0.1);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
      const leftPole = new THREE.Mesh(poleGeo, poleMat);
      leftPole.position.set(-3.5, 1.75, 0);
      const rightPole = new THREE.Mesh(poleGeo, poleMat);
      rightPole.position.set(3.5, 1.75, 0);
      group.add(leftPole, rightPole);
      const wireMat = new THREE.LineBasicMaterial({ color: 0x111111, opacity: 0.7, transparent: true });
      const points = [new THREE.Vector3(-3.5, 3.2, 0), new THREE.Vector3(0, 3.0, 0), new THREE.Vector3(3.5, 3.2, 0)];
      const wireCurve = new THREE.CatmullRomCurve3(points);
      const wireGeo = new THREE.BufferGeometry().setFromPoints(wireCurve.getPoints(10));
      const wire = new THREE.Line(wireGeo, wireMat);
      group.add(wire);
      group.position.z = z;
      world.add(group);
      movingObjects.push(group);
    }

    function createStreetLight(x: number, z: number) {
      const group = new THREE.Group();
      const height = 2.5;
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.06, height, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = height / 2;
      group.add(pole);
      const armGeo = new THREE.BoxGeometry(0.6, 0.05, 0.05);
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(0.2, height - 0.1, 0);
      group.add(arm);
      const bulbGeo = new THREE.BoxGeometry(0.15, 0.05, 0.1);
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffaa00, emissiveIntensity: 0.8 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0.45, height - 0.15, 0);
      group.add(bulb);
      const light = new THREE.PointLight(0xffaa00, 0, 8);
      light.position.set(0.45, height - 0.2, 0);
      group.add(light);
      streetLightsRef.current.push(light);
      group.position.set(x, 0, z);
      if (x < 0) group.rotation.y = Math.PI;
      world.add(group);
      movingObjects.push(group);
    }

    function createTree(x: number, z: number) {
        const height = 1.5 + Math.random() * 2.5;
        const trunkGeo = new THREE.CylinderGeometry(0.05, 0.08, height, 5);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x1e1a17, roughness: 1.0 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, height / 2, z);
        const crownGeo = new THREE.IcosahedronGeometry(Math.random() * 0.5 + 0.3, 0);
        const crownMat = new THREE.MeshStandardMaterial({ color: 0x2f3530, roughness: 1.0, flatShading: true });
        const crown = new THREE.Mesh(crownGeo, crownMat);
        crown.position.set(x, height * 0.9, z);
        
        // Snow Cap on Tree
        const capGeo = new THREE.IcosahedronGeometry(Math.random() * 0.5 + 0.35, 0);
        const capMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1, transparent: true, opacity: 0 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(x, height * 0.95, z);
        cap.scale.set(1, 0.5, 1);
        snowCapsRef.current.push(cap);

        const group = new THREE.Group();
        group.add(trunk, crown, cap);
        world.add(group);
        movingObjects.push(group);
    }

    function createPerson(x: number, z: number) {
        const group = new THREE.Group();
        const height = 1.7 + Math.random() * 0.1;
        const bodyGeo = new THREE.CylinderGeometry(0.25, 0.3, height * 0.7, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = (height * 0.7) / 2;
        group.add(body);
        const headGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xdcb498, roughness: 0.5 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = (height * 0.7) + 0.15;
        group.add(head);
        const hatGeo = new THREE.BoxGeometry(0.35, 0.25, 0.35);
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 1.0 });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = (height * 0.7) + 0.28;
        group.add(hat);
        group.position.set(x, 0, z);
        group.rotation.y = Math.random() * Math.PI * 2;
        world.add(group);
        movingObjects.push(group);
        peopleRef.current.push(group);
    }

    const totalObjects = 40;
    const spacing = 4;
    for (let i = 0; i < totalObjects; i++) {
      const z = -15 - i * spacing;
      const leftX = -8 - Math.random() * 6;
      const rightX = 8 + Math.random() * 6;
      createPanelHouse(leftX, z - 1 + Math.random() * 2);
      createPanelHouse(rightX, z + Math.random() * 2);
      if (Math.random() > 0.7) {
          const px = leftX + (Math.random() > 0.5 ? 1.5 : -1.5);
          createPerson(px, z + Math.random());
      }
      if (i % 6 === 0) {
        const fx = Math.random() > 0.5 ? -14 - Math.random() * 5 : 14 + Math.random() * 5;
        createFactory(fx, z - 2);
      }
      if (i % 5 === 0) createPoleSpan(z);
      if (i % 8 === 0) {
        const lightX = Math.random() > 0.5 ? -3 : 3;
        createStreetLight(lightX, z);
        if (Math.random() > 0.6) createPerson(lightX + (Math.random()-0.5), z);
      }
      if (Math.random() > 0.3) {
         const tx = (Math.random() > 0.5 ? -1 : 1) * (5 + Math.random() * 10);
         createTree(tx, z + Math.random() * 2);
      }
    }

    // --- Animation Loop ---
    const clock = new THREE.Clock();
    let frameId: number;
    let pointerOffsetX = 0;
    let pointerOffsetY = 0;

    const onPointerMove = (e: PointerEvent) => {
      const nx = e.clientX / window.innerWidth - 0.5;
      const ny = e.clientY / window.innerHeight - 0.5;
      pointerOffsetX = nx * 0.3;
      pointerOffsetY = ny * 0.1;
    };
    window.addEventListener("pointermove", onPointerMove);

    const wrapDistance = totalObjects * spacing;
    const frontLimit = 5;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const t = clock.getElapsedTime();

      // --- Smooth Transition Logic ---
      const lerpSpeed = delta * 1.5; // Controls transition speed
      const targets = envTargets.current;

      if (sceneRef.current) {
          // Fog & Background
          if (sceneRef.current.fog instanceof THREE.FogExp2) {
             sceneRef.current.fog.color.lerp(targets.fogColor, lerpSpeed);
             sceneRef.current.fog.density = THREE.MathUtils.lerp(sceneRef.current.fog.density, targets.fogDensity, lerpSpeed);
             if (sceneRef.current.background instanceof THREE.Color) {
                 sceneRef.current.background.copy(sceneRef.current.fog.color);
             }
          }

          // Ambient Light
          if (ambientLightRef.current) {
              ambientLightRef.current.intensity = THREE.MathUtils.lerp(ambientLightRef.current.intensity, targets.ambientIntensity, lerpSpeed);
          }

          // Directional Light
          if (dirLightRef.current) {
              dirLightRef.current.intensity = THREE.MathUtils.lerp(dirLightRef.current.intensity, targets.dirIntensity, lerpSpeed);
              dirLightRef.current.color.lerp(targets.dirColor, lerpSpeed);
          }

          // Interior Light
          if (interiorLightRef.current) {
              interiorLightRef.current.intensity = THREE.MathUtils.lerp(interiorLightRef.current.intensity, targets.interiorIntensity, lerpSpeed);
              interiorLightRef.current.color.lerp(targets.interiorColor, lerpSpeed);
          }

          // Street Lights
          streetLightsRef.current.forEach(light => {
              light.intensity = THREE.MathUtils.lerp(light.intensity, targets.streetLightIntensity, lerpSpeed);
          });

          // Particles Opacity
          if (rainSystemRef.current && rainSystemRef.current.material instanceof THREE.PointsMaterial) {
              const currentOp = rainSystemRef.current.material.opacity;
              rainSystemRef.current.material.opacity = THREE.MathUtils.lerp(currentOp, targets.rainOpacity, lerpSpeed);
          }
          if (snowSystemRef.current && snowSystemRef.current.material instanceof THREE.PointsMaterial) {
              const currentOp = snowSystemRef.current.material.opacity;
              snowSystemRef.current.material.opacity = THREE.MathUtils.lerp(currentOp, targets.snowOpacity, lerpSpeed);
          }
          if (starsRef.current && starsRef.current.material instanceof THREE.PointsMaterial) {
              const currentOp = starsRef.current.material.opacity;
              starsRef.current.material.opacity = THREE.MathUtils.lerp(currentOp, targets.starOpacity, lerpSpeed);
          }

          // Ground Transition
          if (groundRef.current && groundRef.current.material instanceof THREE.MeshStandardMaterial) {
              groundRef.current.material.color.lerp(targets.groundColor, lerpSpeed);
              groundRef.current.material.roughness = THREE.MathUtils.lerp(groundRef.current.material.roughness, targets.groundRoughness, lerpSpeed);
          }

          // Snow Caps Fade
          snowCapsRef.current.forEach(cap => {
             if (cap.material instanceof THREE.MeshStandardMaterial) {
                 cap.material.opacity = THREE.MathUtils.lerp(cap.material.opacity, targets.snowCapOpacity, lerpSpeed);
             } 
          });

          // Instrument Backlight
          gaugeMaterialsRef.current.forEach(mat => {
              mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targets.instrumentEmission, lerpSpeed);
          });
      }

      // --- SPEED & SIGN LOGIC ---
      
      // 1. Detect passed signs to update Target Speed
      activeSignsRef.current.forEach(signData => {
          if (!signData.passed && signData.mesh.position.z > 0.8) {
              // Sign has passed the camera (camera is at 0.8z)
              signData.passed = true;
              targetSpeedRef.current = signData.limit;
          }
      });
      // Cleanup passed signs from the checker array if they wrapped around (simple logic handles wrap below)
      activeSignsRef.current = activeSignsRef.current.filter(s => s.mesh.position.z < frontLimit); 

      // 2. Train Inertia (Move Current Speed towards Target Speed)
      // It takes time to accelerate/decelerate
      const inertia = 0.5 * delta; // Acceleration rate
      if (currentSpeedRef.current < targetSpeedRef.current) {
          currentSpeedRef.current = Math.min(targetSpeedRef.current, currentSpeedRef.current + inertia * 5); // Accelerate
      } else if (currentSpeedRef.current > targetSpeedRef.current) {
          currentSpeedRef.current = Math.max(targetSpeedRef.current, currentSpeedRef.current - inertia * 2); // Decelerate slower (braking)
      }

      // 3. Generate New Signs (Every 20-40 seconds)
      if (t > nextSignTimeRef.current) {
          const limits = [40, 60, 80, 100, 120];
          const newLimit = limits[Math.floor(Math.random() * limits.length)];
          // Spawn at the back of the queue (approx -160 z)
          createSpeedLimitSign(newLimit, -150);
          nextSignTimeRef.current = t + 20 + Math.random() * 20; 
      }

      // --- Physics & Object Movement ---
      // Move speed is proportional to train speed. 
      // 60km/h is roughly 16m/s. In ThreeJS units here, let's say 1 unit = 1 meter approx.
      // So 60km/h = 16.6 units/sec. 
      const worldMoveDist = (currentSpeedRef.current * 0.28) * delta; 
      
      for (const obj of movingObjects) {
        obj.position.z += worldMoveDist;
        if (obj.position.z > frontLimit) {
          obj.position.z -= wrapDistance;
          // Respawn logic for scenery, but KEEP signs in their slot or remove them? 
          // Current logic wraps everything. If a sign wraps, it becomes a "ghost" sign from behind.
          // To keep it simple: random scatter lateral position on wrap for scenery, remove signs.
          
          // Check if it is a sign (has a specific structure or userData could be used)
          // Since we stored signs in movingObjects, they will wrap. 
          // Let's repurpose the object if it's NOT a sign.
          const isSign = activeSignsRef.current.some(s => s.mesh === obj) || obj.children.some(c => c instanceof THREE.Mesh && (c.geometry instanceof THREE.CircleGeometry));
          
          if (!isSign) {
              if (obj.position.x < -4 || obj.position.x > 4) {
                const side = obj.position.x > 0 ? 1 : -1;
                obj.position.x = side * (6 + Math.random() * 8); 
              }
          } else {
             // If it IS a sign and it wrapped, we should technically remove it or hide it, 
             // because signs are spawned via the timer logic.
             // For simplicity in this loop, we just push it way back or hide it.
             obj.position.y = -100; // Hide underground
          }
        }
      }

      // Animate Rain
      if (rainSystemRef.current) {
          const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
          for(let i=0; i<rainCount; i++) {
              positions[i*3+1] -= 20 * delta; 
              positions[i*3] -= 4 * delta; 
              if (positions[i*3+1] < -2) {
                  positions[i*3+1] = 5;
                  positions[i*3] = (Math.random() - 0.5) * 10 + 2; 
              }
          }
          rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Animate Snow
      if (snowSystemRef.current) {
          const positions = snowSystemRef.current.geometry.attributes.position.array as Float32Array;
          for(let i=0; i<snowCount; i++) {
              positions[i*3+1] -= 2.5 * delta; 
              positions[i*3] -= (2.0 * delta) + Math.sin(t + positions[i*3+1]) * 0.01;
              positions[i*3+2] += Math.cos(t * 0.5 + i) * 0.01;
              if (positions[i*3+1] < -2) {
                  positions[i*3+1] = 8;
                  positions[i*3] = (Math.random() - 0.5) * 15; 
              }
          }
          snowSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Animate People
      peopleRef.current.forEach((person, idx) => {
          const shiver = Math.sin(t * 10 + idx) * 0.005;
          const breathe = Math.sin(t * 2 + idx) * 0.02;
          person.scale.set(1 + shiver, 1 + breathe, 1 + shiver);
          person.rotation.z = Math.sin(t + idx) * 0.05;
      });

      // Animate Wiper
      if (wiperPivotRef.current) {
        if (weatherRef.current === 'rain') {
            const wipeSpeed = 3.5; 
            const angle = Math.sin(t * wipeSpeed) * 0.8;
            wiperPivotRef.current.rotation.z = angle;
        } else {
            const currentZ = wiperPivotRef.current.rotation.z;
            wiperPivotRef.current.rotation.z = THREE.MathUtils.lerp(currentZ, -1.0, delta * 2);
        }
      }

      // Animate Gauges
      if (gaugeNeedlesRef.current.length >= 3) {
          // Speedometer Logic
          // Ensure ratio is strictly between 0 and 1 to prevent "over-twisting"
          const speedRatio = Math.max(0, Math.min(1, currentSpeedRef.current / 120)); 
          
          const startAngle = Math.PI * 0.75; // Matches Bottom Left
          const totalAngle = Math.PI * 1.5;  // Matches Range
          const currentAngle = startAngle - (speedRatio * totalAngle);

          // Vibration increases with speed
          const vibrationAmp = 0.005 + (speedRatio * 0.05); 
          const speedJitter = (Math.sin(t * 25) + Math.cos(t * 40)) * vibrationAmp;
          
          gaugeNeedlesRef.current[0].rotation.z = currentAngle + speedJitter;
          
          // Pressure: Slow drift
          const pressure = Math.sin(t * 0.2) * 0.1 + 0.5;
          gaugeNeedlesRef.current[1].rotation.z = (Math.PI * 1.25) - (pressure * (Math.PI * 1.5));

          // Voltage: Jitter
          const volts = 0.8 + (Math.random() - 0.5) * 0.05;
          gaugeNeedlesRef.current[2].rotation.z = (Math.PI * 1.25) - (volts * (Math.PI * 1.5));
      }

      // Camera Shake Intensity based on Speed
      const shakeScalar = currentSpeedRef.current / 60; // 1.0 at normal speed
      const shakeX = (Math.sin(t * 20) * 0.002 + Math.sin(t * 50) * 0.002) * shakeScalar;
      const shakeY = (Math.cos(t * 18) * 0.003) * shakeScalar;
      const sway = Math.sin(t * 1.5) * 0.02;
      
      camera.position.x = pointerOffsetX + shakeX + (Math.sin(t * 0.5) * 0.01);
      camera.position.y = 1.2 + pointerOffsetY + shakeY + sway;
      camera.lookAt(0 + pointerOffsetX * 0.5, 1.0 + pointerOffsetY * 0.5, -10);
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || window.innerWidth;
      const newHeight = container.clientHeight || window.innerHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", onPointerMove);
      if (frameId) cancelAnimationFrame(frameId);
      if (renderer) {
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      }
      if (sceneRef.current) {
        sceneRef.current.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });
      }
    };
  }, []); 

  return <div ref={containerRef} className="w-full h-full" />;
};

export default PostSovietTrainView;