import { ActionCommands, getActionCommandsName } from '../../../lib/ptp/protobuf/ActionCommands';
import { Pdu } from '../../../lib/ptp/protobuf/BaseMsg';
import {AuthSessionType, getSessionInfoFromSign, User} from './User';
import { AuthLoginReq, AuthLoginRes } from '../../../lib/ptp/protobuf/PTPAuth';
import {
  SendBotMsgReq,
  SendBotMsgRes,
  SendMsgRes,
  SendTextMsgReq,
} from '../../../lib/ptp/protobuf/PTPMsg';
import { ERR, UserStoreData_Type } from '../../../lib/ptp/protobuf/PTPCommon/types';
import {PbMsg, PbUser, UserStoreData} from '../../../lib/ptp/protobuf/PTPCommon';
import { SyncReq, SyncRes, TopCatsReq, TopCatsRes } from '../../../lib/ptp/protobuf/PTPSync';
import { ENV, kv, storage } from '../../env';
import { requestOpenAi } from '../functions/openai';
import ChatMsg from './ChatMsg';
import { createParser } from 'eventsource-parser';
import { currentTs } from '../utils/utils';
import UserSetting from './UserSetting';
import { TelegramBot } from './Telegram';
import {MsgBot} from "./msg/MsgBot";
import {ChatGptWorker} from "./ai/ChatGptWorker";
import {DoWebsocket} from "./do/DoWebsocket";

let dispatchers: Record<number, MsgDispatcher> = {};

export default class MsgDispatcher {
  private authUserId: string;
  private accountId: string;
  private address: string;
  constructor(accountId: string) {
    this.accountId = accountId;
  }

  static getInstance(accountId: string) {
    if (!dispatchers[accountId]) {
      dispatchers[accountId] = new MsgDispatcher(accountId);
    }
    return dispatchers[accountId];
  }
  async handleAuthLoginReq(pdu: Pdu): Promise<AuthSessionType | undefined> {
    const { sign, clientInfo } = AuthLoginReq.parseMsg(pdu);
    const res = await getSessionInfoFromSign(sign);
    console.log('[clientInfo]', JSON.stringify(clientInfo));
    console.log('[authSession]', JSON.stringify(res));
    if (res) {
      this.setAuthUserId(res.authUserId);
      this.setAddress(res.address);
      this.sendPdu(
        new AuthLoginRes({
          err: ERR.NO_ERROR,
        }).pack(),
        pdu.getSeqNum()
      );
    }

    return res;
  }
  async handleSyncReq(pdu: Pdu) {
    let { userStoreData } = SyncReq.parseMsg(pdu);
    const authUserId = this.authUserId;
    const userStoreDataStr = await kv.get(`W_U_S_D_${authUserId}`);
    let userStoreDataRes: UserStoreData_Type;
    if (userStoreDataStr) {
      const buf = Buffer.from(userStoreDataStr, 'hex');
      userStoreDataRes = UserStoreData.parseMsg(new Pdu(buf));
      // console.debug('userStoreDataRes', this.address, JSON.stringify(userStoreDataRes));
      if (!userStoreData) {
        this.sendPdu(new SyncRes({ userStoreData: userStoreDataRes }).pack());
        return;
      }
    }
    if (userStoreData) {
      await kv.put(
        `W_U_S_D_${authUserId}`,
        Buffer.from(new UserStoreData(userStoreData).pack().getPbData()).toString('hex')
      );
    }
  }
  async handleSendTextMsgReq(pdu: Pdu) {
    let req = SendTextMsgReq.parseMsg(pdu);
    const { authUserId } = this;
    const msg = PbMsg.parseMsg(new Pdu(Buffer.from(req.msg!)));
    if(msg.senderId === "1"){
      msg.senderId = authUserId
    }
    console.debug('handleSendTextMsgReq',msg);
    const text = msg.content.text?.text
    const chatId = msg.chatId
    const msgId = msg.id
    const replyToUserId = msg.replyToUserId
    const res = await storage.get(`wai/users/${chatId}`);
    if (res) {
      const chatOwnerUserId = await User.getBotOwnerUserID(chatId);
      if (chatOwnerUserId !== authUserId) {
        const user = PbUser.parseMsg(new Pdu(Buffer.from(res)));
        const tg = await new UserSetting(chatOwnerUserId).getValue(chatId + '/link/tg');
        console.log(authUserId, chatOwnerUserId, tg);
        // const dd = await new UserSetting(chatOwnerUserId).getValue(chatId + '/link/dd');

        if (tg && tg.split('@').length === 2) {
          const [tgToken, tgChatId] = tg.split('@');
          let url = 'https://wai.chat/#' + chatId;
          const resDo = await new DoWebsocket().sendMsg({
            toUserId: chatOwnerUserId,
            fromUserId: authUserId,
            text:text!,
            chatId,
          })
          if (resDo.status === 404) {
            new TelegramBot(tgToken).replyUrlButton(text!,`${user.firstName}`,url,tgChatId).catch(console.error);
          }
        }
      } else {
        if(replyToUserId){
          await new DoWebsocket().sendMsg({
            toUserId: replyToUserId,
            fromUserId: chatId,
            text:text!,
            chatId,
          })
        }
        await new MsgBot(authUserId,chatId,msg).saveMsg()
      }
    }

    this.sendPdu(
      new SendMsgRes({
        chatId,
        msgId,
        senderId: chatId,
        date: currentTs(),
        replyText: '',
      }).pack(),
      pdu.getSeqNum()
    );
  }
  async handleSendBotMsgReq(pdu: Pdu) {
    let { text, chatId, msgDate,msgAskId,msgAskDate, msgId, chatGpt } = SendBotMsgReq.parseMsg(pdu);
    console.log('handleSendBotMsgReq', { text, chatId, msgId, chatGpt });
    const accounts = await new DoWebsocket().getAccounts();
    this.sendPdu(
      new SendBotMsgRes({
        reply: 'reply: ```\n' + JSON.stringify({
          accounts,msgDate,msgAskId,msgAskDate,msgId
        },null,2) + "```",
      }).pack(),
      pdu.getSeqNum()
    );
    if (chatGpt) {
      await new ChatGptWorker().process(pdu,this.authUserId);
    }
  }

