import { ActionCommands, getActionCommandsName } from '../../../lib/ptp/protobuf/ActionCommands';
import { Pdu } from '../../../lib/ptp/protobuf/BaseMsg';
import { SendBotMsgReq } from '../../../lib/ptp/protobuf/PTPMsg';
import BotWebSocket from '../../msg/bot/BotWebSocket';
import { ChatGptStreamStatus } from '../../../lib/ptp/protobuf/PTPCommon/types';

let dispatchers: Record<number, MsgDispatcher> = {};

export default class MsgDispatcher {
  private accountId: number;
  private address?: string;
  constructor(accountId: number) {
    this.accountId = accountId;
  }

  static getInstance(accountId: number) {
    if (!dispatchers[accountId]) {
      dispatchers[accountId] = new MsgDispatcher(accountId);
    }
    return dispatchers[accountId];
  }

  static async handleWsMsg(accountId: number, pdu: Pdu) {
    const dispatcher = MsgDispatcher.getInstance(accountId);
    console.log(
      '[onMessage]',
      getActionCommandsName(pdu.getCommandId()),
      pdu.getSeqNum()
      // pdu.getPbData().slice(0, 16)
    );
    switch (pdu.getCommandId()) {
      case ActionCommands.CID_SendBotMsgReq:
        await dispatcher.handleSendBotMsgReq(pdu);
        break;
    }
  }

  async handleSendBotMsgReq(pdu: Pdu) {
    let { text, chatId, msgDate, msgAskId, senderId, msgAskDate, msgId } =
      SendBotMsgReq.parseMsg(pdu);
    console.log('handleSendBotMsgReq', {
      senderId,
      text,
      chatId,
      msgDate,
      msgAskId,
      msgAskDate,
      msgId,
    });
    BotWebSocket.getCurrentInstance().send(
      new SendBotMsgReq({
        senderId: chatId,
        toUid: senderId,
        text: '...',
        chatId,
        msgDate,
        msgAskId,
        msgAskDate,
        msgId,
        streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_START,
      })
        .pack()
        .getPbData()
    );
    setTimeout(() => {
      BotWebSocket.getCurrentInstance().send(
        new SendBotMsgReq({
          senderId: chatId,
          toUid: senderId,
          text: 'GOING',
          chatId,
          msgDate,
          msgAskId,
          msgAskDate,
          msgId,
          streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_GOING,
        })
          .pack()
          .getPbData()
      );
    }, 1000);

    setTimeout(() => {
      BotWebSocket.getCurrentInstance().send(
        new SendBotMsgReq({
          senderId: chatId,
          toUid: senderId,
          text: 'DONE',
          chatId,
          msgDate,
          msgAskId,
          msgAskDate,
          msgId,
          streamStatus: ChatGptStreamStatus.ChatGptStreamStatus_DONE,
        })
          .pack()
          .getPbData()
      );
    }, 2000);
    // this.sendPdu(
    //   new SendBotMsgRes({
    //     reply:
    //       'reply: ```\n' +
    //       JSON.stringify(
    //         {
    //           msgDate,
    //           msgAskId,
    //           msgAskDate,
    //           msgId,
    //         },
    //         null,
    //         2
    //       ) +
    //       '```',
    //   }).pack(),
    //   pdu.getSeqNum()
    // );
    // if (chatGpt) {
    //   await new ChatGptWorker().process(pdu);
    // }
  }

  private ws: WebSocket | any;
  setWs(ws: WebSocket | any) {
    this.ws = ws;
  }

  setAddress(address: string) {
    this.address = address;
  }
  sendPdu(pdu: Pdu, seqNum: number = 0) {
    console.log('sendPdu', getActionCommandsName(pdu.getCommandId()));
    pdu.updateSeqNo(seqNum);
    this.ws.send(pdu.getPbData());
  }
}
