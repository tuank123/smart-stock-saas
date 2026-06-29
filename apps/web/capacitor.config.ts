import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.stokpilot.app',
  appName: 'StokPilot',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
    url: 'http://192.168.1.165:3001',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#000000',
      showSpinner: false,
    },
  },
};

export default config;