  async handleTopCatsReq(pdu: Pdu) {
    // const { time } = TopCatsReq.parseMsg(pdu);
    // const str = await kv.get('topCats-cn.json');
    //
    // let topCats;
    // if (str) {
    //   topCats = JSON.parse(str);
    // } else {
    //   return;
    // }
    // let payload: any = {};
    // console.log('handleTopCatsReq', time, topCats.time, time < topCats.time);
    // if (time < topCats.time) {
    //   payload = {
    //     topSearchPlaceHolder: '编程 写作 旅游...',
    //     cats: topCats.cats,
    //   };
    // }
    // const bots: any[] = [];
    // topCats.bots.forEach(bot => {
    //   if (bot.time > time) {
    //     bots.push(bot);
    //   }
    // });
    // if (bots.length > 0) {
    //   payload.bots = bots;
    // }
    this.sendPdu(
      new TopCatsRes({
        // payload: JSON.stringify(payload),
      }).pack(),
      pdu.getSeqNum()
    );
  }
  static async handleUpdateCmdReq(pdu: Pdu, ws?: WebSocket) {}
  static async handleWsMsg(accountId: string, pdu) {
    const dispatcher = MsgDispatcher.getInstance(accountId);
    console.log(
      '[onMessage]',
      getActionCommandsName(pdu.getCommandId()),
      pdu.getSeqNum()
      // pdu.getPbData().slice(0, 16)
    );
    switch (pdu.getCommandId()) {
      case ActionCommands.CID_SyncReq:
        await dispatcher.handleSyncReq(pdu);
        break;
      case ActionCommands.CID_UpdateCmdReq:
        await dispatcher.handleUpdateCmdReq(pdu);
        break;
      case ActionCommands.CID_TopCatsReq:
        await dispatcher.handleTopCatsReq(pdu);
        break;
      case ActionCommands.CID_SendBotMsgReq:
        await dispatcher.handleSendBotMsgReq(pdu);
        break;
      case ActionCommands.CID_SendTextMsgReq:
        await dispatcher.handleSendTextMsgReq(pdu);
        break;
      case ActionCommands.CID_ShareBotReq:
        await dispatcher.handleShareBotReq(pdu);
        break;
      case ActionCommands.CID_ShareBotStopReq:
        await dispatcher.handleShareBotStopReq(pdu);
        break;
    }
  }

  private ws: WebSocket | any;
  setWs(ws: WebSocket | any) {
    this.ws = ws;
  }

  setAuthUserId(authUserId: string) {
    this.authUserId = authUserId;
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
