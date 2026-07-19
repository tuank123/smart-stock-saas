'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Video, VideoOff } from 'lucide-react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Button } from '@/components/ui/button';

// ── Camera barcode scanner ────────────────────────────────────────────────────

interface BarcodeScannerProps {
  onDetected: (value: string) => void;
}

export function BarcodeScanner({ onDetected }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(false);

  const stopScan = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScanning(false);
  }, []);

  async function startScan() {
    setCameraError(null);
    detectedRef.current = false;
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current!,
        (result) => {
          if (result && !detectedRef.current) {
            detectedRef.current = true;
            stopScan();
            onDetected(result.getText());
          }
        },
      );
      controlsRef.current = controls;
    } catch {
      setScanning(false);
      setCameraError('Kameraya erişilemiyor. Lütfen tarayıcı kamera iznini kontrol edin.');
    }
  }

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  return (
    <div className="space-y-2">
      {/* Video element stays mounted so the ref is always available */}
      <div className={scanning ? 'block' : 'hidden'}>
        <video
          ref={videoRef}
          className="w-full max-h-48 rounded-md object-cover bg-black"
          muted
          playsInline
        />
      </div>

      {cameraError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {cameraError}
        </div>
      )}

      {!scanning ? (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={startScan}
        >
          <Video className="h-4 w-4" />
          Kamerayı Aç
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={stopScan}
        >
          <VideoOff className="h-4 w-4" />
          Kamerayı Kapat
        </Button>
      )}
    </div>
  );
}
