export const getInitTheme = () => {
  //@ts-ignore
  return window.__THEME;
};

export const getWebPlatform = (): 'web' | 'ios' | 'android' | 'desktop' => {
  //@ts-ignore
  return window.__PLATFORM || 'web';
};

export const getFrontVersion = () => {
  //@ts-ignore
  return window.__FRONT_VERSION || '0.0.0';
};

export const getAppVersion = () => {
  return `${getWebPlatform()}:${getFrontVersion()}`;
};

export const isWebPlatform = async () => {
  return getWebPlatform() === 'web';
};

export type MobileBridgePostEventType = 'WAI_APP_INIT' | 'SET_THEME' | 'WRITE_INPUT';
export type MobileBridgeRecvEventType = 'WAI_WEBVIEW_INIT';

export default class MobileBridge {
  static postEvent(eventName: MobileBridgePostEventType, eventData?: any) {
    setTimeout(() => {
      console.log('MobileBridge postEvent', eventName, eventData);
      if (getWebPlatform() === 'android') {
        // @ts-ignore
        window.WaiBridge.postEvent(eventName, eventData ? JSON.stringify(eventData) : '{}');
      }
      if (getWebPlatform() === 'ios') {
      }
    });
  }
  static onRecvMsg(eventName: MobileBridgeRecvEventType, payload: any) {
    switch (eventName) {
      case 'WAI_WEBVIEW_INIT':
        MobileBridge.postEvent('WRITE_INPUT', { text: 'how are you ?' });
        break;
    }
  }
}
