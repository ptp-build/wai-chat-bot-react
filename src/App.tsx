import React, { useEffect } from 'react';
import BotWebSocket, {
  BotWebSocketNotifyAction,
  BotWebSocketState,
} from './worker/msg/bot/BotWebSocket';
import Account from './worker/share/Account';
import LocalStorage from './worker/share/db/LocalStorage';
import MobileBridge, { getAppVersion, getWebPlatform } from './worker/msg/MobileBridge';
import MsgDispatcher from './worker/share/service/MsgDispatcher';
import { invoke, dialog, process, path, shell } from '@tauri-apps/api';
import './App.css';
// @ts-ignore
let { $ } = window;

if (!$) {
  $ = (selector: string) => {};
}

class OpenAiStream {
  static text: string = '';
  static lastText: string = '';
  static cache: Record<string, boolean> = {};
  static chatId: string;
  static loading: boolean;
  static msgId: number;

  static handleMsgReply(message: string) {
    const v = message;
    if (v.startsWith('[REQUEST]')) {
      const options: any = JSON.parse(v.replace('[REQUEST] ', '').trim());
      const body = JSON.parse(options.body);
      console.log('[REQUEST]', body.messages[0].content.parts[0], body);
      return;
    }

    if (v.startsWith('[ERROR]')) {
      OpenAiStream.loading = false;
      console.log('[ERROR]', v);
      // ipcRenderer.send('onMainMessage', {
      //   action: 'onRecvAiMsg',
      //   payload: {
      //     reply: v,
      //     msgId: OpenAiStream.msgId,
      //     chatId: OpenAiStream.chatId,
      //     // streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_ERROR,
      //   },
      // });
      return;
    }
    if (v === '[START]') {
      console.log('[START]', v);
      // ipcRenderer.send('onMainMessage', {
      //   action: 'onRecvAiMsg',
      //   payload: {
      //     reply: '',
      //     msgId: OpenAiStream.msgId,
      //     chatId: OpenAiStream.chatId,
      //     // streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_START,
      //   },
      // });
      return;
    }
    OpenAiStream.text += v;
    if (OpenAiStream.text.startsWith('data:')) {
      let lines = OpenAiStream.text
        .substring(5)
        .split('data:')
        .filter(row => row !== '')
        .map(row => row.trim());
      if (lines && lines.length > 0) {
        lines.forEach((line, i) => {
          if (line.indexOf('{') === 0 && line.substring(line.length - 1) === '}') {
            try {
              const part = JSON.parse(line).message.content.parts[0];
              if (!OpenAiStream.cache[part]) {
                OpenAiStream.cache[part] = true;
                const msgText = part.replace(OpenAiStream.lastText, '');
                // ipcRenderer.send('onMainMessage', {
                //   action: 'onRecvAiMsg',
                //   payload: {
                //     reply: msgText,
                //     msgId: OpenAiStream.msgId,
                //     chatId: OpenAiStream.chatId,
                //     // streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_GOING,
                //   },
                // });
                console.log('[msgText]', msgText);
                OpenAiStream.lastText = part;
              }
            } catch (e) {}
          } else {
            if (line === '[DONE]') {
              OpenAiStream.loading = false;
              const msgLine = lines[i - 1];
              const msg = JSON.parse(msgLine.trim());
              const msgText = msg.message.content.parts[0];
              console.log('[DONE]', msgText, msg);
              // ipcRenderer.send('onMainMessage', {
              //   action: 'onRecvAiMsg',
              //   payload: {
              //     reply: msgText,
              //     msgId: OpenAiStream.msgId,
              //     chatId: OpenAiStream.chatId,
              //     // streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_DONE,
              //   },
              // });
              return;
            }
          }
        });
      }
    }
  }

  static init(chatId: string, msgId: number) {
    OpenAiStream.chatId = chatId;
    OpenAiStream.msgId = msgId;
    OpenAiStream.text = '';
    OpenAiStream.lastText = '';
    OpenAiStream.cache = {};
    OpenAiStream.loading = true;
  }
}

