export const branding = {
  appName: import.meta.env.VITE_APP_NAME || '92Parameters',
  businessName: import.meta.env.VITE_BUSINESS_NAME || '92 PARAMETERS CAFE',
  logoShort: import.meta.env.VITE_LOGO_SHORT || '92',
  logoSubtitle: import.meta.env.VITE_LOGO_SUBTITLE || 'Parameters',
  poweredBy: import.meta.env.VITE_POWERED_BY || '92Parameters',
  logoUrl: import.meta.env.VITE_LOGO_URL || '/logo.png?v=2',
};

export const isDemoSeedEnabled = import.meta.env.VITE_DEMO_SEED === 'true';
