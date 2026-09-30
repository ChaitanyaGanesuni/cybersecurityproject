import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.octoberarc',
  appName: 'October Arc',
  webDir: 'dist',
  android: {
    // Only needed when talking to a plain-http October Arc server on a LAN.
    allowMixedContent: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_arc',
      iconColor: '#FF7A1A',
    },
  },
};

export default config;
