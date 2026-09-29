import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { audio } from './engine';
import { music } from './music';

export function useAudioSettings(): void {
  const settings = useAppStore((s) => s.data.settings);
  const { sfxVolume, musicVolume, musicOn, muted } = settings;

  useEffect(() => {
    audio.setVolumes(sfxVolume, musicVolume, muted);
  }, [sfxVolume, musicVolume, muted]);

  useEffect(() => {
    if (musicOn && !muted) music.start();
    else music.stop();
    return () => music.stop();
  }, [musicOn, muted]);

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    const unlock = () => audio.resume();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);
}
