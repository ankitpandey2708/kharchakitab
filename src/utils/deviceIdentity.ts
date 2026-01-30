import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const getFingerprintData = async () => {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result;
  } catch (error) {
    console.error("Failed to load FingerprintJS", error);
    return null;
  }
};

export const parseDeviceName = (components: any): string => {
  if (!components) return "Unknown Device";

  const platformVal = components.platform?.value || '';
  let deviceName = "Device";

  // Basic platform mapping
  if (platformVal.includes('Win')) deviceName = 'Windows PC';
  else if (platformVal.includes('Mac')) deviceName = 'Mac';
  else if (platformVal.includes('Linux')) deviceName = 'Linux PC';
  else if (platformVal.includes('iPhone')) deviceName = 'iPhone';
  else if (platformVal.includes('iPad')) deviceName = 'iPad';
  else if (platformVal.includes('Android')) deviceName = 'Android Device';
  else if (platformVal) deviceName = platformVal;

  const features: string[] = [];

  // Browser Detection (via User Agent)
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent;
    let browser = "";
    if (/Edg/.test(ua)) browser = "Edge";
    else if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
    else if (/Firefox/.test(ua)) browser = "Firefox";
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
    
    if (browser) features.push(browser);
  }

  // Screen Resolution
  // value is typically [width, height]
  if (components.screenResolution?.value) {
      const res = components.screenResolution.value;
      if (Array.isArray(res) && res.length >= 2) {
          const [w, h] = res;
          if (w >= 3800) features.push('4K');
          else if (w >= 2500) features.push('QHD'); 
          else if (w >= 1900) features.push('HD');
      }
  }

  // Touch Support
  if (components.touchSupport?.value) {
      const touch = components.touchSupport.value;
      if (touch.maxTouchPoints > 0) {
          features.push('Touchscreen');
      }
  }
  
  if (features.length > 0) {
      return `${deviceName} (${features.join(', ')})`;
  }
  return deviceName;
};
