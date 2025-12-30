import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

interface NetworkInfo {
  quality: NetworkQuality;
  effectiveType: string;
  downlink: number;
  rtt: number;
  isOnline: boolean;
}

// Extend Navigator type for Network Information API
interface NetworkInformation {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlink: number;
  rtt: number;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

export const useNetworkQuality = () => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({
    quality: 'good',
    effectiveType: '4g',
    downlink: 10,
    rtt: 50,
    isOnline: navigator.onLine,
  });

  const measureLatency = useCallback(async (): Promise<number> => {
    try {
      const start = performance.now();
      // Use a tiny request to measure latency
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
        method: 'HEAD',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      return performance.now() - start;
    } catch {
      return 5000; // Assume very poor connection on error
    }
  }, []);

  const determineQuality = useCallback((rtt: number, downlink: number, effectiveType: string): NetworkQuality => {
    if (!navigator.onLine) return 'offline';
    
    // Based on measured RTT
    if (rtt < 100 && downlink > 5) return 'excellent';
    if (rtt < 300 && downlink > 2) return 'good';
    if (rtt < 600 && downlink > 0.5) return 'fair';
    
    // Also check effective type
    if (effectiveType === '4g' && rtt < 200) return 'good';
    if (effectiveType === '3g') return 'fair';
    if (effectiveType === '2g' || effectiveType === 'slow-2g') return 'poor';
    
    return 'poor';
  }, []);

  const updateNetworkInfo = useCallback(async () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    let effectiveType = '4g';
    let downlink = 10;
    let rtt = 50;

    if (connection) {
      effectiveType = connection.effectiveType || '4g';
      downlink = connection.downlink || 10;
      rtt = connection.rtt || 50;
    }

    // Measure actual latency
    const measuredRtt = await measureLatency();
    rtt = Math.max(rtt, measuredRtt);

    const quality = determineQuality(rtt, downlink, effectiveType);

    setNetworkInfo({
      quality,
      effectiveType,
      downlink,
      rtt,
      isOnline: navigator.onLine,
    });
  }, [measureLatency, determineQuality]);

  useEffect(() => {
    updateNetworkInfo();

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    const handleChange = () => updateNetworkInfo();
    const handleOnline = () => updateNetworkInfo();
    const handleOffline = () => {
      setNetworkInfo(prev => ({ ...prev, quality: 'offline', isOnline: false }));
    };

    connection?.addEventListener('change', handleChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic latency check every 30 seconds
    const interval = setInterval(updateNetworkInfo, 30000);

    return () => {
      connection?.removeEventListener('change', handleChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [updateNetworkInfo]);

  return networkInfo;
};

// Utility functions for network-aware behavior
export const getOptimalAudioSettings = (quality: NetworkQuality) => {
  switch (quality) {
    case 'excellent':
      return {
        bufferSize: 4096,
        silenceDuration: 600,
        prefixPadding: 300,
        threshold: 0.5,
      };
    case 'good':
      return {
        bufferSize: 4096,
        silenceDuration: 800,
        prefixPadding: 400,
        threshold: 0.6,
      };
    case 'fair':
      return {
        bufferSize: 8192,
        silenceDuration: 1000,
        prefixPadding: 500,
        threshold: 0.65,
      };
    case 'poor':
    case 'offline':
    default:
      return {
        bufferSize: 8192,
        silenceDuration: 1200,
        prefixPadding: 600,
        threshold: 0.7,
      };
  }
};

export const getRetryConfig = (quality: NetworkQuality) => {
  switch (quality) {
    case 'excellent':
    case 'good':
      return { maxRetries: 3, baseDelay: 1000, maxDelay: 5000 };
    case 'fair':
      return { maxRetries: 5, baseDelay: 2000, maxDelay: 10000 };
    case 'poor':
    case 'offline':
    default:
      return { maxRetries: 7, baseDelay: 3000, maxDelay: 15000 };
  }
};
