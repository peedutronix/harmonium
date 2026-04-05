'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { NoteKey } from './constants';

type Voice = {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
};

type PlaybackMode = 'samples' | 'oscillator';
type ReedMode = 'single' | 'double';

const REFERENCE_SAMPLE_URL = '/harmonium-kannan-orig.wav';
const REFERENCE_REVERB_URL = '/reverb.wav';
const REFERENCE_ROOT_MIDI = 62;
const REFERENCE_LOOP_START = 0.5;
const PIANO_SAMPLE_URL = 'https://tonejs.github.io/audio/salamander/C4.mp3';
const PIANO_ROOT_MIDI = 60;

async function fetchAudioBuffer(context: AudioContext, url: string) {
  const response = await fetch(url, { cache: 'force-cache' }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const buffer = await response.arrayBuffer();
  return context.decodeAudioData(buffer.slice(0));
}

function createReferenceSource({
  buffer,
  context,
  destination,
  midi,
}: {
  buffer: AudioBuffer;
  context: AudioContext;
  destination: AudioNode;
  midi: number;
}) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = REFERENCE_LOOP_START;
  source.detune.value = (midi - REFERENCE_ROOT_MIDI) * 100;
  source.connect(destination);
  source.start(0);

  return source;
}

function createPianoReferenceSource({
  buffer,
  context,
  destination,
  midi,
}: {
  buffer: AudioBuffer;
  context: AudioContext;
  destination: AudioNode;
  midi: number;
}) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = false;
  source.detune.value = (midi - PIANO_ROOT_MIDI) * 100;
  source.connect(destination);
  source.start(0);

  return source;
}

function createFallbackSource({
  context,
  destination,
  frequency,
  type,
}: {
  context: AudioContext;
  destination: AudioNode;
  frequency: number;
  type: OscillatorType;
}) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(destination);
  oscillator.start(0);

  return oscillator;
}