(function () {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = args[0];
    const options = args[1];
    console.log('on fetch', url);
    if (
      (options && options.signal && typeof url !== 'string') ||
      typeof url !== 'string' ||
      url?.indexOf('backend-api/conversation') > 0
    ) {
      OpenAiStream.handleMsgReply('[REQUEST] ' + JSON.stringify(options));
    }
    // @ts-ignore
    const response = await originalFetch.apply(this, args);
    // @ts-ignore
    if (options && options.signal && url?.indexOf('backend-api/conversation') > 0) {
      if (response.ok) {
        if (response.body && options) {
          const transformStream = new TransformStream({
            transform(chunk, controller) {
              // 将数据传递给原始调用方
              controller.enqueue(chunk);

              // 在这里处理数据
              const decoder = new TextDecoder();
              const v = decoder.decode(chunk);
              OpenAiStream.handleMsgReply(v);
            },
          });

          // 将原始响应的 body 传递给 TransformStream
          response.body.pipeThrough(transformStream);

          return new Response(transformStream.readable, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
          });
        }
      } else {
        OpenAiStream.handleMsgReply('[ERROR] ' + (await response.clone().text()));
      }
    }
    return response;
  };
})();

let initing = false;

function App() {
  useEffect(() => {
    const init = async () => {
      if (initing) {
        return;
      }
      initing = true;
      try {
        Account.setClientKv(new LocalStorage());
        const accountId = Account.getCurrentAccountId();
        console.log('[Account init]', accountId, initing);
        const appVersion = getAppVersion();
        Account.getCurrentAccount()
          ?.setSession(
            's_c469905f9727d79904b2a72f0c330fd6002e31de825a361d3be9e50f27f2fafc6b4d1d27b9c5feffd476e8d8837b655ed7f39c405a62d4b4cdce5ed27b7ddea71b__20117'
          )
          .setClientInfo({
            appVersion,
            deviceModel: '',
            systemVersion: '',
          });

        const botWs = BotWebSocket.getInstance(accountId);
        // const MSG_SERVER = 'wss://wai-chat-bot.ptp-ai.workers.dev/ws';
        // const MSG_SERVER = 'ws://localhost:2235/ws';
        const MSG_SERVER =
          getWebPlatform() === 'web'
            ? 'ws://localhost:2235/ws'
            : 'wss://wai-chat-bot.ptp-ai.workers.dev/ws';

        if (!botWs.isLogged()) {
          botWs.setMsgHandler(async (msgConnId, notifies) => {
            for (let i = 0; i < notifies.length; i++) {
              const { action, payload } = notifies[i];
              switch (action) {
                case BotWebSocketNotifyAction.onConnectionStateChanged:
                  switch (payload.BotWebSocketState) {
                    case BotWebSocketState.logged:
                      console.log('BotWebSocketState.logged');
                      MobileBridge.postEvent('WRITE_INPUT', { text: '写一首散文诗 20字以内' });
                      break;
                    case BotWebSocketState.connected:
                      break;
                    case BotWebSocketState.closed:
                      break;
                  }
                  break;
                case BotWebSocketNotifyAction.onData:
                  // console.log("[onData]",{accountId},getActionCommandsName(payload.getCommandId()))
                  if (payload.getCommandId() === 5001) {
                    console.log('[heartbeat]');
                    if ($('textarea') && $('textarea').length > 0) {
                      console.log('textarea is ok!');
                    }
                    return;
                  }
                  await new MsgDispatcher(accountId).handleSendBotMsgReq(payload);
                  break;
              }
            }
          });
          botWs.setWsUrl(MSG_SERVER);
          if (!botWs.isConnect()) {
            botWs.connect();
          }
          if (botWs.isConnect() && !botWs.isLogged()) {
            await botWs.login();
          }
          await botWs.waitForMsgServerState(BotWebSocketState.logged);
        }
      } catch (e) {
        console.error(e);
      } finally {
        initing = false;
      }
    };
    init().catch(console.error);
  });

  return (
    <div className="App">
      <header className="App-header">
        <img src={require('./logo.png')} className="App-logo" alt="logo" />
        <p>Wai Bot</p>
        <a className="App-link" href="javascript:createWindow()" rel="noopener noreferrer">
          CreatWindow
        </a>
      </header>
    </div>
  );
}

export default App;
