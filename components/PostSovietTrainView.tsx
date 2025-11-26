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

  // Scene Refs for dynamic updates
  const sceneRef = useRef<THREE.Scene | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const interiorLightRef = useRef<THREE.PointLight | null>(null);
  const rainSystemRef = useRef<THREE.Points | null>(null);
  const snowSystemRef = useRef<THREE.Points | null>(null); // NEW: Snow
  const starsRef = useRef<THREE.Points | null>(null);
  const streetLightsRef = useRef<THREE.PointLight[]>([]);
  const wiperPivotRef = useRef<THREE.Group | null>(null);
  const peopleRef = useRef<THREE.Group[]>([]); // NEW: People

  // Refs for Animation Loop (Fixes stale closures)
  const weatherRef = useRef<Weather>(weather);

  useEffect(() => {
    weatherRef.current = weather;
  }, [weather]);

  // --- Environment Reactive Updates ---
  // This effect handles visual changes (Lights, Fog, Sky) when state changes
  useEffect(() => {
    if (!sceneRef.current) return;

    const isNight = timeOfDay === 'night';
    const isRain = weather === 'rain';
    const isSnow = weather === 'snow';
    const isCloudy = weather === 'cloudy';

    // 1. Fog & Background Color
    let fogColor = new THREE.Color(0x8a96a3); // Day Clear default
    let fogDensity = 0.02;

    if (isNight) {
        fogColor.setHex(0x05070a); // Deep dark night
        if (isSnow) {
            fogColor.setHex(0x1a1c22); // Night Snow (slightly brighter due to snow reflection)
            fogDensity = 0.035;
        } else {
            fogDensity = isRain ? 0.04 : 0.015;
        }
    } else {
        // Day
        if (isRain) {
            fogColor.setHex(0x556677); // Grey Rain
            fogDensity = 0.05;
        } else if (isSnow) {
            fogColor.setHex(0xccdde5); // White/Grey Snow Mist
            fogDensity = 0.04;
        } else if (isCloudy) {
            fogColor.setHex(0x778899); // Cloudy
            fogDensity = 0.03;
        }
    }
    
    sceneRef.current.background = fogColor;
    if (sceneRef.current.fog) {
        (sceneRef.current.fog as THREE.FogExp2).color.copy(fogColor);
        (sceneRef.current.fog as THREE.FogExp2).density = fogDensity;
    } else {
        sceneRef.current.fog = new THREE.FogExp2(fogColor, fogDensity);
    }

    // 2. Rain/Snow Visibility
    if (rainSystemRef.current) {
        rainSystemRef.current.visible = isRain;
    }
    if (snowSystemRef.current) {
        snowSystemRef.current.visible = isSnow;
    }

    // 3. Stars Visibility (Night + Clear only)
    if (starsRef.current) {
        starsRef.current.visible = isNight && !isRain && !isCloudy && !isSnow;
    }

    // 4. Lighting Intensity
    // Ambient
    if (ambientLightRef.current) {
        // Snow reflects more light
        const snowBoost = isSnow ? 0.2 : 0;
        ambientLightRef.current.intensity = (isNight ? 0.1 : (isRain ? 0.3 : 0.5)) + snowBoost;
    }
    // Directional (Sun/Moon)
    if (dirLightRef.current) {
        dirLightRef.current.intensity = isNight ? 0.1 : (isRain || isSnow ? 0.2 : 0.8);
        dirLightRef.current.color.setHex(isNight ? 0x88aaff : (isSnow ? 0xddeeff : 0xffddaa));
    }
    // Interior Light (Warmer and brighter at night)
    if (interiorLightRef.current) {
        interiorLightRef.current.intensity = isNight ? 0.4 : 0.05;
        interiorLightRef.current.color.setHex(isNight ? 0xffaa55 : 0xffffff);
    }
    // Street Lights (On at night)
    streetLightsRef.current.forEach(light => {
        light.intensity = isNight ? 2.0 : 0;
    });

    // 5. Snow Accumulation (Dynamic Materials)
    sceneRef.current.traverse((obj) => {
        // Toggle Snow Caps
        if (obj.name === 'snowCap') {
            obj.visible = isSnow;
        }
        // Change Ground Color
        if (obj.name === 'ground') {
            const mesh = obj as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (isSnow) {
                mat.color.setHex(0xdddddd); // Snowy ground
                mat.roughness = 0.6;
            } else {
                mat.color.setHex(0x383a38); // Standard dirt/concrete
                mat.roughness = 1.0;
            }
        }
    });

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

        // 1. Background Rumble (Pink/Brown noise approximation)
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0; 
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.02 * white)) / 1.02; // Simple brown noise filter
          lastOut = data[i];
          data[i] *= 3.5; 
        }

        const rumbleSrc = ctx.createBufferSource();
        rumbleSrc.buffer = buffer;
        rumbleSrc.loop = true;

        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.value = 120; // Deep rumble

        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0.3;

        rumbleSrc.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(masterGain);
        rumbleSrc.start();

        // 2. Rain Noise (Higher pitched pink noise)
        const rainBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const rainData = rainBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            // Paul Kellett's refined method for pink noise
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

        // Radio Filter (The "Cheap Speaker" sound)
        const radioFilter = ctx.createBiquadFilter();
        radioFilter.type = 'bandpass';
        radioFilter.frequency.value = 1000;
        radioFilter.Q.value = 1.0;
        radioFilter.connect(radioMaster);
        radioFilterRef.current = radioFilter;

        // Static Noise Source
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

        // Music Input Gain (Where we attach our procedural synth)
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
    
    // 1. Master On/Off + Volume
    const masterTarget = radioOn ? radioVol : 0;
    radioMasterGainRef.current.gain.setTargetAtTime(masterTarget, audioCtxRef.current.currentTime, 0.1);

    // 2. Tuning Logic
    const stations = [
        { freq: 96.0, type: 'music', bandwidth: 0.8 },
        { freq: 104.5, type: 'buzzer', bandwidth: 0.4 } // The buzzer is handled in the procedural loop logic roughly
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

    let signalQuality = 0; // 0 = all static, 1 = all music
    if (closestStation && bestStationDiff < 1.5) {
        // Linear fade in within 1.5 MHz range
        signalQuality = 1 - (bestStationDiff / 1.5);
        signalQuality = Math.max(0, signalQuality);
        
        // Add some random dropouts if signal is weak
        if (signalQuality < 0.8 && Math.random() > 0.9) {
            signalQuality *= 0.5;
        }
    }

    // Static is loud when signal is weak
    const staticVol = (1.0 - signalQuality) * 0.4 + 0.05; // Always some static
    const musicVol = signalQuality; // Music volume

    radioStaticGainRef.current.gain.setTargetAtTime(staticVol, audioCtxRef.current.currentTime, 0.1);
    radioMusicGainRef.current.gain.setTargetAtTime(musicVol, audioCtxRef.current.currentTime, 0.1);

    // Filter frequency shift based on tuning (makes it sound like you are "dialing it in")
    if (radioFilterRef.current) {
        // Center at 1000, drift to 400 or 3000 if off-tune
        const drift = (bestStationDiff * 500) * (Math.random() > 0.5 ? 1 : -1);
        const targetFreq = 1000 + drift;
        radioFilterRef.current.frequency.setTargetAtTime(targetFreq, audioCtxRef.current.currentTime, 0.1);
    }

  }, [radioOn, radioFreq, radioVol, audioEnabled]);

  // Handle Rain Volume
  useEffect(() => {
    if (rainGainRef.current && audioCtxRef.current) {
        const t = audioCtxRef.current.currentTime;
        const targetVol = weather === 'rain' ? 0.35 : 0;
        rainGainRef.current.gain.setTargetAtTime(targetVol, t, 0.5); 
    }
  }, [weather]);

  // --- Procedural "Soviet Lofi" Generator ---
  const startProceduralRadio = (ctx: AudioContext, output: GainNode) => {
      // Scales: A Minor (Natural)
      const scale = [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00]; // A3 to G3
      // Bass notes (A1, F1, C2, G1)
      const bassProgression = [55.00, 43.65, 65.41, 49.00]; 
      
      let step = 0;
      let bar = 0;

      // Master Compressor for the music
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      compressor.connect(output);

      // Reverb (Convolver) - Simple impulse
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
         
         // Detune for analog feel
         osc.detune.value = (Math.random() - 0.5) * 15; 

         filter.type = isBass ? 'lowpass' : 'lowpass';
         filter.frequency.value = isBass ? 400 : 2000;
         filter.Q.value = 2;

         osc.connect(filter);
         filter.connect(gain);
         gain.connect(compressor); // Dry signal
         if (!isBass) gain.connect(reverb); // Send lead to reverb

         const t = ctx.currentTime;
         gain.gain.setValueAtTime(0, t);
         gain.gain.linearRampToValueAtTime(vol, t + 0.05);
         gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

         osc.start(t);
         osc.stop(t + dur + 0.1);

         // cleanup
         setTimeout(() => {
             osc.disconnect();
             gain.disconnect();
         }, (dur + 1) * 1000);
      };

      const playNoise = (dur: number) => {
         const bufferSize = ctx.sampleRate * dur;
         const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
         const data = buffer.getChannelData(0);
         for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
         }
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

      // Sequencer Loop (100 BPM approx)
      const beatTime = 0.6; 
      
      sequencerInterval.current = setInterval(() => {
         if (ctx.state !== 'running') return;

         // Bass: Change every 8 steps (2 bars)
         if (step % 8 === 0) {
            const bassNote = bassProgression[(bar % 4)];
            playNote(bassNote, 'sawtooth', beatTime * 8, 0.3, true);
         }

         // Melody: Random notes on the scale, sparse
         if (Math.random() > 0.4) {
             const note = scale[Math.floor(Math.random() * scale.length)];
             // Random octave
             const oct = Math.random() > 0.5 ? 1 : 2;
             playNote(note * oct, 'square', beatTime, 0.05, false);
         }

         // Drums: Simple kick/snare
         if (step % 4 === 0) {
             // Kick approximation (low sine sweep)
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
             // Snare (Noise)
             playNoise(0.1);
         }

         // Arpeggio / High Hat
         if (step % 2 === 0) {
            playNoise(0.02); // light hat
         }

         step++;
         if (step >= 16) {
             step = 0;
             bar++;
         }

      }, beatTime * 1000);
  };

  // Cleanup Sequencer
  useEffect(() => {
      return () => {
          if (sequencerInterval.current) clearInterval(sequencerInterval.current);
      };
  }, []);

  // Handle Autoplay Policy
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

  // --- Rhythm Loop (The Clack-Clack) ---
  useEffect(() => {
    if (!audioEnabled) return;
    
    let timeoutId: any;

    const playClack = () => {
      const ctx = audioCtxRef.current;
      const master = masterGainRef.current;
      if (!ctx || !master || ctx.state !== 'running') return;

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

      createHit(t, 0.4);
      createHit(t + 0.14, 0.3);
      const nextDelay = 1600 + Math.random() * 300;
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
    
    // Initial Fog (will be updated by the environment effect)
    scene.fog = new THREE.FogExp2(0x8a96a3, 0.02);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    camera.position.set(0, 1.2, 0.8);
    camera.lookAt(0, 1.0, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false; 
    container.appendChild(renderer.domElement);

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0xb0b5c0, 0.3);
    scene.add(ambient);
    ambientLightRef.current = ambient;

    const dir = new THREE.DirectionalLight(0xaaccff, 0.6);
    dir.position.set(-20, 30, 10);
    scene.add(dir);
    dirLightRef.current = dir;

    const interiorLight = new THREE.PointLight(0xffaa55, 0.1, 5);
    interiorLight.position.set(0, 2, 1);
    scene.add(interiorLight);
    interiorLightRef.current = interiorLight;

    // --- Interior ---
    const interior = new THREE.Group();
    scene.add(interior);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(4, 4);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x252525,
      roughness: 0.9,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.0, 1.0);
    interior.add(floor);

    // Seat
    const seatGeo = new THREE.BoxGeometry(1.3, 0.15, 0.5);
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x4a3b32,
      roughness: 0.6,
      metalness: 0.1,
    });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(-0.9, 0.4, 1.0);
    interior.add(seat);

    const backGeo = new THREE.BoxGeometry(1.3, 0.6, 0.05);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(-0.9, 0.85, 0.8);
    interior.add(back);

    // Window Frame
    const windowGroup = new THREE.Group();
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.7,
      metalness: 0.3,
    });

    const frameThickness = 0.06;
    const frameWidth = 1.9;
    const frameHeight = 1.15;
    const frameDepth = 0.05;

    const verticalGeo = new THREE.BoxGeometry(frameThickness, frameHeight, frameDepth);
    const horizontalGeo = new THREE.BoxGeometry(frameWidth, frameThickness, frameDepth);

    const leftFrame = new THREE.Mesh(verticalGeo, frameMaterial);
    leftFrame.position.set(-frameWidth / 2, 1.2, -0.6);
    const rightFrame = leftFrame.clone();
    rightFrame.position.x = frameWidth / 2;

    const topFrame = new THREE.Mesh(horizontalGeo, frameMaterial);
    topFrame.position.set(0, 1.2 + frameHeight / 2, -0.6);

    const bottomFrame = new THREE.Mesh(horizontalGeo, frameMaterial);
    bottomFrame.position.set(0, 1.2 - frameHeight / 2, -0.6);

    // --- Glass Pane (Added) ---
    const glassGeo = new THREE.PlaneGeometry(frameWidth - frameThickness, frameHeight - frameThickness);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.15,
        roughness: 0.1,
        metalness: 0.6,
        side: THREE.DoubleSide
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0, 1.2, -0.6);
    windowGroup.add(glass);

    // REMOVED MID FRAME to clear grid

    windowGroup.add(leftFrame, rightFrame, topFrame, bottomFrame);
    interior.add(windowGroup);

    // --- Wiper System (Added) ---
    const wiperGroup = new THREE.Group();
    // Pivot at bottom center of the window area
    wiperGroup.position.set(0, 1.2 - frameHeight/2 + 0.05, -0.62); 
    
    // Wiper Arm
    const wiperArmGeo = new THREE.BoxGeometry(0.02, 0.8, 0.02);
    const wiperMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
    const wiperArm = new THREE.Mesh(wiperArmGeo, wiperMat);
    wiperArm.position.y = 0.4; // Offset so it rotates from bottom
    wiperGroup.add(wiperArm);

    // Wiper Blade
    const wiperBladeGeo = new THREE.BoxGeometry(0.01, 0.8, 0.04); // Wider blade
    const wiperBlade = new THREE.Mesh(wiperBladeGeo, wiperMat);
    wiperBlade.position.y = 0.4;
    wiperBlade.rotation.y = Math.PI / 8; // Slight angle
    wiperGroup.add(wiperBlade);

    // Wiper Base (Pivot visual)
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
        rainPos[i*3] = (Math.random() - 0.5) * 10; // x
        rainPos[i*3+1] = Math.random() * 5; // y
        rainPos[i*3+2] = -1 - Math.random() * 5; // z
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.PointsMaterial({
        color: 0xaaaaaa,
        size: 0.03,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    rainSystem.visible = false;
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
        color: 0xffffff,
        size: 0.04,
        transparent: true,
        opacity: 0.8,
        map: (() => {
            // Simple circle texture for soft snow
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const context = canvas.getContext('2d');
            if(context) {
                context.fillStyle = 'white';
                context.beginPath();
                context.arc(16, 16, 14, 0, Math.PI * 2);
                context.fill();
            }
            const tex = new THREE.CanvasTexture(canvas);
            return tex;
        })(),
        sizeAttenuation: true
    });
    const snowSystem = new THREE.Points(snowGeo, snowMat);
    snowSystem.visible = false;
    scene.add(snowSystem);
    snowSystemRef.current = snowSystem;

    // --- Stars System (For Clear Nights) ---
    const starCount = 400;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    for(let i=0; i<starCount; i++) {
      // Distant stars above the horizon
      starPos[i*3] = (Math.random() - 0.5) * 200;
      starPos[i*3+1] = Math.random() * 50 + 10; 
      starPos[i*3+2] = -50 - Math.random() * 100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPos, 3)), new THREE.PointsMaterial({ color: 0xffffff, size: 0.3, transparent: true, opacity: 0.8, sizeAttenuation: true }));
    stars.visible = false;
    scene.add(stars);
    starsRef.current = stars;

    // --- Exterior World ---
    const world = new THREE.Group();
    scene.add(world);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(200, 120);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x383a38,
      roughness: 1.0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.name = 'ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.1, -60);
    world.add(ground);

    // Rails
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      metalness: 0.7,
      roughness: 0.4,
    });
    const railGeo = new THREE.BoxGeometry(0.08, 0.1, 150);

    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-0.6, 0.05, -50);

    const rightRail = leftRail.clone();
    rightRail.position.x = 0.6;

    world.add(leftRail, rightRail);

    // Ballast
    const ballastGeo = new THREE.BoxGeometry(2.8, 0.05, 150);
    const ballastMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 1.0,
    });
    const ballast = new THREE.Mesh(ballastGeo, ballastMat);
    ballast.position.set(0, 0.0, -50);
    world.add(ballast);

    // --- Object Generation ---
    const movingObjects: THREE.Object3D[] = [];
    streetLightsRef.current = []; // Reset tracked lights
    peopleRef.current = []; // Reset people

    const panelColors = [0x70757a, 0x676d72, 0x585c60, 0x6c6f77, 0x7e8380];
    const graffitiColors = [0x884444, 0x448844, 0x444488, 0xccccaa, 0x222222];

    function createPanelHouse(x: number, z: number) {
      const group = new THREE.Group();
      const width = 1.2 + Math.random() * 1.5;
      const height = 2.0 + Math.random() * 2.5;
      const depth = 0.8 + Math.random() * 0.8;
      
      const geo = new THREE.BoxGeometry(width, height, depth);
      const color = panelColors[Math.floor(Math.random() * panelColors.length)];
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = height / 2;
      group.add(mesh);

      // Snow Cap (Hidden by default)
      const capGeo = new THREE.BoxGeometry(width + 0.1, 0.05, depth + 0.1);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = height + 0.025;
      cap.name = 'snowCap';
      cap.visible = false;
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

       // Snow Cap for factory
      const capGeo = new THREE.BoxGeometry(baseWidth + 0.1, 0.05, 2.1);
      const capMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 1 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = baseHeight + 0.025;
      cap.name = 'snowCap';
      cap.visible = false;
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
      
      // Light source
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
        
        const group = new THREE.Group();
        group.add(trunk, crown);
        world.add(group);
        movingObjects.push(group);
    }

    // NEW: Person
    function createPerson(x: number, z: number) {
        const group = new THREE.Group();
        const height = 1.7 + Math.random() * 0.1;
        
        // Coat
        const bodyGeo = new THREE.CylinderGeometry(0.25, 0.3, height * 0.7, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = (height * 0.7) / 2;
        group.add(body);

        // Head
        const headGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xdcb498, roughness: 0.5 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = (height * 0.7) + 0.15;
        group.add(head);

        // Ushanka Hat
        const hatGeo = new THREE.BoxGeometry(0.35, 0.25, 0.35);
        const hatMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 1.0 });
        const hat = new THREE.Mesh(hatGeo, hatMat);
        hat.position.y = (height * 0.7) + 0.28;
        group.add(hat);

        group.position.set(x, 0, z);
        // Random rotation
        group.rotation.y = Math.random() * Math.PI * 2;
        
        world.add(group);
        movingObjects.push(group);
        peopleRef.current.push(group);
    }

    // --- Population Loop ---
    const totalObjects = 40;
    const spacing = 4;
    
    for (let i = 0; i < totalObjects; i++) {
      const z = -15 - i * spacing;
      const leftX = -8 - Math.random() * 6;
      const rightX = 8 + Math.random() * 6;

      createPanelHouse(leftX, z - 1 + Math.random() * 2);
      createPanelHouse(rightX, z + Math.random() * 2);

      // Add a person near some houses
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
        // Maybe a person waiting near the light
        if (Math.random() > 0.6) {
             createPerson(lightX + (Math.random()-0.5), z);
        }
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

    const speed = 12; 
    const wrapDistance = totalObjects * spacing;
    const frontLimit = 5;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const t = clock.getElapsedTime();
      const dist = speed * delta;

      for (const obj of movingObjects) {
        obj.position.z += dist;
        if (obj.position.z > frontLimit) {
          obj.position.z -= wrapDistance;
          if (obj.position.x < -4 || obj.position.x > 4) {
             const side = obj.position.x > 0 ? 1 : -1;
             obj.position.x = side * (6 + Math.random() * 8); 
          }
        }
      }

      // Animate Rain
      if (rainSystemRef.current && rainSystemRef.current.visible) {
          const positions = rainSystemRef.current.geometry.attributes.position.array as Float32Array;
          for(let i=0; i<rainCount; i++) {
              // Y moves down
              positions[i*3+1] -= 20 * delta; // Fall speed
              // X moves slightly against train movement
              positions[i*3] -= 4 * delta; 
              
              if (positions[i*3+1] < -2) {
                  positions[i*3+1] = 5;
                  positions[i*3] = (Math.random() - 0.5) * 10 + 2; // Offset reset
              }
          }
          rainSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Animate Snow (Slower, drifting)
      if (snowSystemRef.current && snowSystemRef.current.visible) {
          const positions = snowSystemRef.current.geometry.attributes.position.array as Float32Array;
          for(let i=0; i<snowCount; i++) {
              // Y moves down slowly
              positions[i*3+1] -= 2.5 * delta; 
              // X drifts with sine wave + train movement illusion
              positions[i*3] -= (2.0 * delta) + Math.sin(t + positions[i*3+1]) * 0.01;
              // Z drift (into or out of screen)
              positions[i*3+2] += Math.cos(t * 0.5 + i) * 0.01;

              if (positions[i*3+1] < -2) {
                  positions[i*3+1] = 8;
                  positions[i*3] = (Math.random() - 0.5) * 15; 
              }
          }
          snowSystemRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Animate People (Idle)
      peopleRef.current.forEach((person, idx) => {
          // Subtle breathing/shivering
          const shiver = Math.sin(t * 10 + idx) * 0.005;
          const breathe = Math.sin(t * 2 + idx) * 0.02;
          person.scale.set(1 + shiver, 1 + breathe, 1 + shiver);
          person.rotation.z = Math.sin(t + idx) * 0.05; // sway
      });


      // Animate Wiper
      if (wiperPivotRef.current) {
        // Use weatherRef.current to avoid stale closure (updated)
        if (weatherRef.current === 'rain') {
            const wipeSpeed = 3.5; 
            const angle = Math.sin(t * wipeSpeed) * 0.8; // oscillates between -0.8 and 0.8
            wiperPivotRef.current.rotation.z = angle;
        } else {
            // Smoothly return to rest position (approx -1.0 radians)
            const currentZ = wiperPivotRef.current.rotation.z;
            wiperPivotRef.current.rotation.z = THREE.MathUtils.lerp(currentZ, -1.0, delta * 2);
        }
      }

      const shakeX = Math.sin(t * 20) * 0.002 + Math.sin(t * 50) * 0.002;
      const shakeY = Math.cos(t * 18) * 0.003;
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
      // Simple scene disposal to free memory
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
  }, []); // Run once to setup scene, subsequent updates via other useEffects

  return <div ref={containerRef} className="w-full h-full" />;
};

export default PostSovietTrainView;