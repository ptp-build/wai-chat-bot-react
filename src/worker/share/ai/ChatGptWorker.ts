import { SendBotMsgReq } from '../../../lib/ptp/protobuf/PTPMsg';
import { Pdu } from '../../../lib/ptp/protobuf/BaseMsg';

export class ChatGptWorker {
  private msgId?: number;
  private chatId?: string;
  constructor() {}
  async process(pdu: Pdu, authUserId?: string) {
    let { chatId, msgId, chatGpt, ...other } = SendBotMsgReq.parseMsg(pdu);
    this.chatId = chatId;
    this.msgId = msgId;
    console.log({ chatId, msgId }, chatGpt);
    if (!chatGpt) {
      return;
    }
  }
}