export function useHarmoniumPlayer({
  octave,
  transpose,
  volume,
  reverbEnabled,
  reedMode,
  instrument = 'harmonium',
}: {
  octave: number;
  transpose: number;
  volume: number;
  reverbEnabled: boolean;
  reedMode: ReedMode;
  instrument?: 'harmonium' | 'piano';
}) {
  const [activeNoteIds, setActiveNoteIds] = useState<string[]>([]);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('samples');

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const reverbNodeRef = useRef<ConvolverNode | null>(null);
  const reverbConnectedRef = useRef(false);
  const voicesRef = useRef<Map<string, Voice>>(new Map());
  const requestedVoiceIdsRef = useRef<Set<string>>(new Set());
  const sustainEnabledRef = useRef(false);
  const sustainedVoiceIdsRef = useRef<Set<string>>(new Set());
  const sampleBufferPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const pianoSamplePromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const reverbBufferPromiseRef = useRef<Promise<AudioBuffer | null> | null>(null);
  const settingsRef = useRef({
    octave,
    transpose,
    volume,
    reverbEnabled,
    reedMode,
    instrument,
  });

  const syncReverbRoute = useCallback((enabled: boolean) => {
    const gainNode = gainNodeRef.current;
    const reverbNode = reverbNodeRef.current;

    if (!gainNode || !reverbNode?.buffer) {
      return;
    }

    if (enabled && !reverbConnectedRef.current) {
      gainNode.connect(reverbNode);
      reverbConnectedRef.current = true;
      return;
    }

    if (!enabled && reverbConnectedRef.current) {
      try {
        gainNode.disconnect(reverbNode);
      } catch (error) {
        console.error('Failed to disconnect harmonium reverb', error);
      }
      reverbConnectedRef.current = false;
    }
  }, []);

  useEffect(() => {
    settingsRef.current = {
      octave,
      transpose,
      volume,
      reverbEnabled,
      reedMode,
      instrument,
    };

    const context = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (!context || !gainNode) {
      return;
    }

    gainNode.gain.setTargetAtTime(volume, context.currentTime, 0.03);
    syncReverbRoute(reverbEnabled);
  }, [octave, transpose, volume, reverbEnabled, reedMode, syncReverbRoute]);

  const ensureAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      const context = new AudioContextClass();
      const gainNode = context.createGain();
      const reverbNode = context.createConvolver();

      gainNode.gain.value = settingsRef.current.volume;
      gainNode.connect(context.destination);
      reverbNode.connect(context.destination);

      audioContextRef.current = context;
      gainNodeRef.current = gainNode;
      reverbNodeRef.current = reverbNode;
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const loadReferenceSample = useCallback(async (context: AudioContext) => {
    if (!sampleBufferPromiseRef.current) {
      sampleBufferPromiseRef.current = fetchAudioBuffer(
        context,
        REFERENCE_SAMPLE_URL
      ).catch((error) => {
        console.error('Failed to load harmonium reference sample', error);
        return null;
      });
    }

    return sampleBufferPromiseRef.current;
  }, []);

  const loadPianoSample = useCallback(async (context: AudioContext) => {
    if (!pianoSamplePromiseRef.current) {
      pianoSamplePromiseRef.current = fetchAudioBuffer(context, PIANO_SAMPLE_URL).catch(() => null);
    }
    return pianoSamplePromiseRef.current;
  }, []);

  const loadReferenceReverb = useCallback(
    async (context: AudioContext) => {
      if (!reverbBufferPromiseRef.current) {
        reverbBufferPromiseRef.current = fetchAudioBuffer(
          context,
          REFERENCE_REVERB_URL
        ).catch((error) => {
          console.error('Failed to load harmonium reverb response', error);
          return null;
        });
      }

      const buffer = await reverbBufferPromiseRef.current;
      const reverbNode = reverbNodeRef.current;
      if (!buffer || !reverbNode) {
        return null;
      }

      reverbNode.buffer = buffer;
      syncReverbRoute(settingsRef.current.reverbEnabled);
      return buffer;
    },
    [syncReverbRoute]
  );

  const stopNote = useCallback((noteId: string) => {
    const context = audioContextRef.current;
    const voice = voicesRef.current.get(noteId);
    requestedVoiceIdsRef.current.delete(noteId);
    if (!voice) {
      return;
    }

    if (context) {
      voice.gain.gain.cancelScheduledValues(context.currentTime);
      voice.gain.gain.setValueAtTime(
        Math.max(voice.gain.gain.value, 0.0001),
        context.currentTime
      );
      voice.gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.03
      );
    }

    for (const source of voice.sources) {
      try {
        source.stop(context ? context.currentTime + 0.04 : 0);
      } catch (error) {
        console.error('Failed to stop harmonium note', error);
      }
    }

    voicesRef.current.delete(noteId);
    sustainedVoiceIdsRef.current.delete(noteId);
    setActiveNoteIds((current) => current.filter((id) => id !== noteId));

    window.setTimeout(() => {
      try {
        voice.gain.disconnect();
      } catch {
        // Ignore disconnect races during teardown.
      }
    }, 120);
  }, []);

  const stopAllNotes = useCallback(() => {
    requestedVoiceIdsRef.current.clear();
    for (const noteId of [...voicesRef.current.keys()]) {
      stopNote(noteId);
    }
    sustainedVoiceIdsRef.current.clear();
  }, [stopNote]);

  const setMidiSustain = useCallback(
    (enabled: boolean) => {
      sustainEnabledRef.current = enabled;

      if (enabled) {
        return;
      }

      for (const voiceId of [...sustainedVoiceIdsRef.current]) {
        stopNote(voiceId);
      }
      sustainedVoiceIdsRef.current.clear();
    },
    [stopNote]
  );

  const startVoice = useCallback(
    async ({ voiceId, desiredMidi, velocity = 1 }: { voiceId: string; desiredMidi: number; velocity?: number }) => {
      requestedVoiceIdsRef.current.add(voiceId);
      sustainedVoiceIdsRef.current.delete(voiceId);

      if (voicesRef.current.has(voiceId)) {
        return;
      }

      const context = await ensureAudio();
      const gainNode = gainNodeRef.current;
      if (!context || !gainNode) {
        return;
      }

      void loadReferenceReverb(context);

      const voiceGain = context.createGain();
      voiceGain.gain.value = velocity;
      voiceGain.connect(gainNode);

      let sampleBuffer: AudioBuffer | null = null;
      let pianoSampleBuffer: AudioBuffer | null = null;
      if (settingsRef.current.instrument === 'piano') {
        pianoSampleBuffer = await loadPianoSample(context);
      } else {
        sampleBuffer = await loadReferenceSample(context);
      }

      if (
        voicesRef.current.has(voiceId) ||
        !requestedVoiceIdsRef.current.has(voiceId)
      ) {
        voiceGain.disconnect();
        return;
      }

      const sources: AudioScheduledSourceNode[] = [];

      if (settingsRef.current.instrument === 'piano') {
        const t = context.currentTime;
        if (pianoSampleBuffer) {
           sources.push(createPianoReferenceSource({ buffer: pianoSampleBuffer, context, destination: voiceGain, midi: desiredMidi }));
           
           voiceGain.gain.setValueAtTime(0, t);
           voiceGain.gain.linearRampToValueAtTime(velocity * 1.5, t + 0.01);
           
           setPlaybackMode('samples');
        } else {
            const frequency = 440 * 2 ** ((desiredMidi - 69) / 12);
            const osc1 = createFallbackSource({ context, destination: voiceGain, frequency, type: 'sine' });
            const osc2 = context.createOscillator();
            osc2.type = 'triangle';
            osc2.frequency.value = frequency;
            const gain2 = context.createGain();
            const filter2 = context.createBiquadFilter();
            filter2.type = 'lowpass';
            filter2.frequency.setValueAtTime(frequency * 3, t);
            filter2.frequency.exponentialRampToValueAtTime(frequency, t + 0.5);
            osc2.connect(filter2); filter2.connect(gain2); gain2.connect(voiceGain);
            osc2.start(t);
            
            sources.push(osc1, osc2);
            voiceGain.gain.setValueAtTime(0, t);
            voiceGain.gain.linearRampToValueAtTime(velocity * 1.5, t + 0.01);
            voiceGain.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
            
            setPlaybackMode('oscillator');
        }
      } else if (sampleBuffer) {
        sources.push(
          createReferenceSource({
            buffer: sampleBuffer,
            context,
            destination: voiceGain,
            midi: desiredMidi,
          })
        );

        if (settingsRef.current.reedMode === 'double') {
          sources.push(
            createReferenceSource({
              buffer: sampleBuffer,
              context,
              destination: voiceGain,
              midi: desiredMidi + 12,
            })
          );
        }

        setPlaybackMode('samples');
      } else {
        const frequency = 440 * 2 ** ((desiredMidi - 69) / 12);

        sources.push(
          createFallbackSource({
            context,
            destination: voiceGain,
            frequency,
            type: 'sawtooth',
          })
        );
        sources.push(
          createFallbackSource({
            context,
            destination: voiceGain,
            frequency: frequency * 0.5,
            type: 'triangle',
          })
        );

        if (settingsRef.current.reedMode === 'double') {
          sources.push(
            createFallbackSource({
              context,
              destination: voiceGain,
              frequency: frequency * 2,
              type: 'sawtooth',
            })
          );
        }

        setPlaybackMode('oscillator');
      }

      voicesRef.current.set(voiceId, {
        gain: voiceGain,
        sources,
      });
    },
    [ensureAudio, loadReferenceReverb, loadReferenceSample]
  );

  const startNote = useCallback(
    async (note: NoteKey) => {
      await startVoice({
        voiceId: note.id,
        desiredMidi:
          note.midi +
          (settingsRef.current.octave - 4) * 12 +
          settingsRef.current.transpose,
      });
    },
    [startVoice]
  );

  const startMidiNote = useCallback(
    async (voiceId: string, midi: number, velocity: number = 1) => {
      await startVoice({
        voiceId,
        desiredMidi: midi + settingsRef.current.transpose,
        velocity
      });
    },
    [startVoice]
  );

  const stopMidiNote = useCallback(
    (voiceId: string) => {
      if (sustainEnabledRef.current) {
        sustainedVoiceIdsRef.current.add(voiceId);
        return;
      }

      stopNote(voiceId);
    },
    [stopNote]
  );

  const wrappedStartNote = useCallback(
    async (note: NoteKey) => {
      await startNote(note);
      setActiveNoteIds((current) =>
        current.includes(note.id) ? current : [...current, note.id]
      );
    },
    [startNote]
  );

  const wrappedStopNote = useCallback(
    (noteId: string) => {
      stopNote(noteId);
    },
    [stopNote]
  );

  useEffect(() => {
    return () => {
      stopAllNotes();
      void audioContextRef.current?.close();
    };
  }, [stopAllNotes]);

  return {
    activeNoteIds,
    playbackMode,
    setMidiSustain,
    startMidiNote,
    stopMidiNote,
    startNote: wrappedStartNote,
    stopNote: wrappedStopNote,
    stopAllNotes,
  };
}
